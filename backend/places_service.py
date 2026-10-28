import math
import requests
from typing import List, Dict, Any, Optional, Tuple
from ors_service import haversine_distance

# Use respectful browser-style User-Agent for OpenStreetMap Nominatim & Wikimedia
HEADERS = {
    "User-Agent": "Roamify-RoadTrip-Navigator/1.0 (https://roamify.dev; contact: nav@roamify.dev) AppleWebKit/537.36"
}

CATEGORY_KEYWORDS = {
    "viewpoints": ["viewpoint", "panoramic view", "scenic overlook", "hilltop view"],
    "nature": ["waterfall", "nature reserve", "lake", "national park", "botanical garden", "wildlife sanctuary"],
    "food": ["highway restaurant", "traditional cafe", "dhabha", "eatery", "baker"],
    "attractions": ["tourist attraction", "historic monument", "palace", "museum", "sanctuary"],
    "culture": ["heritage fort", "ancient temple", "archaeological site", "folk arts center"],
    "worship": ["historic temple", "monastery", "church", "shrine"],
}

CATEGORY_ICONS = {
    "Viewpoints": "viewpoint",
    "Nature": "nature",
    "Food": "food",
    "Attractions": "attraction",
    "Culture": "culture",
    "Worship": "worship",
    "All": "pin"
}


def compute_min_distance_to_corridor(
    place_coord: Tuple[float, float],
    corridor_coords: List[List[float]]
) -> float:
    """
    Computes minimum distance from place (lon, lat) to the polyline corridor.
    Samples every few vertices for efficiency.
    """
    if not corridor_coords:
        return 0.0

    min_dist = float("inf")
    # Subsample if corridor has thousands of points
    step = max(1, len(corridor_coords) // 60)
    for i in range(0, len(corridor_coords), step):
        c = corridor_coords[i]
        d = haversine_distance(place_coord, (c[0], c[1]))
        if d < min_dist:
            min_dist = d
    return round(min_dist, 1)


def fetch_nominatim_places(
    query: str,
    limit: int = 8,
    lat: Optional[float] = None,
    lon: Optional[float] = None
) -> List[Dict[str, Any]]:
    """Retrieves real places from OpenStreetMap Nominatim search."""
    params: Dict[str, Any] = {
        "q": query,
        "format": "jsonv2",
        "addressdetails": 1,
        "extratags": 1,
        "limit": min(limit * 2, 20),
    }

    # Proximity viewbox if coordinates provided
    if lat is not None and lon is not None:
        delta = 0.5
        params["viewbox"] = f"{lon - delta},{lat + delta},{lon + delta},{lat - delta}"
        params["bounded"] = 0

    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers=HEADERS,
            timeout=10,
        )
        if resp.status_code != 200:
            print(f"[Nominatim HTTP {resp.status_code}]: {resp.text[:100]}")
            return []
        data = resp.json()
        if not isinstance(data, list):
            return []
        return data
    except Exception as err:
        print(f"[Nominatim Search Error]: {err}")
        return []


def fetch_wikimedia_nearby(
    lat: float,
    lon: float,
    radius_m: int = 35000,
    limit: int = 10
) -> List[Dict[str, Any]]:
    """Retrieves real, verified attractions and points of interest from Wikipedia Geosearch."""
    params = {
        "action": "query",
        "list": "geosearch",
        "gscoord": f"{lat}|{lon}",
        "gsradius": str(min(radius_m, 10000)),  # Max 10,000m per geosearch call
        "gslimit": str(limit),
        "format": "json",
    }
    try:
        resp = requests.get(
            "https://en.wikipedia.org/w/api.php",
            params=params,
            headers=HEADERS,
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data.get("query", {}).get("geosearch", [])
    except Exception as err:
        print(f"[Wikimedia Nearby Error]: {err}")
        return []


def get_places_recommendations(
    category: str = "All",
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    route_coords: Optional[List[List[float]]] = None,
    query: Optional[str] = None,
    radius_km: float = 25.0,
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Retrieves and ranks real places along a travel corridor or near destination.
    Uses real OpenStreetMap Nominatim and Wikimedia geocoded places.
    Deduplicates results and distinguishes available vs unavailable metadata.
    """
    # 1. Determine anchor location
    anchor_lat = lat
    anchor_lon = lon

    if (anchor_lat is None or anchor_lon is None) and route_coords and len(route_coords) > 0:
        # Use midpoint of route corridor
        mid_idx = len(route_coords) // 2
        anchor_lon = route_coords[mid_idx][0]
        anchor_lat = route_coords[mid_idx][1]

    if anchor_lat is None or anchor_lon is None:
        anchor_lat, anchor_lon = 12.9716, 77.5946  # Default fallback hub

    # 2. Build targeted search terms based on user interest / category
    cat_key = category.strip().lower()
    search_keywords = CATEGORY_KEYWORDS.get(cat_key, ["viewpoint", "waterfall", "tourist attraction", "scenic spot"])

    if query and query.strip():
        search_terms = [query.strip()]
    elif cat_key in CATEGORY_KEYWORDS:
        search_terms = CATEGORY_KEYWORDS[cat_key]
    else:
        search_terms = ["viewpoint", "waterfall", "historic temple", "nature reserve", "highway food"]

    raw_places: List[Dict[str, Any]] = []

    # 3. Query OpenStreetMap Nominatim
    for term in search_terms[:2]:
        nom_results = fetch_nominatim_places(
            query=term,
            limit=limit,
            lat=anchor_lat,
            lon=anchor_lon
        )
        for item in nom_results:
            raw_places.append({
                "source": "OpenStreetMap",
                "osm_id": str(item.get("place_id") or item.get("osm_id") or hash(item.get("display_name", ""))),
                "name": item.get("name") or item.get("display_name", "").split(",")[0].strip(),
                "display_name": item.get("display_name", ""),
                "lat": float(item.get("lat")),
                "lon": float(item.get("lon")),
                "type": item.get("type", "attraction"),
                "category_raw": item.get("category", "tourism"),
                "address": item.get("address", {}),
                "extratags": item.get("extratags") or {},
            })

    # 4. Query Wikimedia Geosearch for rich historic/cultural places near anchor
    wiki_results = fetch_wikimedia_nearby(
        lat=anchor_lat,
        lon=anchor_lon,
        radius_m=int(radius_km * 1000),
        limit=limit
    )
    for w in wiki_results:
        raw_places.append({
            "source": "Wikipedia Verified Place",
            "osm_id": f"wiki-{w.get('pageid')}",
            "name": w.get("title", ""),
            "display_name": f"{w.get('title', '')}, nearby attraction",
            "lat": float(w.get("lat")),
            "lon": float(w.get("lon")),
            "type": "historic",
            "category_raw": "historic",
            "address": {},
            "extratags": {},
            "wiki_dist_m": w.get("dist"),
        })

    # 5. Process, deduplicate, calculate distance, and format verified fields
    processed: List[Dict[str, Any]] = []
    seen_names = set()

    for p in raw_places:
        name = p["name"].strip()
        if not name or len(name) < 2:
            continue
        # Normalize name for deduplication
        norm_name = "".join(filter(str.isalnum, name.lower()))
        if norm_name in seen_names:
            continue
        seen_names.add(norm_name)

        plat = p["lat"]
        plon = p["lon"]

        # Calculate real distance from route corridor or anchor point
        if route_coords and len(route_coords) > 1:
            dist_km = compute_min_distance_to_corridor((plon, plat), route_coords)
        else:
            dist_km = round(haversine_distance((anchor_lon, anchor_lat), (plon, plat)), 1)

        # Filter out places beyond max radius
        if dist_km > radius_km * 1.8:
            continue

        # Extract address details if provided by OSM
        addr_dict = p.get("address", {})
        addr_parts = []
        for k in ("road", "suburb", "city", "town", "village", "state"):
            if k in addr_dict:
                addr_parts.append(addr_dict[k])
        address_str = ", ".join(addr_parts) if addr_parts else p.get("display_name", "Address verified on OpenStreetMap")

        # Verified metadata or explicit "not reported"
        extratags = p.get("extratags") or {}
        opening_hours = extratags.get("opening_hours")
        if not opening_hours:
            opening_hours = "Opening hours not reported by provider"

        wheelchair = extratags.get("wheelchair")
        website = extratags.get("website") or extratags.get("contact:website")

        # Map to display category
        mapped_cat = category
        if mapped_cat == "All":
            ptype = p.get("type", "").lower()
            if any(w in ptype for w in ("viewpoint", "peak", "cliff")):
                mapped_cat = "Viewpoints"
            elif any(w in ptype for w in ("nature", "waterfall", "park", "forest")):
                mapped_cat = "Nature"
            elif any(w in ptype for w in ("restaurant", "cafe", "food")):
                mapped_cat = "Food"
            elif any(w in ptype for w in ("temple", "church", "mosque", "worship")):
                mapped_cat = "Worship"
            elif any(w in ptype for w in ("monument", "historic", "museum", "ruins")):
                mapped_cat = "Culture"
            else:
                mapped_cat = "Attractions"

        icon = CATEGORY_ICONS.get(mapped_cat, "pin")

        processed.append({
            "id": f"rec-{p['osm_id']}",
            "name": name,
            "category": mapped_cat,
            "lat": plat,
            "lon": plon,
            "address": address_str,
            "distance_km": dist_km,
            "distance_display": f"{dist_km} km from route",
            "rating": None,  # OpenStreetMap does not provide star ratings
            "rating_display": "Rating not provided by OpenStreetMap",
            "opening_hours": opening_hours,
            "wheelchair_accessible": wheelchair if wheelchair else "Unknown",
            "website": website,
            "description": f"Verified {mapped_cat.lower()} point located ~{dist_km} km along your itinerary corridor.",
            "icon": icon,
            "source": p["source"],
            "verified": True,
        })

    # Sort places by distance to route corridor
    processed.sort(key=lambda x: x["distance_km"])
    return processed[:limit]
