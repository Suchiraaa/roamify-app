import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables reliably from backend/.env and parent
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
    PresetTrip
)
from ors_service import OpenRouteServiceClient
from scenic_finder import find_scenic_stops_along_route

app = FastAPI(
    title="Roamify Scenic Routing API",
    description="FastAPI Backend for Roamify Trip Planner & Scenic Routing with OpenRouteServices",
    version="1.0.0"
)

# Enable CORS for local development (React Vite at localhost:5173, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

@app.get("/")
def root():
    return {
        "app": "Roamify Scenic Routing API",
        "docs": "/docs",
        "health": "/api/health"
    }

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    from fastapi import Response
    return Response(status_code=204)

@app.get("/api/health")
def health_check(x_ors_api_key: Optional[str] = Header(None)):
    key_val = x_ors_api_key if isinstance(x_ors_api_key, str) else None
    configured = bool(ors_client.get_effective_key(key_val))
    return {
        "status": "online",
        "service": "Roamify Trip Planner & Scenic Routing Engine",
        "ors_api_key_configured": configured,
        "mode": "Live OpenRouteService" if configured else "OSRM & Synthetic Fallback (Add ORS_API_KEY for live ORS)"
    }

@app.get("/api/presets", response_model=List[PresetTrip])
def get_presets():
    return PRESET_TRIPS

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

    # Step 3: Discover scenic places along the route corridor
    stops_raw = await find_scenic_stops_along_route(
        start_coord=start_coord,
        dest_coord=dest_coord,
        interest=req.interest,
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
            icon=s.get("icon", "📍"),
            budget=s.get("budget", req.budget),
            detour_min=s.get("detour_min", 20),
            scenic_score=s.get("scenic_score", 4.5),
            is_included=True
        )
        for s in stops_raw
    ]

    # Step 4: Compute scenic route with stops as waypoints
    if scenic_stops:
        scenic_waypoint_coords = [[s.lon, s.lat] for s in scenic_stops]
        all_coords = [[start_coord[0], start_coord[1]]] + scenic_waypoint_coords + [[dest_coord[0], dest_coord[1]]]

        scenic_route_raw = await ors_client.get_directions(
            coordinates=all_coords,
            profile=req.profile,
            custom_key=key
        )
    else:
        scenic_route_raw = direct_route_raw

    # Step 5: Calculate detour differences
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
        message=f"Discovered {len(scenic_stops)} scenic {req.interest.lower()} stops along your journey corridor."
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
