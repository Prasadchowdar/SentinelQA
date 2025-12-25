import os
from dotenv import load_dotenv

load_dotenv()

key = os.getenv('OPENAI_API_KEY')

if not key or key == 'your_openai_api_key_here':
    print("❌ OPENAI_API_KEY not configured!")
    print("Please edit backend/.env and add your actual API key")
else:
    print(f"✓ API Key configured")
    print(f"✓ Key starts with: {key[:15]}...")
    print(f"✓ Key length: {len(key)} characters")
