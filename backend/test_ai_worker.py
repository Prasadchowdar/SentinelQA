"""
Test script to verify AI Vision integration works correctly.
Run this to check if OpenAI API key is configured properly.
"""

import asyncio
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add parent directory to path to import worker
sys.path.insert(0, os.path.dirname(__file__))

from worker import AuthenticationAwareWorker


async def test_ai_worker():
    """Test the AI-powered worker with a simple instruction"""
    
    print("=" * 60)
    print("Testing AI-Powered Worker")
    print("=" * 60)
    
    # Check if API key is configured
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key or api_key == "your_openai_api_key_here":
        print("\n❌ ERROR: OPENAI_API_KEY not configured!")
        print("\nPlease:")
        print("1. Get an API key from: https://platform.openai.com/api-keys")
        print("2. Edit backend/.env and replace 'your_openai_api_key_here' with your actual key")
        print("\nExample:")
        print('OPENAI_API_KEY=sk-proj-abc123...')
        return
    
    print(f"\n✓ OpenAI API Key configured (starts with: {api_key[:15]}...)")
    
    # Initialize worker
    print("\n✓ Initializing AI Worker...")
    worker = AuthenticationAwareWorker()
    
    if not worker.ai_controller:
        print("❌ AI Controller failed to initialize")
        return
    
    print("✓ AI Controller initialized successfully")
    
    # Run a simple test
    print("\n" + "=" * 60)
    print("Running Test: Navigate to Google and click search")
    print("=" * 60)
    
    test_url = "https://www.google.com"
    test_instruction = "click on the search button"
    
    print(f"\nURL: {test_url}")
    print(f"Instruction: {test_instruction}")
    print("\nExecuting... (this may take 30-60 seconds)\n")
    
    try:
        result = await worker.run_test(test_url, test_instruction)
        
        print("\n" + "=" * 60)
        print("Test Results")
        print("=" * 60)
        print(f"\nStatus: {result['status'].upper()}")
        print(f"Duration: {result['duration_ms']/1000:.2f} seconds")
        print(f"\nAI Summary:")
        print(result['ai_summary'])
        
        if result.get('execution_log'):
            print(f"\nExecution Log:")
            for log_entry in result['execution_log']:
                print(f"  {log_entry}")
        
        if result.get('video_path'):
            print(f"\n✓ Video saved to: {result['video_path']}")
        
        if result['status'] == 'pass':
            print("\n✅ TEST PASSED - AI integration is working!")
        else:
            print(f"\n⚠️  TEST FAILED: {result.get('bug_summary')}")
            
    except Exception as e:
        print(f"\n❌ Test execution failed with error:")
        print(f"   {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_ai_worker())
