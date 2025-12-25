from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Header, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient
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

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'sentinel-qa-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 168  # 7 days

# Create the main app
print("=" * 60)
print("LOADING SERVER.PY FROM:", __file__)
print("=" * 60)
app = FastAPI(title="SentinelQA Enterprise API")

@app.get("/")  # Probe to verify server is running
async def health_check():
    return {"status": "ok", "message": "Backend is running"}


# Configure CORS
origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ============== MODELS ==============

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
    role: str  # owner, admin, viewer
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
    github_repo: Optional[str] = None  # e.g., "owner/repo"
    github_token: Optional[str] = None  # GitHub personal access token
    github_webhook_secret: Optional[str] = None  # For signature verification
    status: str = "idle"  # idle, running, pass, fail
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
    status: str  # running, pass, fail
    duration_ms: Optional[int] = None
    ai_summary: Optional[str] = None
    bug_summary: Optional[str] = None
    video_url: Optional[str] = None
    video_path: Optional[str] = None  # Full path to the video file
    started_at: datetime
    completed_at: Optional[datetime] = None

class Integration(BaseModel):
    model_config = ConfigDict(extra="ignore")
    integration_id: str
    org_id: str
    type: str  # github, jira, slack
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
    
    # Check if it's a session token (Google OAuth)
    session = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if session:
        expires_at = session.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
        
        user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    
    # Try JWT token
    try:
        payload = jwt.decode(session_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"user_id": payload["user_id"]}, {"_id": 0})
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
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
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
    await db.users.insert_one(user_doc)
    
    # Create default organization
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    await db.organizations.insert_one({
        "org_id": org_id,
        "name": f"{user_data.name}'s Workspace",
        "owner_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    await db.org_members.insert_one({
        "member_id": f"member_{uuid.uuid4().hex[:12]}",
        "org_id": org_id,
        "user_id": user_id,
        "role": "owner",
        "joined_at": datetime.now(timezone.utc).isoformat()
    })
    
    token = create_jwt_token(user_id)
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
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
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if not verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_jwt_token(user["user_id"])
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
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

@api_router.post("/auth/session")
async def create_session_from_oauth(request: Request, response: Response):
    """Exchange session_id from Google OAuth for user data"""
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session ID")
    
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "http://localhost:8000/api/auth/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session")
        oauth_data = resp.json()
    
    # Find or create user
    user = await db.users.find_one({"email": oauth_data["email"]}, {"_id": 0})
    
    if not user:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": oauth_data["email"],
            "name": oauth_data["name"],
            "picture": oauth_data.get("picture"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
        
        # Create default organization
        org_id = f"org_{uuid.uuid4().hex[:12]}"
        await db.organizations.insert_one({
            "org_id": org_id,
            "name": f"{oauth_data['name']}'s Workspace",
            "owner_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        await db.org_members.insert_one({
            "member_id": f"member_{uuid.uuid4().hex[:12]}",
            "org_id": org_id,
            "user_id": user_id,
            "role": "owner",
            "joined_at": datetime.now(timezone.utc).isoformat()
        })
        user = user_doc
    else:
        user_id = user["user_id"]
        # Update user info
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": oauth_data["name"], "picture": oauth_data.get("picture")}}
        )
    
    # Store session
    session_token = oauth_data.get("session_token", f"session_{uuid.uuid4().hex}")
    await db.user_sessions.insert_one({
        "user_id": user.get("user_id", user_id),
        "session_token": session_token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=7 * 24 * 3600,
        path="/"
    )
    
    return {
        "user_id": user.get("user_id", user_id),
        "email": oauth_data["email"],
        "name": oauth_data["name"],
        "picture": oauth_data.get("picture"),
        "token": session_token
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
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/")
    return {"message": "Logged out successfully"}

# ============== ORGANIZATION ENDPOINTS ==============

@api_router.get("/organizations", response_model=List[Organization])
async def get_organizations(user: dict = Depends(get_current_user)):
    memberships = await db.org_members.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).to_list(100)
    
    org_ids = [m["org_id"] for m in memberships]
    orgs = await db.organizations.find(
        {"org_id": {"$in": org_ids}},
        {"_id": 0}
    ).to_list(100)
    
    # Parse dates
    for org in orgs:
        if isinstance(org.get("created_at"), str):
            org["created_at"] = datetime.fromisoformat(org["created_at"])
    
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
    await db.organizations.insert_one(org_doc)
    
    await db.org_members.insert_one({
        "member_id": f"member_{uuid.uuid4().hex[:12]}",
        "org_id": org_id,
        "user_id": user["user_id"],
        "role": "owner",
        "joined_at": datetime.now(timezone.utc).isoformat()
    })
    
    org_doc["created_at"] = datetime.fromisoformat(org_doc["created_at"])
    return org_doc

@api_router.get("/organizations/{org_id}")
async def get_organization(org_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    org = await db.organizations.find_one({"org_id": org_id}, {"_id": 0})
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    
    if isinstance(org.get("created_at"), str):
        org["created_at"] = datetime.fromisoformat(org["created_at"])
    
    return {**org, "role": membership["role"]}

@api_router.get("/organizations/{org_id}/members")
async def get_org_members(org_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    members = await db.org_members.find({"org_id": org_id}, {"_id": 0}).to_list(100)
    
    result = []
    for m in members:
        member_user = await db.users.find_one({"user_id": m["user_id"]}, {"_id": 0})
        if member_user:
            result.append({
                "member_id": m["member_id"],
                "user_id": m["user_id"],
                "email": member_user["email"],
                "name": member_user["name"],
                "picture": member_user.get("picture"),
                "role": m["role"],
                "joined_at": m["joined_at"]
            })
    
    return result

@api_router.post("/organizations/{org_id}/invite")
async def invite_member(org_id: str, invite: OrgInvite, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members")
    
    invited_user = await db.users.find_one({"email": invite.email}, {"_id": 0})
    if not invited_user:
        raise HTTPException(status_code=404, detail="User not found. They need to sign up first.")
    
    existing = await db.org_members.find_one(
        {"org_id": org_id, "user_id": invited_user["user_id"]}
    )
    if existing:
        raise HTTPException(status_code=400, detail="User is already a member")
    
    await db.org_members.insert_one({
        "member_id": f"member_{uuid.uuid4().hex[:12]}",
        "org_id": org_id,
        "user_id": invited_user["user_id"],
        "role": invite.role,
        "joined_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Successfully invited {invite.email}"}

@api_router.delete("/organizations/{org_id}/members/{member_id}")
async def remove_member(org_id: str, member_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can remove members")
    
    target = await db.org_members.find_one({"member_id": member_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    
    if target["role"] == "owner":
        raise HTTPException(status_code=400, detail="Cannot remove the owner")
    
    await db.org_members.delete_one({"member_id": member_id})
    return {"message": "Member removed"}

# ============== PROJECT ENDPOINTS ==============

@api_router.get("/organizations/{org_id}/projects", response_model=List[Project])
async def get_projects(org_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    projects = await db.projects.find({"org_id": org_id}, {"_id": 0}).to_list(100)
    
    for p in projects:
        if isinstance(p.get("created_at"), str):
            p["created_at"] = datetime.fromisoformat(p["created_at"])
        if isinstance(p.get("last_run"), str):
            p["last_run"] = datetime.fromisoformat(p["last_run"])
    
    return projects

@api_router.post("/organizations/{org_id}/projects", response_model=Project)
async def create_project(org_id: str, project_data: ProjectCreate, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
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
    await db.projects.insert_one(project_doc)
    
    project_doc["created_at"] = datetime.fromisoformat(project_doc["created_at"])
    del project_doc["webhook_token"]
    return project_doc

@api_router.get("/organizations/{org_id}/projects/{project_id}")
async def get_project(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    project = await db.projects.find_one(
        {"project_id": project_id, "org_id": org_id},
        {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if isinstance(project.get("created_at"), str):
        project["created_at"] = datetime.fromisoformat(project["created_at"])
    if isinstance(project.get("last_run"), str):
        project["last_run"] = datetime.fromisoformat(project["last_run"])
    
    return project

@api_router.put("/organizations/{org_id}/projects/{project_id}", response_model=Project)
async def update_project(
    org_id: str, 
    project_id: str, 
    updates: ProjectUpdate, 
    user: dict = Depends(get_current_user)
):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can update projects")
    
    update_data = {k: v for k, v in updates.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No updates provided")
    
    await db.projects.update_one(
        {"project_id": project_id, "org_id": org_id},
        {"$set": update_data}
    )
    
    project = await db.projects.find_one(
        {"project_id": project_id, "org_id": org_id},
        {"_id": 0}
    )
    
    if isinstance(project.get("created_at"), str):
        project["created_at"] = datetime.fromisoformat(project["created_at"])
    if isinstance(project.get("last_run"), str):
        project["last_run"] = datetime.fromisoformat(project["last_run"])
    
    return project

@api_router.delete("/organizations/{org_id}/projects/{project_id}")
async def delete_project(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can delete projects")
    
    result = await db.projects.delete_one({"project_id": project_id, "org_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Delete associated test runs
    await db.test_runs.delete_many({"project_id": project_id})
    
    return {"message": "Project deleted"}

@api_router.get("/organizations/{org_id}/projects/{project_id}/webhook")
async def get_webhook_url(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    project = await db.projects.find_one(
        {"project_id": project_id, "org_id": org_id},
        {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    backend_url = os.environ.get('BACKEND_URL', 'http://localhost:8000')
    webhook_url = f"{backend_url}/api/webhooks/github/{project.get('webhook_token', '')}"
    
    return {"webhook_url": webhook_url, "webhook_token": project.get("webhook_token", "")}

# ============== TEST RUN ENDPOINTS ==============

@api_router.get("/organizations/{org_id}/projects/{project_id}/runs", response_model=List[TestRun])
async def get_test_runs(org_id: str, project_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    runs = await db.test_runs.find(
        {"project_id": project_id},
        {"_id": 0}
    ).sort("started_at", -1).to_list(50)
    
    for r in runs:
        if isinstance(r.get("started_at"), str):
            r["started_at"] = datetime.fromisoformat(r["started_at"])
        if isinstance(r.get("completed_at"), str):
            r["completed_at"] = datetime.fromisoformat(r["completed_at"])
    
    return runs


# =====================================================
# Background Task Helper for Non-Blocking Test Execution
# =====================================================

async def execute_test_background(run_id: str, project_id: str, url: str, instruction: str, project_data: dict = None, commit_sha: str = None):
    """
    Runs the worker in the background and updates the DB with results.
    This allows the API to respond immediately while the test runs.
    """
    logging.info(f"🚀 Starting background test for {run_id}")
    
    # Lazy import to avoid circular dependencies
    from worker import AuthenticationAwareWorker
    worker = AuthenticationAwareWorker()
    
    try:
        # Run the actual test (Takes 30s+)
        result = await worker.run_test(url, instruction)
        
        # 🔧 FIX VIDEO URL: Convert file path to accessible URL
        final_video_url = None
        if result.get("video_path"):
            # Extract just the filename (e.g., "run_123.webm")
            filename = os.path.basename(result["video_path"])
            # Create the URL that matches the /videos/{filename} endpoint
            backend_url = os.environ.get('BACKEND_URL', 'http://localhost:8000')
            final_video_url = f"{backend_url}/videos/{filename}"

        # Update Test Run in DB
        await db.test_runs.update_one(
            {"run_id": run_id},
            {"$set": {
                "status": result["status"],
                "duration_ms": result["duration_ms"],
                "ai_summary": result["ai_summary"],
                "bug_summary": result["bug_summary"],
                "video_url": final_video_url,  # <--- Saving to video_url for Frontend
                "video_path": result.get("video_path"),
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        
        # Update Project Status
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": result["status"], "last_run": datetime.now(timezone.utc).isoformat()}}
        )
        
        # Post to GitHub if needed
        if commit_sha and project_data:
            await post_github_status(
                project_data, 
                commit_sha, 
                result["status"], 
                result.get("ai_summary", "")[:140]
            )
            
        logging.info(f"✅ Finished background test {run_id}: {result['status']}")
        
    except Exception as e:
        logging.error(f"❌ Background test failed: {e}")
        await db.test_runs.update_one(
            {"run_id": run_id},
            {"$set": {
                "status": "fail", 
                "ai_summary": f"System Error: {str(e)}",
                "completed_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "fail"}}
        )


@api_router.post("/organizations/{org_id}/projects/{project_id}/run")
async def trigger_test_run(
    org_id: str, 
    project_id: str, 
    background_tasks: BackgroundTasks,  # <--- Inject BackgroundTasks
    user: dict = Depends(get_current_user)
):
    """Trigger a test run - returns immediately while test executes in background"""
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    project = await db.projects.find_one(
        {"project_id": project_id, "org_id": org_id},
        {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Create test run record
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    run_doc = {
        "run_id": run_id,
        "project_id": project_id,
        "status": "running",
        "duration_ms": None,
        "ai_summary": "Test initiated...",
        "bug_summary": None,
        "video_url": None,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None
    }
    await db.test_runs.insert_one(run_doc)
    
    # Update project status immediately
    await db.projects.update_one(
        {"project_id": project_id},
        {"$set": {"status": "running", "last_run": datetime.now(timezone.utc).isoformat()}}
    )
    
    # ⚡ HAND OFF TO BACKGROUND TASK - Returns immediately!
    background_tasks.add_task(
        execute_test_background, 
        run_id, 
        project_id, 
        project["production_url"], 
        project.get("ai_instruction", "Check for errors")
    )
    
    # Return immediately - frontend polls for updates
    return {"run_id": run_id, "status": "running", "message": "Test started in background"}

@api_router.get("/organizations/{org_id}/projects/{project_id}/runs/{run_id}")
async def get_test_run(org_id: str, project_id: str, run_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    run = await db.test_runs.find_one(
        {"run_id": run_id, "project_id": project_id},
        {"_id": 0}
    )
    if not run:
        raise HTTPException(status_code=404, detail="Test run not found")
    
    if isinstance(run.get("started_at"), str):
        run["started_at"] = datetime.fromisoformat(run["started_at"])
    if isinstance(run.get("completed_at"), str):
        run["completed_at"] = datetime.fromisoformat(run["completed_at"])
    
    return run

# ============== WEBHOOK ENDPOINTS ==============

@api_router.post("/webhooks/github/{webhook_token}")
async def github_webhook(webhook_token: str, payload: WebhookPayload):
    project = await db.projects.find_one(
        {"webhook_token": webhook_token},
        {"_id": 0}
    )
    if not project:
        raise HTTPException(status_code=404, detail="Invalid webhook token")
    
    # Trigger test on staging URL
    run_id = f"run_{uuid.uuid4().hex[:12]}"
    import random
    test_passed = random.choice([True, True, False])
    
    run_doc = {
        "run_id": run_id,
        "project_id": project["project_id"],
        "status": "pass" if test_passed else "fail",
        "duration_ms": random.randint(5000, 30000),
        "ai_summary": "CI/CD triggered test completed." if test_passed else "CI/CD test failed: Login form validation error.",
        "bug_summary": None if test_passed else "Login validation error",
        "video_url": f"/mock-videos/{run_id}.mp4",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "trigger": "github_webhook"
    }
    await db.test_runs.insert_one(run_doc)
    
    await db.projects.update_one(
        {"project_id": project["project_id"]},
        {"$set": {"status": "pass" if test_passed else "fail", "last_run": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "Webhook received", "run_id": run_id}

# ============== INTEGRATIONS ENDPOINTS ==============

@api_router.get("/organizations/{org_id}/integrations")
async def get_integrations(org_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    integrations = await db.integrations.find(
        {"org_id": org_id},
        {"_id": 0}
    ).to_list(50)
    
    for i in integrations:
        if isinstance(i.get("created_at"), str):
            i["created_at"] = datetime.fromisoformat(i["created_at"])
    
    return integrations

@api_router.post("/organizations/{org_id}/integrations")
async def create_integration(org_id: str, data: IntegrationCreate, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can manage integrations")
    
    integration_id = f"int_{uuid.uuid4().hex[:12]}"
    integration_doc = {
        "integration_id": integration_id,
        "org_id": org_id,
        "type": data.type,
        "config": data.config,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.integrations.insert_one(integration_doc)
    
    integration_doc["created_at"] = datetime.fromisoformat(integration_doc["created_at"])
    return integration_doc

@api_router.delete("/organizations/{org_id}/integrations/{integration_id}")
async def delete_integration(org_id: str, integration_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    if not membership or membership["role"] not in ["owner", "admin"]:
        raise HTTPException(status_code=403, detail="Only owners and admins can manage integrations")
    
    result = await db.integrations.delete_one({"integration_id": integration_id, "org_id": org_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Integration not found")
    
    return {"message": "Integration deleted"}

# ============== STATS ENDPOINTS ==============

@api_router.get("/organizations/{org_id}/stats")
async def get_org_stats(org_id: str, user: dict = Depends(get_current_user)):
    membership = await db.org_members.find_one(
        {"org_id": org_id, "user_id": user["user_id"]}
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Not a member of this organization")
    
    projects = await db.projects.find({"org_id": org_id}, {"_id": 0}).to_list(100)
    project_ids = [p["project_id"] for p in projects]
    
    total_runs = await db.test_runs.count_documents({"project_id": {"$in": project_ids}})
    passed_runs = await db.test_runs.count_documents({"project_id": {"$in": project_ids}, "status": "pass"})
    failed_runs = await db.test_runs.count_documents({"project_id": {"$in": project_ids}, "status": "fail"})
    
    passing_projects = len([p for p in projects if p.get("status") == "pass"])
    failing_projects = len([p for p in projects if p.get("status") == "fail"])
    
    return {
        "total_projects": len(projects),
        "passing_projects": passing_projects,
        "failing_projects": failing_projects,
        "total_runs": total_runs,
        "passed_runs": passed_runs,
        "failed_runs": failed_runs,
        "pass_rate": round(passed_runs / total_runs * 100, 1) if total_runs > 0 else 0
    }

# ============== ROOT ==============

@api_router.get("/")
async def root():
    return {"message": "SentinelQA Enterprise API", "version": "1.0.0"}

# ============== VIDEO SERVING ==============

@app.get("/videos/{video_filename}")
async def get_video(video_filename: str):
    """
    Serve video files from the videos directory.
    This endpoint is on the main app (not api_router) to avoid /api prefix.
    """
    # Security: Allow both .webm and .mp4 video formats
    if not (video_filename.endswith(".webm") or video_filename.endswith(".mp4")):
        raise HTTPException(status_code=400, detail="Only .webm and .mp4 videos are supported")
    
    # Remove any path separators to prevent directory traversal
    safe_filename = video_filename.replace("/", "").replace("\\", "")
    
    video_path = ROOT_DIR / "videos" / safe_filename
    
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    
    if not video_path.is_file():
        raise HTTPException(status_code=400, detail="Invalid video path")
    
    # Determine media type based on extension
    media_type = "video/webm" if video_filename.endswith(".webm") else "video/mp4"
    
    # Return video file with proper content type
    return FileResponse(
        path=str(video_path),
        media_type=media_type,
        filename=safe_filename
    )

# Include the router in the main app
print(f"Registering {len(api_router.routes)} API routes with /api prefix...")
app.include_router(api_router)


# =====================================================
# GitHub Webhook Integration
# =====================================================

async def post_github_status(project: dict, commit_sha: str, status: str, description: str):
    """Post commit status to GitHub repository"""
    if not project.get("github_repo") or not project.get("github_token"):
        logging.info("GitHub repo or token not configured, skipping status update")
        return False
    
    repo = project["github_repo"]  # format: "owner/repo"
    github_token = project["github_token"]
    url = f"https://api.github.com/repos/{repo}/statuses/{commit_sha}"
    
    state = "success" if status == "pass" else "failure"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {github_token}",
                    "Accept": "application/vnd.github.v3+json"
                },
                json={
                    "state": state,
                    "description": description[:140] if description else "Test completed",
                    "context": "SentinelQA/ai-test"
                },
                timeout=30.0
            )
        
        if response.status_code == 201:
            logging.info(f"Posted GitHub status for {commit_sha[:7]}: {state}")
            return True
        else:
            logging.error(f"Failed to post GitHub status: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logging.error(f"Error posting GitHub status: {e}")
        return False


@app.post("/api/webhooks/github/{project_id}")
async def github_webhook(
    project_id: str,
    request: Request,
    background_tasks: BackgroundTasks,  # <--- Inject BackgroundTasks for non-blocking
    x_hub_signature_256: str = Header(None, alias="X-Hub-Signature-256")
):
    """
    Handle GitHub webhook events.
    Triggers test runs on push/PR events.
    
    Setup in GitHub:
    1. Go to repo Settings -> Webhooks -> Add webhook
    2. Payload URL: https://your-domain/api/webhooks/github/{project_id}
    3. Content type: application/json
    4. Secret: (same as github_webhook_secret in project settings)
    5. Events: Push, Pull requests
    """
    # Get project
    project = await db.projects.find_one({"project_id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    webhook_secret = project.get("github_webhook_secret")
    
    # Get raw body for signature verification
    body = await request.body()
    
    # Verify signature if secret is configured
    if webhook_secret:
        if not x_hub_signature_256:
            raise HTTPException(status_code=401, detail="Missing signature header")
        
        signature = hmac.new(
            webhook_secret.encode(),
            body,
            hashlib.sha256
        ).hexdigest()
        
        expected_signature = f"sha256={signature}"
        if not hmac.compare_digest(expected_signature, x_hub_signature_256):
            logging.warning(f"Invalid webhook signature for project {project_id}")
            raise HTTPException(status_code=401, detail="Invalid signature")
    
    # Parse event
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    event_type = request.headers.get("X-GitHub-Event", "unknown")
    logging.info(f"GitHub webhook received: {event_type} for project {project_id}")
    
    # Handle push events
    if event_type == "push":
        ref = payload.get("ref", "")
        branch = ref.split("/")[-1] if ref else "unknown"
        commit_sha = payload.get("after", "")
        head_commit = payload.get("head_commit", {})
        commit_message = head_commit.get("message", "No message")[:100]
        pusher = payload.get("pusher", {}).get("name", "Unknown")
        
        logging.info(f"Push event: {pusher} pushed to {branch}: {commit_sha[:7]} - {commit_message}")
        
        # Only run tests on main/master branches
        if branch not in ["main", "master"]:
            return {"message": f"Skipping push to {branch} branch", "status": "skipped"}
        
        # Create test run
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        run_doc = {
            "run_id": run_id,
            "project_id": project_id,
            "status": "running",
            "trigger": "github_push",
            "github_commit": commit_sha,
            "github_branch": branch,
            "github_message": commit_message,
            "duration_ms": None,
            "ai_summary": None,
            "bug_summary": None,
            "video_path": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None
        }
        await db.test_runs.insert_one(run_doc)
        
        # Update project status
        await db.projects.update_one(
            {"project_id": project_id},
            {"$set": {"status": "running", "last_run": datetime.now(timezone.utc).isoformat()}}
        )
        
        # ⚡ HAND OFF TO BACKGROUND TASK - Responds within GitHub's 10s timeout!
        background_tasks.add_task(
            execute_test_background,
            run_id,
            project_id,
            project["production_url"],
            project.get("ai_instruction", "Navigate and verify page loads"),
            project,  # Pass project data for GitHub status update
            commit_sha
        )
        
        # Return immediately to satisfy GitHub webhook timeout
        return {
            "message": "Webhook received, test started in background",
            "run_id": run_id,
            "status": "running",
            "branch": branch,
            "commit": commit_sha[:7]
        }
    
    # Handle pull request events
    elif event_type == "pull_request":
        action = payload.get("action", "")
        pr = payload.get("pull_request", {})
        pr_number = payload.get("number", 0)
        head_sha = pr.get("head", {}).get("sha", "")
        title = pr.get("title", "")[:100]
        
        logging.info(f"PR event: #{pr_number} {action} - {title}")
        
        # Only run on opened or synchronized (new commits pushed)
        if action not in ["opened", "synchronize"]:
            return {"message": f"Skipping PR action: {action}", "status": "skipped"}
        
        # Similar logic to push - create run and execute
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        run_doc = {
            "run_id": run_id,
            "project_id": project_id,
            "status": "running",
            "trigger": "github_pr",
            "github_commit": head_sha,
            "github_pr": pr_number,
            "github_message": title,
            "duration_ms": None,
            "ai_summary": None,
            "bug_summary": None,
            "video_path": None,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "completed_at": None
        }
        await db.test_runs.insert_one(run_doc)
        
        # ⚡ HAND OFF TO BACKGROUND TASK - Responds within GitHub's 10s timeout!
        background_tasks.add_task(
            execute_test_background,
            run_id,
            project_id,
            project["production_url"],
            project.get("ai_instruction", "Navigate and verify page loads"),
            project,  # Pass project data for GitHub status update
            head_sha
        )
        
        # Return immediately
        return {
            "message": f"PR #{pr_number} webhook received, test started in background",
            "run_id": run_id,
            "status": "running"
        }
    
    # Handle ping event (webhook setup verification)
    elif event_type == "ping":
        zen = payload.get("zen", "")
        hook_id = payload.get("hook_id", "")
        logging.info(f"GitHub webhook ping received: {zen}")
        return {"message": "Pong! Webhook configured successfully", "hook_id": hook_id}
    
    # Unknown event
    return {"message": f"Event '{event_type}' acknowledged but not handled", "status": "ignored"}
print("Routes registered successfully!")

# Duplicate middleware removed


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
