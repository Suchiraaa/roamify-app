import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Query, Response, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import sqlalchemy.exc as sa_exc

# Load environment variables reliably from backend/.env, parent .env, and default
backend_dir = Path(__file__).resolve().parent
load_dotenv(backend_dir / ".env")
load_dotenv(backend_dir.parent / ".env")
load_dotenv()

from database import get_db, init_db, get_database_status
from db_models import User, UserPreference, SavedTrip, SavedPlace
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    generate_csrf_token,
    set_auth_cookies,
    set_csrf_cookie,
    clear_auth_cookies,
    get_current_user,
    verify_csrf,
)

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
    UserRegisterRequest,
    UserLoginRequest,
    UserResponse,
    MessageResponse,
    UserPreferencesUpdate,
    UserPreferencesResponse,
    SaveTripRequest,
    SavedTripResponse,
    SavePlaceRequest,
    SavedPlaceResponse,
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
    description="Personalized Navigation & Road-Trip Planning API with Scenic Routing, Weather, Places, Gemini AI Co-Pilot, and Authentication",
    version="2.1.0"
)

# Initialize SQLite database schema
init_db()

# Parse allowed CORS origins from environment variable
default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://roamify-app-six.vercel.app",
]
frontend_origins_raw = os.getenv("FRONTEND_ORIGINS")
if frontend_origins_raw:
    configured_origins = [o.strip() for o in frontend_origins_raw.split(",") if o.strip()]
    origins_to_allow = list(dict.fromkeys(default_origins + configured_origins))
else:
    origins_to_allow = default_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_to_allow,
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
            "places_recommendations": "enabled",
            "authentication": "enabled",
            "data_persistence": "enabled"
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
            },
            "auth_storage": {
                "configured": True,
                "provider": get_database_status()["provider"],
                "dialect": "SQLite / libSQL"
            }
        }
    }


@app.get("/api/presets", response_model=List[PresetTrip])
def get_presets():
    return PRESET_TRIPS


# ==============================================================================
# Authentication Endpoints
# ==============================================================================

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
def register(
    req: UserRegisterRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    normalized_email = req.email.strip().lower()
    existing_user = db.query(User).filter(User.email == normalized_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists."
        )

    # Hash password with Argon2id
    hashed = hash_password(req.password)
    user_name = req.name.strip() if req.name else normalized_email.split("@")[0]
    user = User(
        email=normalized_email,
        username=user_name,
        hashed_password=hashed
    )
    db.add(user)
    try:
        db.flush()  # populate user.id; raises on unique constraint violation
    except (sa_exc.IntegrityError, ValueError):
        # IntegrityError  — standard SQLAlchemy / SQLite driver
        # ValueError      — libsql/Turso Hrana wire-protocol wrapping of UNIQUE constraint
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists."
        )

    # Create default user preferences
    pref = UserPreference(user_id=user.id)
    db.add(pref)
    try:
        db.commit()
    except (sa_exc.IntegrityError, ValueError):
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists."
        )
    db.refresh(user)

    # Generate session tokens
    token = create_access_token(user_id=str(user.id), email=user.email)
    csrf_token = generate_csrf_token()
    set_auth_cookies(response, token, csrf_token)

    return {
        "user": UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.username,
            created_at=user.created_at.isoformat() if user.created_at else None,
        ),
        "csrf_token": csrf_token,
        "message": "Registration successful."
    }


@app.post("/api/auth/login")
def login(
    req: UserLoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    normalized_email = req.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    # Generate session tokens
    token = create_access_token(user_id=str(user.id), email=user.email)
    csrf_token = generate_csrf_token()
    set_auth_cookies(response, token, csrf_token)

    return {
        "user": UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.username,
            created_at=user.created_at.isoformat() if user.created_at else None,
        ),
        "csrf_token": csrf_token,
        "message": "Login successful."
    }


@app.post("/api/auth/logout")
def logout(response: Response):
    clear_auth_cookies(response)
    return MessageResponse(message="Logged out successfully.")


@app.get("/api/auth/me")
def get_current_user_profile(
    response: Response,
    current_user: User = Depends(get_current_user)
):
    csrf_token = generate_csrf_token()
    set_auth_cookies(response, create_access_token(str(current_user.id), current_user.email), csrf_token)

    return {
        "user": UserResponse(
            id=str(current_user.id),
            email=current_user.email,
            name=current_user.username,
            created_at=current_user.created_at.isoformat() if current_user.created_at else None,
        ),
        "csrf_token": csrf_token
    }


@app.get("/api/auth/csrf")
def get_csrf(response: Response):
    csrf_token = generate_csrf_token()
    set_csrf_cookie(response, csrf_token)
    return {"csrf_token": csrf_token}


# ==============================================================================
# Helper Serializers
# ==============================================================================

def map_trip_to_response(trip: SavedTrip) -> SavedTripResponse:
    trip_data = trip.trip_data or {}
    start_loc = trip.start_location.get("name", "") if isinstance(trip.start_location, dict) else str(trip.start_location)
    dest_loc = trip.destination.get("name", "") if isinstance(trip.destination, dict) else str(trip.destination)

    return SavedTripResponse(
        id=str(trip.id),
        user_id=str(trip.user_id),
        title=trip.title,
        start_location=start_loc,
        destination=dest_loc,
        interests=trip_data.get("interests", []),
        budget=trip_data.get("budget", "Moderate"),
        duration=trip_data.get("duration", "3 hours"),
        profile=trip_data.get("profile", "driving-car"),
        scenic_factor=trip_data.get("scenic_factor", "balanced"),
        route_geometry=trip_data.get("route_geometry"),
        distance_km=trip_data.get("distance_km"),
        duration_min=trip_data.get("duration_min"),
        stops=trip_data.get("stops", []),
        waypoints=trip_data.get("waypoints", []),
        custom_notes=trip_data.get("custom_notes"),
        created_at=trip.created_at.isoformat() if trip.created_at else None,
        updated_at=trip.updated_at.isoformat() if trip.updated_at else None,
    )


def map_place_to_response(place: SavedPlace) -> SavedPlaceResponse:
    return SavedPlaceResponse(
        id=str(place.id),
        user_id=str(place.user_id),
        place_id=place.place_id,
        name=place.name,
        category=place.category,
        lat=place.lat,
        lon=place.lon,
        address=place.address,
        description=place.description,
        image_url=None,
        tags={"source": place.source},
        created_at=place.created_at.isoformat() if place.created_at else None,
    )


# ==============================================================================
# User Preferences Endpoints
# ==============================================================================

@app.get("/api/user/preferences", response_model=UserPreferencesResponse)
def get_preferences(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)

    return UserPreferencesResponse(
        user_id=str(current_user.id),
        default_interests=pref.interests or [],
        default_budget=pref.budget or "Moderate",
        default_duration=pref.duration or "3 hours",
        preferred_transport_mode=pref.profile or "driving-car",
        scenic_factor=pref.scenic_factor or "balanced"
    )


@app.put("/api/user/preferences", response_model=UserPreferencesResponse)
def update_preferences(
    req: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(verify_csrf)
):
    pref = db.query(UserPreference).filter(UserPreference.user_id == current_user.id).first()
    if not pref:
        pref = UserPreference(user_id=current_user.id)
        db.add(pref)

    if req.default_interests is not None:
        pref.interests = req.default_interests
    if req.default_budget is not None:
        pref.budget = req.default_budget
    if req.default_duration is not None:
        pref.duration = req.default_duration
    if req.preferred_transport_mode is not None:
        pref.profile = req.preferred_transport_mode
    if req.scenic_factor is not None:
        pref.scenic_factor = req.scenic_factor

    db.commit()
    db.refresh(pref)

    return UserPreferencesResponse(
        user_id=str(current_user.id),
        default_interests=pref.interests or [],
        default_budget=pref.budget,
        default_duration=pref.duration,
        preferred_transport_mode=pref.profile,
        scenic_factor=pref.scenic_factor or "balanced"
    )


# ==============================================================================
# Saved Trips Endpoints
# ==============================================================================

@app.get("/api/user/trips", response_model=List[SavedTripResponse])
def get_user_trips(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    trips = db.query(SavedTrip).filter(
        SavedTrip.user_id == current_user.id
    ).order_by(SavedTrip.created_at.desc()).all()
    return [map_trip_to_response(t) for t in trips]


@app.post("/api/user/trips", response_model=SavedTripResponse, status_code=status.HTTP_201_CREATED)
def save_trip(
    req: SaveTripRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(verify_csrf)
):
    trip_data = {
        "interests": req.interests or [],
        "budget": req.budget,
        "duration": req.duration,
        "profile": req.profile or "driving-car",
        "scenic_factor": req.scenic_factor or "balanced",
        "route_geometry": req.route_geometry or [],
        "distance_km": req.distance_km,
        "duration_min": req.duration_min,
        "stops": req.stops or [],
        "waypoints": req.waypoints or [],
        "custom_notes": req.custom_notes,
    }

    trip = SavedTrip(
        user_id=current_user.id,
        title=req.title,
        start_location={"name": req.start_location},
        destination={"name": req.destination},
        trip_data=trip_data
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return map_trip_to_response(trip)


@app.delete("/api/user/trips/{trip_id}", response_model=MessageResponse)
def delete_trip(
    trip_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(verify_csrf)
):
    trip = db.query(SavedTrip).filter(
        SavedTrip.id == trip_id,
        SavedTrip.user_id == current_user.id
    ).first()
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved trip not found or does not belong to you."
        )

    db.delete(trip)
    db.commit()
    return MessageResponse(message="Trip deleted successfully.")


# ==============================================================================
# Saved Places Endpoints (Bookmarks & Favorites)
# ==============================================================================

@app.get("/api/user/places", response_model=List[SavedPlaceResponse])
def get_user_places(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    places = db.query(SavedPlace).filter(
        SavedPlace.user_id == current_user.id
    ).order_by(SavedPlace.created_at.desc()).all()
    return [map_place_to_response(p) for p in places]


@app.post("/api/user/places", response_model=SavedPlaceResponse, status_code=status.HTTP_201_CREATED)
def save_place(
    req: SavePlaceRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(verify_csrf)
):
    # Check if place is already saved by this user
    existing = db.query(SavedPlace).filter(
        SavedPlace.user_id == current_user.id,
        SavedPlace.place_id == req.place_id
    ).first()
    if existing:
        response.status_code = status.HTTP_200_OK
        return map_place_to_response(existing)

    place = SavedPlace(
        user_id=current_user.id,
        place_id=req.place_id,
        name=req.name,
        category=req.category or "Scenic Vista",
        lat=req.lat,
        lon=req.lon,
        address=req.address,
        description=req.description,
        source="user_bookmark"
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return map_place_to_response(place)


@app.delete("/api/user/places/{place_db_id}", response_model=MessageResponse)
def delete_place_by_db_id(
    place_db_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(verify_csrf)
):
    """Delete a saved place by its database UUID (id)."""
    place = db.query(SavedPlace).filter(
        SavedPlace.id == place_db_id,
        SavedPlace.user_id == current_user.id
    ).first()
    if not place:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved place not found or does not belong to you."
        )

    db.delete(place)
    db.commit()
    return MessageResponse(message="Place removed from saved places.")


@app.delete("/api/user/places/by-place-id/{place_id}", response_model=MessageResponse)
def delete_place_by_place_id(
    place_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(verify_csrf)
):
    """Delete a saved place by external map provider identifier (place_id)."""
    place = db.query(SavedPlace).filter(
        SavedPlace.place_id == place_id,
        SavedPlace.user_id == current_user.id
    ).first()
    if not place:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved place not found."
        )

    db.delete(place)
    db.commit()
    return MessageResponse(message="Place removed from saved places.")


# ==============================================================================
# Member 3: Scenic Routing & Recalculation (Preserved Unchanged)
# ==============================================================================

@app.post("/api/plan-trip", response_model=TripPlanResponse)
async def plan_trip(req: TripPlanRequest, x_ors_api_key: Optional[str] = Header(None)):
    key_val = x_ors_api_key if isinstance(x_ors_api_key, str) else None
    key = req.ors_api_key or key_val

    try:
        start_info = await ors_client.geocode(req.start_location, custom_key=key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Start location error: {str(e)}")

    try:
        dest_info = await ors_client.geocode(req.destination, custom_key=key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Destination error: {str(e)}")

    start_coord = (start_info["lon"], start_info["lat"])
    dest_coord = (dest_info["lon"], dest_info["lat"])

    direct_route_raw = await ors_client.get_directions(
        coordinates=[[start_coord[0], start_coord[1]], [dest_coord[0], dest_coord[1]]],
        profile=req.profile,
        custom_key=key
    )

    max_duration_min = parse_duration_to_minutes(req.duration)

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

    scenic_route_raw = direct_route_raw
    result_message = ""

    if direct_route_raw["duration_min"] > max_duration_min:
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

            worst_idx = max(
                range(len(remaining_stops)),
                key=lambda i: remaining_stops[i].detour_min,
            )
            remaining_stops.pop(worst_idx)

        if scenic_route_raw is not None:
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
