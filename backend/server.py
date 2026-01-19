# Windows asyncio fix - needs to be before other imports
import sys
import asyncio
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Header, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional
import uuid
import os
from pathlib import Path
import jwt
from dotenv import load_dotenv
import logging
import hmac
import hashlib
import httpx
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# In-memory storage
class InMemoryDB:
    def __init__(self):
        self.users: Dict[str, dict] = {}
        self.organizations: Dict[str, dict] = {}
        self.org_members: Dict[str, dict] = {}
        self.projects: Dict[str, dict] = {}
        self.test_runs: Dict[str, dict] = {}
        self.user_sessions: Dict[str, dict] = {}
        self.integrations: Dict[str, dict] = {}

db = InMemoryDB()

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'sentinel-qa-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days

app = FastAPI(title="SentinelQA API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def health_check():
    return {"status": "ok", "message": "SentinelQA Backend is running (In-Memory Mode)"}

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Models

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime

class Organization(BaseModel):
    model_config = ConfigDict(extra="ignore")
    org_id: str
    name: str
    owner_id: str
    created_at: datetime

class OrgCreate(BaseModel):
    name: str

class OrgMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    member_id: str
    org_id: str
    user_id: str
    role: str
    joined_at: datetime

class OrgInvite(BaseModel):
    email: EmailStr
    role: str = "viewer"

class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project_id: str
    org_id: str
    name: str
    description: Optional[str] = None
    production_url: str
    staging_url: Optional[str] = None
    ai_instruction: Optional[str] = None
    frequency: Optional[str] = None
    github_repo: Optional[str] = None
    github_token: Optional[str] = None
    github_webhook_secret: Optional[str] = None
    status: str = "idle"
    last_run: Optional[datetime] = None
    created_at: datetime
    created_by: str

class ProjectCreate(BaseModel):
    name: str
    production_url: str
    staging_url: Optional[str] = None
    ai_instruction: str
    frequency: str = "daily"

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    production_url: Optional[str] = None
    staging_url: Optional[str] = None
    ai_instruction: Optional[str] = None
    frequency: Optional[str] = None

class TestRun(BaseModel):
    model_config = ConfigDict(extra="ignore")
    run_id: str
    project_id: str
    status: str
    duration_ms: Optional[int] = None
    ai_summary: Optional[str] = None
    bug_summary: Optional[str] = None
    video_url: Optional[str] = None
    video_path: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    verifications: Optional[Dict[str, int]] = None
    failure_info: Optional[Dict[str, Any]] = None
    plain_english_explanation: Optional[str] = None
    healing_summary: Optional[Dict[str, Any]] = None

class Integration(BaseModel):
    model_config = ConfigDict(extra="ignore")
    integration_id: str
    org_id: str
    type: str
    config: Dict[str, Any]
    is_active: bool = True
    created_at: datetime

class IntegrationCreate(BaseModel):
    type: str
    config: Dict[str, Any]

class WebhookPayload(BaseModel):
    ref: Optional[str] = None
    repository: Optional[Dict[str, Any]] = None

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_jwt_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(request: Request) -> dict:
    # Check cookie first
    session_token = request.cookies.get("session_token")
    
    # Fall back to Authorization header
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Check if it's a session token
    session = db.user_sessions.get(session_token)
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = db.users.get(session["user_id"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    
    # Try JWT token
    try:
        payload = jwt.decode(session_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = db.users.get(payload["user_id"])
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/register")
async def register(user_data: UserCreate, response: Response):
    # Check if email already exists
    for user in db.users.values():
        if user.get("email") == user_data.email:
            raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "password_hash": hash_password(user_data.password),
        "picture": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    db.users[user_id] = user_doc
    
    # Create default organization
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    db.organizations[org_id] = {
        "org_id": org_id,
        "name": f"{user_data.name}'s Workspace",
        "owner_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    member_id = f"member_{uuid.uuid4().hex[:12]}"
    db.org_members[member_id] = {
        "member_id": member_id,
        "org_id": org_id,
        "user_id": user_id,
        "role": "owner",
        "joined_at": datetime.now(timezone.utc).isoformat()
    }
    
    token = create_jwt_token(user_id)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=False,  # Set to True in production with HTTPS
        samesite="lax",
        max_age=JWT_EXPIRATION_HOURS * 3600,
        path="/"
    )
    
    return {
        "user_id": user_id,
        "email": user_data.email,
        "name": user_data.name,
        "token": token
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin, response: Response):
    # Find user by email
    user = None
    for u in db.users.values():
        if u.get("email") == credentials.email:
            user = u
            break
    
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user["user_id"])
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=JWT_EXPIRATION_HOURS * 3600,
        path="/"
    )
    
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
        "token": token
    }

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture")
    }

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token and session_token in db.user_sessions:
        del db.user_sessions[session_token]
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ============== ORGANIZATION ENDPOINTS ==============

@api_router.get("/organizations", response_model=List[Organization])
async def get_organizations(user: dict = Depends(get_current_user)):
    # Get user's memberships
    user_org_ids = []
    for member in db.org_members.values():
        if member["user_id"] == user["user_id"]:
            user_org_ids.append(member["org_id"])
    
    orgs = []
    for org_id in user_org_ids:
        org = db.organizations.get(org_id)
        if org:
            org_copy = org.copy()
            if isinstance(org_copy.get("created_at"), str):
                org_copy["created_at"] = datetime.fromisoformat(org_copy["created_at"])
            orgs.append(org_copy)
    
    return orgs

@api_router.post("/organizations", response_model=Organization)
async def create_organization(org_data: OrgCreate, user: dict = Depends(get_current_user)):
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    org_doc = {
        "org_id": org_id,
        "name": org_data.name,
        "owner_id": user["user_id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    db.organizations[org_id] = org_doc
    
    member_id = f"member_{uuid.uuid4().hex[:12]}"
    db.org_members[member_id] = {
        "member_id": member_id,
        "org_id": org_id,
        "user_id": user["user_id"],
        "role": "owner",
        "joined_at": datetime.now(timezone.utc).isoformat()
    }
    
    org_doc["created_at"] = datetime.fromisoformat(org_doc["created_at"])
    return org_doc

@api_router.get("/organizations/{org_id}")
async def get_organization(org_id: str, user: dict = Depends(get_current_user)):
    # Check membership
    membership = None
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            membership = member
            break
    
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    org = db.organizations.get(org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    org_copy = org.copy()
    if isinstance(org_copy.get("created_at"), str):
        org_copy["created_at"] = datetime.fromisoformat(org_copy["created_at"])
    
    return {**org_copy, "role": membership["role"]}

@api_router.get("/organizations/{org_id}/members")
async def get_org_members(org_id: str, user: dict = Depends(get_current_user)):
    # Check membership
    is_member = False
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            is_member = True
            break
    
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    result = []
    for member in db.org_members.values():
        if member["org_id"] == org_id:
            member_user = db.users.get(member["user_id"])
            if member_user:
                result.append({
                    "member_id": member["member_id"],
                    "user_id": member["user_id"],
                    "email": member_user["email"],
                    "name": member_user["name"],
                    "picture": member_user.get("picture"),
                    "role": member["role"],
                    "joined_at": member["joined_at"]
                })
    
    return result

@api_router.post("/organizations/{org_id}/invite")
async def invite_member(org_id: str, invite: OrgInvite, user: dict = Depends(get_current_user)):
    # Check if user is owner or admin
    membership = None
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            membership = member
            break
    
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members")
    
    # Find invited user
    invited_user = None
    for u in db.users.values():
        if u["email"] == invite.email:
            invited_user = u
            break
    
    if not invited_user:
        raise HTTPException(status_code=404, detail="User not found. They need to sign up first.")
    
    # Check if already member
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == invited_user["user_id"]:
            raise HTTPException(status_code=400, detail="User is already a member")
    
    member_id = f"member_{uuid.uuid4().hex[:12]}"
    db.org_members[member_id] = {
        "member_id": member_id,
        "org_id": org_id,
        "user_id": invited_user["user_id"],
        "role": invite.role,
        "joined_at": datetime.now(timezone.utc).isoformat()
    }
    
    return {"message": f"Successfully invited {invite.email}"}

@api_router.delete("/organizations/{org_id}/members/{member_id}")
async def remove_member(org_id: str, member_id: str, user: dict = Depends(get_current_user)):
    # Check if user is owner or admin
    membership = None
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            membership = member
            break
    
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can remove members")
    
    target = db.org_members.get(member_id)
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if target["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the owner")
    
    del db.org_members[member_id]
    return {"message": "Member removed"}

# ============== PROJECT ENDPOINTS ==============

@api_router.get("/organizations/{org_id}/projects", response_model=List[Project])
async def get_projects(org_id: str, user: dict = Depends(get_current_user)):
    # Check membership
    is_member = False
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            is_member = True
            break
    
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    projects = []
    for project in db.projects.values():
        if project["org_id"] == org_id:
            p = project.copy()
            if isinstance(p.get("created_at"), str):
                p["created_at"] = datetime.fromisoformat(p["created_at"])
            if isinstance(p.get("last_run"), str):
                p["last_run"] = datetime.fromisoformat(p["last_run"])
            projects.append(p)
    
    return projects

@api_router.post("/organizations/{org_id}/projects", response_model=Project)
async def create_project(org_id: str, project_data: ProjectCreate, user: dict = Depends(get_current_user)):
    # Check if user is owner or admin
    membership = None
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            membership = member
            break
    
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can create projects")
    
    project_id = f"proj_{uuid.uuid4().hex[:12]}"
    project_doc = {
        "project_id": project_id,
        "org_id": org_id,
        "name": project_data.name,
        "production_url": project_data.production_url,
        "staging_url": project_data.staging_url,
        "ai_instruction": project_data.ai_instruction,
        "frequency": project_data.frequency,
        "status": "idle",
        "last_run": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["user_id"],
        "webhook_token": f"wh_{uuid.uuid4().hex}"
    }
    db.projects[project_id] = project_doc
    
    result = project_doc.copy()
    result["created_at"] = datetime.fromisoformat(result["created_at"])
    del result["webhook_token"]
    return result

@api_router.get("/organizations/{org_id}/projects/{project_id}")
async def get_project(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    # Check membership
    is_member = False
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            is_member = True
            break
    
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    project = db.projects.get(project_id)
    if not project or project["org_id"] != org_id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    p = project.copy()
    if isinstance(p.get("created_at"), str):
        p["created_at"] = datetime.fromisoformat(p["created_at"])
    if isinstance(p.get("last_run"), str):
        p["last_run"] = datetime.fromisoformat(p["last_run"])
    
    return p

@api_router.put("/organizations/{org_id}/projects/{project_id}", response_model=Project)
async def update_project(org_id: str, project_id: str, updates: ProjectUpdate, user: dict = Depends(get_current_user)):
    # Check if user is owner or admin
    membership = None
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            membership = member
            break
    
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can update projects")
    
    project = db.projects.get(project_id)
    if not project or project["org_id"] != org_id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    project.update(update_data)
    
    p = project.copy()
    if isinstance(p.get("created_at"), str):
        p["created_at"] = datetime.fromisoformat(p["created_at"])
    if isinstance(p.get("last_run"), str):
        p["last_run"] = datetime.fromisoformat(p["last_run"])
    
    return p

@api_router.delete("/organizations/{org_id}/projects/{project_id}")
async def delete_project(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    # Check if user is owner or admin
    membership = None
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            membership = member
            break
    
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can delete projects")
    
    project = db.projects.get(project_id)
    if not project or project["org_id"] != org_id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    del db.projects[project_id]
    
    # Delete associated test runs
    runs_to_delete = [run_id for run_id, run in db.test_runs.items() if run["project_id"] == project_id]
    for run_id in runs_to_delete:
        del db.test_runs[run_id]
    
    return {"message": "Project deleted"}

# ============== TEST RUN ENDPOINTS ==============

@api_router.get("/organizations/{org_id}/projects/{project_id}/runs", response_model=List[TestRun])
async def get_test_runs(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    # Check membership
    is_member = False
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            is_member = True
            break
    
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    runs = []
    for run in db.test_runs.values():
        if run["project_id"] == project_id:
            r = run.copy()
            if isinstance(r.get("started_at"), str):
                r["started_at"] = datetime.fromisoformat(r["started_at"])
            if isinstance(r.get("completed_at"), str):
                r["completed_at"] = datetime.fromisoformat(r["completed_at"])
            runs.append(r)
    
    # Sort by started_at descending
    runs.sort(key=lambda x: x.get("started_at", datetime.min), reverse=True)
    return runs[:50]

@api_router.post("/organizations/{org_id}/projects/{project_id}/run")
async def run_test(org_id: str, project_id: str, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user)):
    # Check membership
    is_member = False
    for member in db.org_members.values():
        if member["org_id"] == org_id and member["user_id"] == user["user_id"]:
            is_member = True
            break
    
    if not is_member:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    project = db.projects.get(project_id)
    if not project or project["org_id"] != org_id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run_doc = {
        "run_id": run_id,
        "project_id": project_id,
        "status": "running",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "ai_summary": None,
        "video_url": None
    }
    db.test_runs[run_id] = run_doc
    
    # Update project status
    project["status"] = "running"
    project["last_run"] = datetime.now(timezone.utc).isoformat()
    
    # Start background test
    background_tasks.add_task(execute_test, run_id, project)
    
    return {"run_id": run_id, "status": "running", "message": "Test started"}

async def execute_test(run_id: str, project: dict):
    """Execute the AI-powered test in background"""
    try:
        from worker import run_ai_test
        
        result = await run_ai_test(
            url=project["production_url"],
            instruction=project.get("ai_instruction", "Test the website"),
            run_id=run_id
        )
        
        # Update test run
        run = db.test_runs.get(run_id)
        if run:
            run.update({
                "status": result.get("status", "pass"),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "duration_ms": result.get("duration_ms"),
                "ai_summary": result.get("summary"),
                "video_url": result.get("video_url"),
                "video_path": result.get("video_path"),
                "verifications": result.get("verifications"),
                "healing_summary": result.get("healing_summary")
            })
        
        # Update project status
        project["status"] = result.get("status", "pass")
        
    except Exception as e:
        logging.error(f"Test execution failed: {e}")
        run = db.test_runs.get(run_id)
        if run:
            run.update({
                "status": "fail",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "ai_summary": f"Test failed with error: {str(e)}"
            })
        project["status"] = "fail"

# ============== VIDEO ENDPOINTS ==============

@app.get("/videos/{filename}")
async def serve_video(filename: str):
    """Serve recorded test videos"""
    # Sanitize filename
    safe_filename = Path(filename).name
    video_path = ROOT_DIR / "videos" / safe_filename
    
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    
    return FileResponse(
        path=str(video_path),
        media_type="video/webm",
        filename=safe_filename
    )

# Include the API router
app.include_router(api_router)

# ============== STARTUP ==============

@app.on_event("startup")
async def startup_event():
    print("\n" + "=" * 60)
    print("SentinelQA Backend Started Successfully!")
    print("=" * 60)
    print(f"API URL: http://localhost:8000")
    print(f"Docs URL: http://localhost:8000/docs")
    print(f"Mode: In-Memory (no database required)")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
