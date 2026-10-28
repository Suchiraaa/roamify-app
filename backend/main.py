import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Query, Response
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables reliably from backend/.env, parent .env, and default
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir.parent / ".env")
load_dotenv()

from models import (
    TripPlanRequest,
    TripPlanResponse,
    RecalculateRouteRequest,
    RouteDetails,
    ScenicStop,
    PresetTrip,
    TripRequest,
    ReplanRequest,
    CopilotChatRequest,
    WeatherRequest,
    RouteWeatherRequest,
    PlacesRecommendationRequest,
    PlaceItem,
)
from ors_service import OpenRouteServiceClient
from scenic_finder import find_scenic_stops_along_route, parse_duration_to_minutes
from weather_service import (
    fetch_current_weather,
    fetch_forecast,
    fetch_route_weather,
)
from places_service import get_places_recommendations
from gemini_service import generate_trip_plan, handle_copilot_chat

app = FastAPI(
    title="Roamify Unified API",
    description="Personalized Navigation & Road-Trip Planning API with Scenic Routing, Weather, Places, and Gemini AI Co-Pilot",
    version="2.0.0"
)

# CORS middleware for local Vite frontend & client apps
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ors_client = OpenRouteServiceClient()

PRESET_TRIPS: List[PresetTrip] = [
    PresetTrip(
        id="blr-mys",
        title="Bengaluru to Mysuru Heritage Trail",
        start="Bengaluru, Karnataka, India",
        destination="Mysuru, Karnataka, India",
        interest="Culture",
        duration="Full day",
        description="Experience dramatic granite hills, Janapada Loka folk village, and legendary highway eateries."
    ),
    PresetTrip(
        id="mum-pune",
        title="Western Ghats Vista Express",
        start="Mumbai, Maharashtra, India",
        destination="Pune, Maharashtra, India",
        interest="Nature",
        duration="Half a day",
        description="Traverse lush mist-shrouded ghats, ancient Karla Buddhist rock caves, and Tiger Point viewpoints."
    ),
    PresetTrip(
        id="del-agra",
        title="Golden Triangle Heritage Passage",
        start="Delhi, India",
        destination="Agra, Uttar Pradesh, India",
        interest="Culture",
        duration="Full day",
        description="Explore Mughal architecture, bird sanctuaries, and historic imperial citadels."
    ),
    PresetTrip(
        id="sfo-bigsur",
        title="Pacific Coast Scenic Highway",
        start="San Francisco, California, USA",
        destination="Big Sur, California, USA",
        interest="Nature",
        duration="Full day",
        description="Iconic coastal cliffs, dramatic ocean viewpoints, and towering redwood forests."
    )
]


# ==============================================================================
# Health & General Status
# ==============================================================================

@app.get("/")
def home():
    return {
        "service": "Roamify Unified API",
        "status": "online",
        "app": "Roamify Scenic Routing & Navigation API",
        "docs": "/docs",
        "health": "/api/health",
        "features": {
            "scenic_routing": "enabled",
            "gemini_copilot": "enabled",
            "weather_integration": "enabled",
            "places_recommendations": "enabled"
        }
    }


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return Response(status_code=204)


@app.get("/api/health")
def health_check(x_ors_api_key: Optional[str] = Header(None)):
    key_val = x_ors_api_key if isinstance(x_ors_api_key, str) else None
    ors_configured = bool(ors_client.get_effective_key(key_val))
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    gemini_configured = bool(gemini_key and not gemini_key.startswith("your_"))
    weather_key = os.getenv("OPENWEATHER_API_KEY", "").strip()
    weather_configured = bool(weather_key and not weather_key.startswith("your_"))

    return {
        "status": "online",
        "service": "Roamify Navigation & Road-Trip Platform",
        "ors_api_key_configured": ors_configured,
        "mode": "Live OpenRouteService" if ors_configured else "OSRM & Corridor Engine Fallback",
        "integrations": {
            "gemini_ai_copilot": {
                "configured": gemini_configured,
                "provider": "Google Gemini (gemini-3.5-flash / gemini-3.8-flash)"
            },
            "weather_service": {
                "configured": weather_configured,
                "provider": "OpenWeatherMap Live API"
            },
            "places_service": {
                "configured": True,
                "provider": "OpenStreetMap Nominatim & Wikimedia Geosearch"
            },
            "scenic_routing": {
                "ors_configured": ors_configured,
                "mode": "Live OpenRouteService" if ors_configured else "OSRM & Corridor Engine Fallback"
            }
        }
    }


@app.get("/api/presets", response_model=List[PresetTrip])
def get_presets():
    return PRESET_TRIPS


# ==============================================================================
# Member 3: Scenic Routing & Recalculation
# ==============================================================================

@app.post("/api/plan-trip", response_model=TripPlanResponse)
async def plan_trip(req: TripPlanRequest, x_ors_api_key: Optional[str] = Header(None)):
    """
    Main endpoint:
    1. Geocodes Start Location and Destination.
    2. Computes direct route using OpenRouteService.
    3. Finds scenic stops along the corridor matching user interests and budget.
    4. Computes the scenic route with the scenic stops as waypoints.
    5. Returns both routes, stats, and interactive scenic stops.
    """
    key_val = x_ors_api_key if isinstance(x_ors_api_key, str) else None
    key = req.ors_api_key or key_val

    try:
        # Step 1: Geocode start and destination
        start_info = await ors_client.geocode(req.start_location, custom_key=key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Start location error: {str(e)}")

    try:
        dest_info = await ors_client.geocode(req.destination, custom_key=key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Destination error: {str(e)}")

    start_coord = (start_info["lon"], start_info["lat"])
    dest_coord = (dest_info["lon"], dest_info["lat"])

    # Step 2: Compute direct route
    direct_route_raw = await ors_client.get_directions(
        coordinates=[[start_coord[0], start_coord[1]], [dest_coord[0], dest_coord[1]]],
        profile=req.profile,
        custom_key=key
    )

    # Step 3: Parse max duration and check if the direct route already exceeds it
    max_duration_min = parse_duration_to_minutes(req.duration)

    # Normalize interests (single string, array, or comma-separated)
    if req.interests and isinstance(req.interests, list):
        interests_list = [str(i).strip() for i in req.interests if str(i).strip()]
    elif isinstance(req.interest, list):
        interests_list = [str(i).strip() for i in req.interest if str(i).strip()]
    elif isinstance(req.interest, str):
        interests_list = [i.strip() for i in req.interest.split(",") if i.strip()]
    else:
        interests_list = ["Nature"]

    if not interests_list:
        interests_list = ["Nature"]

    interest_display = ", ".join(interests_list).lower()

    # Step 4: Discover scenic places along the route corridor
    stops_raw = await find_scenic_stops_along_route(
        start_coord=start_coord,
        dest_coord=dest_coord,
        interest=interests_list,
        budget=req.budget,
        duration=req.duration,
        max_stops=3
    )

    scenic_stops = [
        ScenicStop(
            id=s["id"],
            name=s["name"],
            category=s["category"],
            lat=s["lat"],
            lon=s["lon"],
            description=s["description"],
            icon=s.get("icon", "pin"),
            budget=s.get("budget", req.budget),
            detour_min=s.get("detour_min", 20),
            scenic_score=s.get("scenic_score", 4.5),
            is_included=True
        )
        for s in stops_raw
    ]

    # Step 5: Compute scenic route with stops as waypoints and enforce duration limit
    scenic_route_raw = direct_route_raw  # default: no detour
    result_message = ""

    if direct_route_raw["duration_min"] > max_duration_min:
        # Even the direct route exceeds the limit – return it honestly
        scenic_stops = []
        scenic_route_raw = direct_route_raw
        result_message = (
            f"The fastest direct route takes approximately "
            f"{round(direct_route_raw['duration_min'])} minutes "
            f"({round(direct_route_raw['duration_min'] / 60, 1)} hrs), "
            f"which already exceeds your {req.duration} limit. "
            f"No scenic detours can be added within this time budget. "
            f"Consider increasing your available time or choosing a closer destination."
        )
    elif scenic_stops:
        # Try with all stops first, then progressively remove the worst ones
        remaining_stops = list(scenic_stops)
        scenic_route_raw = None

        while remaining_stops:
            waypoint_coords = [[s.lon, s.lat] for s in remaining_stops]
            all_coords = (
                [[start_coord[0], start_coord[1]]]
                + waypoint_coords
                + [[dest_coord[0], dest_coord[1]]]
            )
            candidate_route = await ors_client.get_directions(
                coordinates=all_coords,
                profile=req.profile,
                custom_key=key,
            )

            if candidate_route["duration_min"] <= max_duration_min:
                scenic_route_raw = candidate_route
                break

            # Remove the stop contributing the most estimated detour time
            worst_idx = max(
                range(len(remaining_stops)),
                key=lambda i: remaining_stops[i].detour_min,
            )
            remaining_stops.pop(worst_idx)

        if scenic_route_raw is not None:
            # Update scenic_stops to only the ones we kept
            scenic_stops = remaining_stops
            kept = len(scenic_stops)
            dropped = len(stops_raw) - kept
            if dropped > 0:
                result_message = (
                    f"Discovered {kept} scenic {interest_display} "
                    f"stop{'s' if kept != 1 else ''} within your {req.duration} limit. "
                    f"{dropped} additional stop{'s' if dropped != 1 else ''} "
                    f"{'were' if dropped != 1 else 'was'} excluded to stay within the time budget."
                )
            else:
                result_message = (
                    f"Discovered {kept} scenic {interest_display} "
                    f"stop{'s' if kept != 1 else ''} along your journey corridor."
                )
        else:
            # No combination of stops fits – fall back to direct route
            scenic_stops = []
            scenic_route_raw = direct_route_raw
            result_message = (
                f"No scenic detour fits within your {req.duration} limit "
                f"for this route. Returning the direct route "
                f"({round(direct_route_raw['duration_min'])} min). "
                f"Try increasing your available time to add scenic stops."
            )
    else:
        result_message = (
            f"No scenic {interest_display} stops found along this corridor. "
            f"Returning the direct route."
        )

    # Step 6: Calculate detour differences
    detour_added_km = max(0.0, round(scenic_route_raw["distance_km"] - direct_route_raw["distance_km"], 2))
    detour_added_min = max(0.0, round(scenic_route_raw["duration_min"] - direct_route_raw["duration_min"], 1))

    return TripPlanResponse(
        success=True,
        start_location=start_info,
        destination=dest_info,
        direct_route=RouteDetails(
            distance_km=direct_route_raw["distance_km"],
            duration_min=direct_route_raw["duration_min"],
            geometry=direct_route_raw["geometry"],
            summary=direct_route_raw["summary"],
            segments_count=1
        ),
        scenic_route=RouteDetails(
            distance_km=scenic_route_raw["distance_km"],
            duration_min=scenic_route_raw["duration_min"],
            geometry=scenic_route_raw["geometry"],
            summary=scenic_route_raw["summary"],
            segments_count=len(scenic_stops) + 1
        ),
        detour_added_km=detour_added_km,
        detour_added_min=detour_added_min,
        scenic_stops=scenic_stops,
        provider=scenic_route_raw["provider"],
        message=result_message
    )


@app.post("/api/recalculate-route", response_model=RouteDetails)
async def recalculate_route(req: RecalculateRouteRequest, x_ors_api_key: Optional[str] = Header(None)):
    """
    Recalculates route dynamically when user toggles individual stops on or off.
    """
    key_val = x_ors_api_key if isinstance(x_ors_api_key, str) else None
    key = req.ors_api_key or key_val
    all_coords = [req.start_coords] + req.waypoint_coords + [req.dest_coords]

    route_raw = await ors_client.get_directions(
        coordinates=all_coords,
        profile=req.profile,
        custom_key=key
    )

    return RouteDetails(
        distance_km=route_raw["distance_km"],
        duration_min=route_raw["duration_min"],
        geometry=route_raw["geometry"],
        summary=route_raw["summary"],
        segments_count=len(req.waypoint_coords) + 1
    )


# ==============================================================================
# Member 4 - Feature A: AI Co-Pilot (Gemini)
# ==============================================================================

@app.post("/api/copilot")
def copilot(trip: TripRequest):
    return generate_trip_plan(trip)


@app.post("/api/replan")
def replan(request: ReplanRequest):
    return generate_trip_plan(request, reason=request.reason)


@app.post("/api/copilot/chat")
def copilot_chat(request: CopilotChatRequest):
    return handle_copilot_chat(request)


# ==============================================================================
# Member 4 - Feature B: Weather Integration
# ==============================================================================

@app.get("/api/weather/current")
def get_current_weather(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    city: Optional[str] = Query(None)
):
    return fetch_current_weather(lat=lat, lon=lon, city=city)


@app.get("/api/weather/forecast")
def get_weather_forecast(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    city: Optional[str] = Query(None)
):
    return fetch_forecast(lat=lat, lon=lon, city=city)


@app.post("/api/weather/route")
def get_route_weather(request: RouteWeatherRequest):
    return fetch_route_weather([p.model_dump() for p in request.points])


@app.post("/api/weather")
def weather_legacy(request: WeatherRequest):
    """Preserves backwards compatibility with existing WeatherRequest endpoint."""
    return fetch_current_weather(lat=request.lat, lon=request.lon, city=request.city)


# ==============================================================================
# Member 4 - Feature C: Places & Recommendations
# ==============================================================================

@app.get("/api/places/recommendations", response_model=List[PlaceItem])
def get_places_get(
    category: str = Query("All"),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    query: Optional[str] = Query(None),
    radius_km: float = Query(25.0),
    limit: int = Query(8)
):
    return get_places_recommendations(
        category=category,
        lat=lat,
        lon=lon,
        query=query,
        radius_km=radius_km,
        limit=limit
    )


@app.post("/api/places/recommendations", response_model=List[PlaceItem])
def get_places_post(request: PlacesRecommendationRequest):
    return get_places_recommendations(
        category=request.category,
        lat=request.lat,
        lon=request.lon,
        route_coords=request.route_coords,
        query=request.query,
        radius_km=request.radius_km,
        limit=request.limit
    )


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host=host, port=port, reload=True)
