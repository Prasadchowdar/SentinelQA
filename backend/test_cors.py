
import requests

url = "http://localhost:8000/api/auth/register"

# Test OPTIONS (preflight) request
print("Testing CORS Preflight (OPTIONS)...")
response = requests.options(
    url,
    headers={
        "Origin": "http://localhost:3000",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type"
    }
)

print(f"Status: {response.status_code}")
print(f"Headers:")
for key, value in response.headers.items():
    if 'access-control' in key.lower() or 'origin' in key.lower():
        print(f"  {key}: {value}")

if 'Access-Control-Allow-Origin' not in response.headers:
    print("\n❌ PROBLEM: Access-Control-Allow-Origin header is MISSING!")
    print("This is why the browser blocks the request.")
else:
    print(f"\n✓ CORS header present: {response.headers['Access-Control-Allow-Origin']}")
