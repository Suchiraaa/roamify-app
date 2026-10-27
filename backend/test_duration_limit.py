"""
Tests for duration-limit enforcement in Roamify trip planning.

Covers:
  1. parse_duration_to_minutes converts human strings correctly.
  2. A 3-hour limit on a short route (Bengaluru->Mysuru) produces a scenic
     route whose duration_min <= 180.
  3. A 3-hour limit on a long route (Mumbai->Goa, ~7.5 hrs direct) returns
     the direct route with an honest message -- no fake scenic route.
  4. When no feasible scenic route exists within the limit, the response
     contains an explanatory message and zero scenic stops.
"""

import sys
from pathlib import Path

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from fastapi.testclient import TestClient
from main import app
from scenic_finder import parse_duration_to_minutes

client = TestClient(app)

passed = 0
failed = 0


def record(name, condition, details=""):
    global passed, failed
    if condition:
        print("  [PASS] {} {}".format(name, details))
        passed += 1
    else:
        print("  [FAIL] {} {}".format(name, details))
        failed += 1


print("=" * 60)
print("DURATION LIMIT ENFORCEMENT TESTS")
print("=" * 60)

# -- 1. parse_duration_to_minutes --
print("\n--- 1. parse_duration_to_minutes ---")
record("'3 hours' -> 180",      parse_duration_to_minutes("3 hours") == 180.0)
record("'1 hour'  -> 60",       parse_duration_to_minutes("1 hour") == 60.0)
record("'Half a day' -> 240",   parse_duration_to_minutes("Half a day") == 240.0)
record("'Full day' -> 480",     parse_duration_to_minutes("Full day") == 480.0)
record("Numeric 120 -> 120",    parse_duration_to_minutes(120) == 120.0)
record("None -> 180 default",   parse_duration_to_minutes(None) == 180.0)
record("Empty str -> 180",      parse_duration_to_minutes("") == 180.0)

# -- 2. Short route within 3-hour limit --
print("\n--- 2. Bengaluru->Mysuru with 3-hour limit (should fit) ---")
r = client.post("/api/plan-trip", json={
    "start_location": "Bengaluru",
    "destination": "Mysuru",
    "interest": "Nature",
    "budget": "Moderate",
    "duration": "3 hours"
})
record("HTTP 200", r.status_code == 200, "(got {})".format(r.status_code))
data = r.json()
scenic_dur = data.get("scenic_route", {}).get("duration_min", 0)
record(
    "Scenic route <= 180 min",
    scenic_dur <= 180,
    "(scenic_duration={:.1f} min)".format(scenic_dur)
)
record(
    "Has scenic stops",
    len(data.get("scenic_stops", [])) > 0,
    "(stops={})".format(len(data.get("scenic_stops", [])))
)
record(
    "Scenic route has geometry",
    len(data.get("scenic_route", {}).get("geometry", [])) > 0
)

# -- 3. Long route exceeding 3-hour limit --
print("\n--- 3. Mumbai->Goa with 3-hour limit (direct ~7.5 hrs, must fail) ---")
r = client.post("/api/plan-trip", json={
    "start_location": "Mumbai",
    "destination": "Goa",
    "interest": "Nature",
    "budget": "Moderate",
    "duration": "3 hours"
})
record("HTTP 200", r.status_code == 200, "(got {})".format(r.status_code))
data = r.json()
scenic_dur = data.get("scenic_route", {}).get("duration_min", 0)
direct_dur = data.get("direct_route", {}).get("duration_min", 0)
record(
    "Scenic route == direct route (no detour added)",
    abs(scenic_dur - direct_dur) < 0.5,
    "(scenic={:.1f}, direct={:.1f})".format(scenic_dur, direct_dur)
)
record(
    "No scenic stops returned",
    len(data.get("scenic_stops", [])) == 0,
    "(stops={})".format(len(data.get("scenic_stops", [])))
)
record(
    "Message explains exceeding limit",
    "exceeds" in data.get("message", "").lower()
    or "limit" in data.get("message", "").lower(),
    "(msg={})".format(data.get("message", "")[:100])
)
record(
    "Reported duration is honest (not faked)",
    scenic_dur > 180,
    "(scenic_dur={:.1f} -- truthfully above 180)".format(scenic_dur)
)

# -- 4. No feasible scenic route (direct fits, but detours don't) --
print("\n--- 4. Short route with very tight limit (1 hour) ---")
r = client.post("/api/plan-trip", json={
    "start_location": "Bengaluru",
    "destination": "Mysuru",
    "interest": "Nature",
    "budget": "Moderate",
    "duration": "1 hour"
})
record("HTTP 200", r.status_code == 200, "(got {})".format(r.status_code))
data = r.json()
scenic_dur = data.get("scenic_route", {}).get("duration_min", 0)
direct_dur = data.get("direct_route", {}).get("duration_min", 0)
message = data.get("message", "")

# Direct route for BLR->MYS is ~119 min which already exceeds 60 min,
# so we expect the "direct route exceeds" message.
if direct_dur > 60:
    record(
        "Direct route exceeds 1-hour limit acknowledged",
        "exceeds" in message.lower() or "limit" in message.lower(),
        "(direct_dur={:.1f})".format(direct_dur)
    )
    record(
        "No scenic stops returned",
        len(data.get("scenic_stops", [])) == 0
    )
else:
    # If somehow direct fits in 60 min, scenic must too
    record(
        "Scenic route <= 60 min",
        scenic_dur <= 60,
        "(scenic_dur={:.1f})".format(scenic_dur)
    )

# -- 5. Full day limit should allow scenic stops --
print("\n--- 5. Mumbai->Goa with 'Full day' limit (should allow scenic) ---")
r = client.post("/api/plan-trip", json={
    "start_location": "Mumbai",
    "destination": "Goa",
    "interest": "Nature",
    "budget": "Moderate",
    "duration": "Full day"
})
record("HTTP 200", r.status_code == 200, "(got {})".format(r.status_code))
data = r.json()
scenic_dur = data.get("scenic_route", {}).get("duration_min", 0)
record(
    "Scenic route <= 480 min (full day)",
    scenic_dur <= 480,
    "(scenic_dur={:.1f})".format(scenic_dur)
)

# -- Summary --
print("\n" + "=" * 60)
print("DURATION LIMIT TESTS: {} PASSED, {} FAILED".format(passed, failed))
print("=" * 60)

if failed > 0:
    sys.exit(1)
