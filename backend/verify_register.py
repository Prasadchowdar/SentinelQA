
import requests
import uuid

def test_register():
    url = "http://localhost:8000/api/auth/register"
    # Use a random email to avoid "already exists" errors
    random_str = uuid.uuid4().hex[:6]
    payload = {
        "email": f"test_{random_str}@example.com",
        "password": "password123",
        "name": "Test User"
    }
    
    print(f"Sending request to {url} with payload: {payload}")
    
    # Check health first
    try:
        health = requests.get("http://localhost:8000/")
        print(f"Health Check: {health.status_code} {health.text}")
    except:
        print("Health Check Failed")

    try:
        response = requests.post(url, json=payload, headers={"Content-Type": "application/json"})
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        if response.status_code == 200:
            print("SUCCESS: Registration API is working!")
        else:
            print("FAILURE: Registration API returned an error.")
            
    except Exception as e:
        print(f"ERROR: Could not connect to backend. Is it running? {e}")

if __name__ == "__main__":
    test_register()
