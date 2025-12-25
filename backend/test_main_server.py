import requests

print("=== Testing MAIN server on port 8000 ===\n")

# Test root
print("1. Testing root endpoint:")
try:
    response = requests.get("http://localhost:8000/")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")
except Exception as e:
    print(f"   ERROR: {e}")

# Test /api route
print("\n2. Testing /api endpoint:")
try:
    response = requests.get("http://localhost:8000/api/")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")
except Exception as e:
    print(f"   ERROR: {e}")

# Test OPTIONS on registration
print("\n3. Testing OPTIONS /api/auth/register (CORS preflight):")
try:
    response = requests.options(
        "http://localhost:8000/api/auth/register",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type"
        }
    )
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        cors_headers = {k:v for k,v in response.headers.items() if 'access-control' in k.lower()}
        print(f"   CORS Headers: {cors_headers}")
    else:
        print(f"   Response: {response.text}")
except Exception as e:
    print(f"   ERROR: {e}")

# Test POST registration
print("\n4. Testing POST /api/auth/register:")
try:
    response = requests.post(
        "http://localhost:8000/api/auth/register",
        json={"name": "Test User", "email": "test@example.com", "password": "password123"},
        headers={"Origin": "http://localhost:3000"}
    )
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.text[:200]}")
    cors_headers = {k:v for k,v in response.headers.items() if 'access-control' in k.lower()}
    print(f"   CORS Headers: {cors_headers}")
except Exception as e:
    print(f"   ERROR: {e}")
