from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class TripPlanRequest(BaseModel):
    start_location: str = Field(..., description="Starting point or city name")
    destination: str = Field(..., description="Destination point or city name")
    interest: str = Field(default="Nature", description="Interest: Nature, Food, Adventure, Culture, Places of worship")
    budget: str = Field(default="Moderate", description="Budget level: Budget-friendly, Moderate, Premium")
    duration: str = Field(default="3 hours", description="Available time: 1 hour, 3 hours, Half a day, Full day")
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
    icon: str = "📍"
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
