from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI()

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TestPayload(BaseModel):
    name: str
    email: str
    password: str

@app.get("/")
def root():
    return {"status": "ok", "message": "Minimal test server"}

@app.post("/api/auth/register")
def test_register(payload: TestPayload):
    return {"success": True, "message": f"Got: {payload.email}"}

if __name__ == "__main__":
    print("Starting minimal test server on port 8001...")
    uvicorn.run(app, host="127.0.0.1", port=8001)
