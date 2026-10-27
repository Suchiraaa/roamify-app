"""
Roamify Backend Test Suite
Verifies all endpoints, integrations, data structures, and error states.
"""

import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

passed = 0
failed = 0


def record(name: str, condition: bool, details: str = ""):
    global passed, failed
    if condition:
        print(f"  [PASS] {name} {details}")
        passed += 1
    else:
        print(f"  [FAIL] {name} {details}")
        failed += 1


print("=" * 60)
print("ROAMIFY BACKEND VERIFICATION & INTEGRATION SUITE")
print("=" * 60)

# 1. Health & Meta
print("\n--- 1. Service Health & Metadata ---")
r = client.get("/")
record("Root Endpoint Status 200", r.status_code == 200)
record("Root Service Online", r.json().get("status") == "online")

r = client.get("/api/health")
record("Health Check Status 200", r.status_code == 200)
integrations = r.json().get("integrations", {})
record("Gemini AI Integration Reported", "gemini_ai_copilot" in integrations)
record("Weather Integration Reported", "weather_service" in integrations)
record("Places Integration Reported", "places_service" in integrations)

r = client.get("/api/presets")
record("Presets Endpoint Status 200", r.status_code == 200)
record("Preset Trips Available", len(r.json()) >= 4)

# 2. Real Weather Integration (Feature B)
print("\n--- 2. Real Weather Integration (OpenWeatherMap) ---")
# Current weather by coordinates
r = client.get("/api/weather/current?lat=12.9716&lon=77.5946")
record("Current Weather (Coords) 200", r.status_code == 200)
w = r.json()
record("Weather Returns City Name", bool(w.get("city")), f"City: {w.get('city')}")
record("Weather Returns Numeric Temp", isinstance(w.get("temperature_c"), (int, float)), f"{w.get('temperature_c')}°C")
record("Weather Returns Condition", bool(w.get("condition")), f"Condition: {w.get('condition')}")
record("Weather Returns Disclaimer", "disclaimer" in w)

# Forecast by coordinates
r = client.get("/api/weather/forecast?lat=12.9716&lon=77.5946")
record("Forecast (Coords) 200", r.status_code == 200)
fc = r.json()
record("Forecast Days Populated", len(fc.get("days", [])) >= 3, f"{len(fc.get('days', []))} days")

# Multi-point route weather
r = client.post("/api/weather/route", json={
    "points": [
        {"name": "Bengaluru", "lat": 12.9716, "lon": 77.5946, "role": "origin"},
        {"name": "Mysuru", "lat": 12.2958, "lon": 76.6394, "role": "destination"}
    ]
})
record("Route Weather 200", r.status_code == 200)
record("Route Weather Points Count", len(r.json()) == 2)

# Weather error handling
r = client.get("/api/weather/current")
record("Missing Weather Parameters Error 400", r.status_code == 400)

# 3. Real Places & Recommendations (Feature C)
print("\n--- 3. Real Places & Recommendations (OpenStreetMap / Wikimedia) ---")
# Viewpoints
r = client.get("/api/places/recommendations?lat=12.9716&lon=77.5946&category=Viewpoints&limit=4")
record("Places Recommendations (Viewpoints) 200", r.status_code == 200)
places = r.json()
record("Places Returned", len(places) > 0, f"Found {len(places)} places")
if places:
    first_place = places[0]
    record("Place Has Real Coordinates", "lat" in first_place and "lon" in first_place)
    record("Place Has Distance From Corridor", "distance_km" in first_place)
    record("Place Has Opening Hours Status", "opening_hours" in first_place)
    record("Place Distinguishes Rating", "rating_display" in first_place)

# Food category
r = client.get("/api/places/recommendations?lat=12.9716&lon=77.5946&category=Food&limit=3")
record("Places Recommendations (Food) 200", r.status_code == 200)

# Nature category
r = client.get("/api/places/recommendations?lat=12.9716&lon=77.5946&category=Nature&limit=3")
record("Places Recommendations (Nature) 200", r.status_code == 200)

# 4. Scenic Routing Integration (Member 3)
print("\n--- 4. Scenic Routing Corridor Engine ---")
r = client.post("/api/plan-trip", json={
    "start_location": "Bengaluru",
    "destination": "Mysuru",
    "interest": "Nature",
    "budget": "Moderate",
    "duration": "3 hours"
})
record("Plan Trip 200", r.status_code == 200)
trip_data = r.json()
record("Trip Has Direct Route", trip_data.get("direct_route", {}).get("distance_km", 0) > 0)
record("Trip Has Scenic Route", trip_data.get("scenic_route", {}).get("distance_km", 0) > 0)
record("Trip Has Scenic Stops", len(trip_data.get("scenic_stops", [])) > 0)

# Recalculate route
r = client.post("/api/recalculate-route", json={
    "start_coords": [77.5946, 12.9716],
    "dest_coords": [76.6394, 12.2958],
    "waypoint_coords": [[77.2917, 12.7231]]
})
record("Recalculate Route 200", r.status_code == 200)

# 5. Gemini AI Co-Pilot (Feature A)
print("\n--- 5. Gemini AI Co-Pilot ---")
r = client.post("/api/copilot", json={
    "origin": "Bengaluru",
    "destination": "Mysuru",
    "interests": ["Nature", "Culture"],
    "budget": "Moderate",
    "time_available": "3 hours",
    "route_distance_km": 145.0,
    "route_duration_min": 180.0
})
record("Gemini Co-Pilot Plan 200", r.status_code == 200)
copilot_res = r.json()
record("Gemini Strategy Non-Empty", len(copilot_res.get("answer", "")) > 100)
record("Gemini Model Used", bool(copilot_res.get("model_used")), f"Model: {copilot_res.get('model_used')}")

# Replan endpoint
r = client.post("/api/replan", json={
    "origin": "Bengaluru",
    "destination": "Mysuru",
    "interests": ["Nature"],
    "budget": "Moderate",
    "time_available": "3 hours",
    "reason": "It started raining, suggest covered scenic cafes"
})
record("Gemini Replan 200", r.status_code == 200)
record("Gemini Replan Answer Returned", len(r.json().get("answer", "")) > 100)

# Interactive chat turn
r = client.post("/api/copilot/chat", json={
    "message": "What is the best highway breakfast stop?",
    "trip_context": {
        "origin": "Bengaluru",
        "destination": "Mysuru",
        "interests": ["Food"],
        "budget": "Moderate",
        "time_available": "3 hours"
    }
})
record("Gemini Chat Turn 200", r.status_code == 200)
record("Gemini Chat Reply Returned", len(r.json().get("reply", "")) > 10)

# Error cases
r = client.post("/api/copilot", json={"origin": "", "destination": ""})
record("Gemini Missing Origin Error 422", r.status_code == 422)

print("\n" + "=" * 60)
print(f"TEST SUMMARY: {passed} PASSED, {failed} FAILED")
print("=" * 60)

if failed > 0:
    sys.exit(1)
