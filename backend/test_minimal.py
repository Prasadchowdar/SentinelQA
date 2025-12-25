import requests

print("Testing minimal server on port 8001...")
print("\n1. Testing OPTIONS (CORS preflight):")
response = requests.options(
    "http://localhost:8001/api/auth/register",
    headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
    }
)
print(f"   Status: {response.status_code}")
print(f"   CORS Headers: {dict((k,v) for k,v in response.headers.items() if 'access-control' in k.lower())}")

print("\n2. Testing POST:")
response = requests.post(
    "http://localhost:8001/api/auth/register",
    json={"name": "Test", "email": "test@example.com", "password": "password123"},
    headers={"Origin": "http://localhost:3000"}
)
print(f"   Status: {response.status_code}")
print(f"   Response: {response.json()}")
print(f"   CORS Headers: {dict((k,v) for k,v in response.headers.items() if 'access-control' in k.lower())}")
