"""
Check what's stored in MongoDB for test runs
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

async def check_test_runs():
    client = AsyncIOMotorClient(os.environ['MONGO_URL'])
    db = client[os.environ['DB_NAME']]
    
    print("=" * 60)
    print("Recent Test Runs (last 5)")
    print("=" * 60)
    
    runs = await db.test_runs.find().sort("started_at", -1).limit(5).to_list(5)
    
    for i, run in enumerate(runs, 1):
        print(f"\n{i}. Run ID: {run.get('run_id')}")
        print(f"   Status: {run.get('status')}")
        print(f"   Started: {run.get('started_at')}")
        print(f"   video_path: {run.get('video_path')}")
        print(f"   video_url: {run.get('video_url')}")
        
        video_path = run.get('video_path')
        if video_path:
            exists = Path(video_path).exists()
            print(f"   File exists: {exists}")
        else:
            print(f"   ⚠️ NO VIDEO_PATH STORED!")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(check_test_runs())

