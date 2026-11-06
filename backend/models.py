from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field


# ==============================================================================
# Member 3: Trip Planning & Scenic Routing Models
# ==============================================================================

class TripPlanRequest(BaseModel):
    start_location: str = Field(..., description="Starting point or city name")
    destination: str = Field(..., description="Destination point or city name")
    interest: Union[List[str], str] = Field(default="Nature", description="Interest: Nature, Food, Adventure, Culture, Places of worship")
    interests: Optional[List[str]] = Field(default=None, description="Optional list of multiple selected interests")
    budget: str = Field(default="Moderate", description="Budget level: Budget-friendly, Moderate, Premium")
    duration: str = Field(default="3 hours", description="Maximum trip duration: 1 hour, 3 hours, Half a day, Full day")
    profile: str = Field(default="driving-car", description="ORS Profile: driving-car, cycling-regular, foot-walking")
    scenic_factor: str = Field(default="balanced", description="balanced, high, low")
    ors_api_key: Optional[str] = Field(default=None, description="Optional custom OpenRouteService API key")


class Waypoint(BaseModel):
    name: str
    lat: float
    lon: float
    is_stop: bool = False


class ScenicStop(BaseModel):
    id: str
    name: str
    category: str
    lat: float
    lon: float
    description: str
    icon: str = "pin"
    budget: str = "Moderate"
    detour_min: int = 20
    scenic_score: float = 4.5
    is_included: bool = True
    image_url: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None


class RouteDetails(BaseModel):
    distance_km: float
    duration_min: float
    geometry: List[List[float]] = Field(..., description="List of [lon, lat] coordinates in GeoJSON format")
    summary: str
    segments_count: int = 1


class RecalculateRouteRequest(BaseModel):
    start_coords: List[float] = Field(..., description="[lon, lat]")
    dest_coords: List[float] = Field(..., description="[lon, lat]")
    waypoint_coords: List[List[float]] = Field(default=[], description="List of selected [[lon, lat], ...]")
    profile: str = Field(default="driving-car")
    ors_api_key: Optional[str] = None


class TripPlanResponse(BaseModel):
    success: bool
    start_location: Dict[str, Any]
    destination: Dict[str, Any]
    direct_route: RouteDetails
    scenic_route: RouteDetails
    detour_added_km: float
    detour_added_min: float
    scenic_stops: List[ScenicStop]
    provider: str
    message: Optional[str] = None


class PresetTrip(BaseModel):
    id: str
    title: str
    start: str
    destination: str
    interest: str
    duration: str
    description: str


# ==============================================================================
# Member 4: AI Co-Pilot (Gemini), Weather, & Places Models
# ==============================================================================

class PlannedStopContext(BaseModel):
    name: str
    category: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    detour_min: Optional[int] = None


class TripRequest(BaseModel):
    origin: str = Field(default="", max_length=200)
    destination: str = Field(default="", max_length=200)
    interests: list[str] = Field(default_factory=list, max_length=20)
    budget: str = Field(default="Any", max_length=100)
    time_available: str = Field(default="Flexible", max_length=100)
    extra_preferences: str = Field(default="", max_length=1000)
    route_distance_km: Optional[float] = None
    route_duration_min: Optional[float] = None
    planned_stops: List[PlannedStopContext] = Field(default_factory=list)
    weather_summary: Optional[str] = None


class ReplanRequest(TripRequest):
    reason: str = Field(min_length=1, max_length=500)


class CopilotChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    trip_context: Optional[TripRequest] = None
    chat_history: List[Dict[str, str]] = Field(default_factory=list)


class WeatherRequest(BaseModel):
    city: Optional[str] = Field(default="", max_length=150)
    lat: Optional[float] = None
    lon: Optional[float] = None


class RouteWeatherPoint(BaseModel):
    name: str
    lat: float
    lon: float
    role: str = "stop"  # "origin", "stop", "destination"


class RouteWeatherRequest(BaseModel):
    points: List[RouteWeatherPoint] = Field(..., max_length=15)


class PlacesRecommendationRequest(BaseModel):
    category: str = Field(default="All", description="All, Viewpoints, Nature, Food, Attractions, Culture, Worship")
    lat: Optional[float] = None
    lon: Optional[float] = None
    route_coords: Optional[List[List[float]]] = None  # Corridor polyline [[lon, lat], ...]
    query: Optional[str] = None
    radius_km: float = Field(default=25.0, ge=1.0, le=100.0)
    limit: int = Field(default=8, ge=1, le=20)


class PlaceItem(BaseModel):
    id: str
    name: str
    category: str
    lat: float
    lon: float
    address: Optional[str] = None
    distance_km: Optional[float] = None
    distance_display: Optional[str] = None
    rating: Optional[float] = None
    rating_display: str = "Not provided by OpenStreetMap"
    opening_hours: str = "Not reported by provider"
    description: Optional[str] = None
    icon: str = "pin"
    source: str = "OpenStreetMap"
    verified: bool = True


# ==============================================================================
# Authentication & User Persistence Models
# ==============================================================================

class UserRegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255, description="User email address")
    password: str = Field(..., min_length=6, max_length=128, description="User password")
    name: Optional[str] = Field(default=None, max_length=100, description="Display name")


class UserLoginRequest(BaseModel):
    email: str = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    created_at: Optional[str] = None


class MessageResponse(BaseModel):
    message: str
    status: str = "success"


class UserPreferencesUpdate(BaseModel):
    default_interests: Optional[List[str]] = None
    default_budget: Optional[str] = None
    default_duration: Optional[str] = None
    preferred_transport_mode: Optional[str] = None
    scenic_factor: Optional[str] = None


class UserPreferencesResponse(BaseModel):
    user_id: str
    default_interests: List[str] = []
    default_budget: Optional[str] = "Moderate"
    default_duration: Optional[str] = "3 hours"
    preferred_transport_mode: Optional[str] = "driving-car"
    scenic_factor: Optional[str] = "balanced"


class SaveTripRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    start_location: str
    destination: str
    interests: Optional[List[str]] = None
    budget: Optional[str] = None
    duration: Optional[str] = None
    profile: Optional[str] = "driving-car"
    scenic_factor: Optional[str] = "balanced"
    route_geometry: Optional[List[List[float]]] = None
    distance_km: Optional[float] = None
    duration_min: Optional[float] = None
    stops: Optional[List[Dict[str, Any]]] = None
    waypoints: Optional[List[Dict[str, Any]]] = None
    custom_notes: Optional[str] = None


class SavedTripResponse(BaseModel):
    id: str
    user_id: str
    title: str
    start_location: str
    destination: str
    interests: Optional[List[str]] = None
    budget: Optional[str] = None
    duration: Optional[str] = None
    profile: Optional[str] = None
    scenic_factor: Optional[str] = None
    route_geometry: Optional[List[List[float]]] = None
    distance_km: Optional[float] = None
    duration_min: Optional[float] = None
    stops: Optional[List[Dict[str, Any]]] = None
    waypoints: Optional[List[Dict[str, Any]]] = None
    custom_notes: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SavePlaceRequest(BaseModel):
    place_id: str = Field(..., description="External map provider identifier (e.g., OSM node ID, Nominatim ID)")
    name: str = Field(..., min_length=1, max_length=255)
    category: Optional[str] = None
    lat: float
    lon: float
    address: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None


class SavedPlaceResponse(BaseModel):
    id: str = Field(..., description="Database UUID identifier")
    user_id: str
    place_id: str = Field(..., description="External map provider identifier")
    name: str
    category: Optional[str] = None
    lat: float
    lon: float
    address: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    tags: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
