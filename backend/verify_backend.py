import asyncio
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import app, health_check, get_presets, ors_client
from models import TripPlanRequest

def test_ors_configuration():
    print("Testing ORS configuration...")
    key = ors_client.get_effective_key()
    assert key is not None and len(key) > 10, "ORS API key not loaded properly"
    print("[OK] ORS API Key is present and loaded automatically from environment")

def test_health_endpoint():
    print("Testing /api/health...")
    health = health_check()
    assert health["status"] == "online", "Health status is not online"
    assert health["ors_api_key_configured"] is True, "ors_api_key_configured is False"
    print(f"[OK] Health check passed: status={health['status']}, configured={health['ors_api_key_configured']}")

def test_presets_endpoint():
    print("Testing /api/presets...")
    presets = get_presets()
    assert len(presets) > 0, "No presets found"
    print(f"[OK] Presets endpoint returned {len(presets)} preset trips")

async def test_geocoding():
    print("Testing geocoding...")
    res = await ors_client.geocode("Bengaluru")
    assert "lat" in res and "lon" in res, "Geocoding missing lat/lon"
    print(f"[OK] Geocode test passed: {res['name']} -> ({res['lat']}, {res['lon']})")

async def main():
    test_ors_configuration()
    test_health_endpoint()
    test_presets_endpoint()
    await test_geocoding()
    print("All backend checks passed successfully!")

if __name__ == "__main__":
    asyncio.run(main())
