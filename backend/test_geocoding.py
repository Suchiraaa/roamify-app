"""
Roamify Geocoding Test Suite
Tests for geocode() in ors_service.py covering:
  1. Valid city names resolved via live fallback providers
  2. Coordinate input parsing (lat, lon strings)
  3. Provider failure handling (non-200 does not block remaining providers)
  4. Fallback behaviour when upstream providers are unavailable
  5. Edge cases: empty input, gibberish queries
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

# Add backend directory to path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from ors_service import OpenRouteServiceClient

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
print("ROAMIFY GEOCODING TEST SUITE")
print("=" * 60)


# ---------------------------------------------------------------------------
# 1. Coordinate Input Parsing (Tier 1 - no network)
# ---------------------------------------------------------------------------
print("\n--- 1. Coordinate Input Parsing (Tier 1) ---")


async def test_coordinate_parsing():
    client = OpenRouteServiceClient()

    # Standard lat,lon
    res = await client.geocode("12.9716, 77.5946")
    record("Standard lat,lon returns Direct Coordinates",
           res["source"] == "Direct Coordinates",
           f"source={res['source']}")
    record("Standard lat,lon correct lat",
           abs(res["lat"] - 12.9716) < 0.001,
           f"lat={res['lat']}")
    record("Standard lat,lon correct lon",
           abs(res["lon"] - 77.5946) < 0.001,
           f"lon={res['lon']}")

    # Negative coordinates (southern/western hemisphere)
    res = await client.geocode("-33.8688, 151.2093")
    record("Negative lat coordinate parsed",
           abs(res["lat"] - (-33.8688)) < 0.001,
           f"lat={res['lat']}")

    # Edge: 0,0
    res = await client.geocode("0, 0")
    record("Zero coordinates accepted",
           res["source"] == "Direct Coordinates",
           f"source={res['source']}")

    # Edge: max bounds
    res = await client.geocode("90, 180")
    record("Max bounds (90, 180) accepted",
           res["source"] == "Direct Coordinates")

    res = await client.geocode("-90, -180")
    record("Min bounds (-90, -180) accepted",
           res["source"] == "Direct Coordinates")

    # Non-coordinate comma string should NOT parse as coords
    # "Paris, France" has non-numeric parts
    # Just verify no crash; it should fall through to geocoding providers
    # (We'll test that in the next section)


asyncio.run(test_coordinate_parsing())


# ---------------------------------------------------------------------------
# 2. Empty / Invalid Input
# ---------------------------------------------------------------------------
print("\n--- 2. Empty / Invalid Input ---")


async def test_empty_input():
    client = OpenRouteServiceClient()

    try:
        await client.geocode("")
        record("Empty string raises ValueError", False)
    except ValueError:
        record("Empty string raises ValueError", True)

    try:
        await client.geocode("   ")
        record("Whitespace-only raises ValueError", False)
    except ValueError:
        record("Whitespace-only raises ValueError", True)


asyncio.run(test_empty_input())


# ---------------------------------------------------------------------------
# 3. Provider Fallback Behaviour (mocked)
# ---------------------------------------------------------------------------
print("\n--- 3. Provider Fallback (Mocked) ---")


def _make_mock_response(status_code: int, json_data=None, text=""):
    """Create a mock httpx.Response."""
    mock = MagicMock()
    mock.status_code = status_code
    mock.json.return_value = json_data or {}
    mock.text = text
    return mock


def _nominatim_success_response():
    """Nominatim-style success response for 'Paris'."""
    return _make_mock_response(200, json_data=[{
        "name": "Paris",
        "display_name": "Paris, Ile-de-France, France",
        "lat": "48.8566",
        "lon": "2.3522",
    }])


def _photon_success_response():
    """Photon-style success response for 'Paris'."""
    return _make_mock_response(200, json_data={
        "features": [{
            "geometry": {"coordinates": [2.3522, 48.8566]},
            "properties": {
                "name": "Paris",
                "country": "France",
                "state": "Ile-de-France",
            }
        }]
    })


async def test_mapbox_fail_falls_to_ors():
    """When Mapbox returns 401 and ORS returns 403, Photon with User-Agent succeeds."""
    client = OpenRouteServiceClient()
    client.mapbox_token = "test_token"

    call_count = {"n": 0}

    async def mock_get(url, **kwargs):
        call_count["n"] += 1
        if "mapbox.com" in url:
            return _make_mock_response(401, text="Unauthorized")
        if "openrouteservice.org" in url:
            return _make_mock_response(403, json_data={"error": "Access disallowed"})
        if "photon.komoot.io" in url:
            return _photon_success_response()
        if "nominatim.openstreetmap.org" in url:
            return _nominatim_success_response()
        return _make_mock_response(500)

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("ors_service.httpx.AsyncClient", return_value=mock_client):
        result = await client.geocode("Paris")

    record("Mapbox 401 -> ORS 403 -> Photon success",
           result["source"] == "Photon OSM",
           f"source={result['source']}")
    record("Fallback tried multiple providers",
           call_count["n"] >= 3,
           f"calls={call_count['n']}")


asyncio.run(test_mapbox_fail_falls_to_ors())


async def test_all_fail_except_nominatim():
    """When Mapbox, ORS, and Photon all fail, Nominatim succeeds."""
    client = OpenRouteServiceClient()
    client.mapbox_token = "test_token"

    async def mock_get(url, **kwargs):
        if "mapbox.com" in url:
            return _make_mock_response(500, text="Server Error")
        if "openrouteservice.org" in url:
            return _make_mock_response(403)
        if "photon.komoot.io" in url:
            return _make_mock_response(403)
        if "nominatim.openstreetmap.org" in url:
            return _nominatim_success_response()
        return _make_mock_response(500)

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("ors_service.httpx.AsyncClient", return_value=mock_client):
        result = await client.geocode("Paris")

    record("All fail except Nominatim -> Nominatim used",
           result["source"] == "Nominatim OSM",
           f"source={result['source']}")
    record("Correct name returned",
           result["name"] == "Paris",
           f"name={result['name']}")


asyncio.run(test_all_fail_except_nominatim())


async def test_all_providers_fail_raises():
    """When ALL providers return non-200 or empty, ValueError is raised."""
    client = OpenRouteServiceClient()
    client.mapbox_token = "test_token"

    async def mock_get(url, **kwargs):
        return _make_mock_response(500, text="Internal Server Error")

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("ors_service.httpx.AsyncClient", return_value=mock_client):
        try:
            await client.geocode("NonexistentPlace12345")
            record("All providers fail raises ValueError", False)
        except ValueError as e:
            record("All providers fail raises ValueError", True,
                   f"msg={str(e)[:60]}")


asyncio.run(test_all_providers_fail_raises())


async def test_timeout_does_not_block_fallback():
    """A timeout in one provider does not prevent later providers from running."""
    import httpx as httpx_module

    client = OpenRouteServiceClient()
    client.mapbox_token = "test_token"

    call_order = []

    async def mock_get(url, **kwargs):
        if "mapbox.com" in url:
            call_order.append("mapbox")
            raise httpx_module.TimeoutException("Mapbox timed out")
        if "openrouteservice.org" in url:
            call_order.append("ors")
            raise httpx_module.TimeoutException("ORS timed out")
        if "photon.komoot.io" in url:
            call_order.append("photon")
            raise httpx_module.ConnectError("Photon connection failed")
        if "nominatim.openstreetmap.org" in url:
            call_order.append("nominatim")
            return _nominatim_success_response()
        return _make_mock_response(500)

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("ors_service.httpx.AsyncClient", return_value=mock_client):
        result = await client.geocode("Tokyo")

    record("Timeout in early tiers falls through",
           result["source"] == "Nominatim OSM",
           f"source={result['source']}")
    record("All tiers attempted in order",
           "mapbox" in call_order and "ors" in call_order and "photon" in call_order and "nominatim" in call_order,
           f"order={call_order}")


asyncio.run(test_timeout_does_not_block_fallback())


async def test_no_mapbox_token_skips_tier2():
    """When mapbox_token is empty, Tier 2 is skipped without error."""
    client = OpenRouteServiceClient()
    client.mapbox_token = ""  # No token

    async def mock_get(url, **kwargs):
        if "mapbox.com" in url:
            raise AssertionError("Mapbox should NOT be called when token is empty")
        if "openrouteservice.org" in url:
            return _make_mock_response(403)
        if "photon.komoot.io" in url:
            return _photon_success_response()
        if "nominatim.openstreetmap.org" in url:
            return _nominatim_success_response()
        return _make_mock_response(500)

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("ors_service.httpx.AsyncClient", return_value=mock_client):
        result = await client.geocode("Berlin")

    record("No Mapbox token -> Tier 2 skipped, Photon used",
           result["source"] == "Photon OSM",
           f"source={result['source']}")


asyncio.run(test_no_mapbox_token_skips_tier2())


# ---------------------------------------------------------------------------
# 4. Photon User-Agent Header (the root cause bug fix)
# ---------------------------------------------------------------------------
print("\n--- 4. Photon User-Agent Header Fix ---")


async def test_photon_sends_user_agent():
    """Verify Photon requests include User-Agent header (root cause fix)."""
    client = OpenRouteServiceClient()
    client.mapbox_token = ""  # Skip Mapbox

    captured_headers = {}

    async def mock_get(url, **kwargs):
        if "photon.komoot.io" in url:
            captured_headers.update(kwargs.get("headers", {}))
            return _photon_success_response()
        if "openrouteservice.org" in url:
            return _make_mock_response(403)
        return _make_mock_response(500)

    mock_client = AsyncMock()
    mock_client.get = mock_get
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)

    with patch("ors_service.httpx.AsyncClient", return_value=mock_client):
        await client.geocode("London")

    record("Photon request includes User-Agent header",
           "User-Agent" in captured_headers,
           f"headers={list(captured_headers.keys())}")
    record("User-Agent is Roamify identifier",
           "Roamify" in captured_headers.get("User-Agent", ""),
           f"ua={captured_headers.get('User-Agent', '')[:50]}")


asyncio.run(test_photon_sends_user_agent())


# ---------------------------------------------------------------------------
# 5. Live Provider Tests (requires network)
# ---------------------------------------------------------------------------
print("\n--- 5. Live Geocoding (requires network) ---")


async def test_live_geocoding():
    client = OpenRouteServiceClient()

    cities = [
        ("Bengaluru", 12.0, 13.5, 77.0, 78.5),
        ("Paris, France", 48.0, 49.5, 1.5, 3.5),
        ("Tokyo", 35.0, 36.5, 139.0, 140.5),
    ]

    for city, lat_min, lat_max, lon_min, lon_max in cities:
        try:
            result = await client.geocode(city)
            in_range = (lat_min <= result["lat"] <= lat_max and
                        lon_min <= result["lon"] <= lon_max)
            record(f"Live geocode '{city}'",
                   in_range,
                   f"source={result['source']} lat={result['lat']:.4f} lon={result['lon']:.4f}")
        except Exception as e:
            record(f"Live geocode '{city}'", False, f"error={e}")


try:
    asyncio.run(test_live_geocoding())
except Exception as e:
    print(f"  [SKIP] Live tests skipped (no network): {type(e).__name__}")

print("\n" + "=" * 60)
print(f"GEOCODING TESTS: {passed} PASSED, {failed} FAILED")
print("=" * 60)

if failed > 0:
    sys.exit(1)
