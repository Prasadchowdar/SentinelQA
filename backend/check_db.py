
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError

async def check_connection():
    mongo_url = "mongodb://localhost:27017"
    print(f"Attempting to connect to: {mongo_url}")
    
    try:
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
        # Force a connection verification
        await client.server_info()
        print("SUCCESS: Connected to MongoDB successfully!")
        
        # List databases
        dbs = await client.list_database_names()
        print(f"Available databases: {dbs}")
        
    except ServerSelectionTimeoutError:
        print("ERROR: Could not connect to MongoDB.")
        print("Please ensure 'mongod' is running.")
        print("Try running 'mongod' in a separate terminal.")
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}")

if __name__ == "__main__":
    asyncio.run(check_connection())
