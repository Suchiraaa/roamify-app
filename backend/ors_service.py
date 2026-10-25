import math
import os
import re
from typing import List, Tuple, Dict, Any, Optional
import httpx

ORS_BASE_URL = "https://api.openrouteservice.org"
OSRM_BASE_URL = "https://router.project-osrm.org"

# Instant local dictionary for popular travel hubs and presets (guarantees zero downtime)
COMMON_LOCATIONS: Dict[str, Tuple[float, float, str]] = {
    "bengaluru": (12.9716, 77.5946, "Bengaluru, Karnataka, India"),
    "bangalore": (12.9716, 77.5946, "Bengaluru, Karnataka, India"),
    "mysuru": (12.2958, 76.6394, "Mysuru, Karnataka, India"),
    "mysore": (12.2958, 76.6394, "Mysuru, Karnataka, India"),
    "mumbai": (19.0760, 72.8777, "Mumbai, Maharashtra, India"),
    "pune": (18.5204, 73.8567, "Pune, Maharashtra, India"),
    "delhi": (28.6139, 77.2090, "Delhi, India"),
    "new delhi": (28.6139, 77.2090, "New Delhi, Delhi, India"),
    "agra": (27.1767, 78.0081, "Agra, Uttar Pradesh, India"),
    "jaipur": (26.9124, 75.7873, "Jaipur, Rajasthan, India"),
    "goa": (15.2993, 74.1240, "Goa, India"),
    "panaji": (15.4909, 73.8278, "Panaji, Goa, India"),
    "hyderabad": (17.3850, 78.4867, "Hyderabad, Telangana, India"),
    "chennai": (13.0827, 80.2707, "Chennai, Tamil Nadu, India"),
    "kolkata": (22.5726, 88.3639, "Kolkata, West Bengal, India"),
    "ooty": (11.4102, 76.6950, "Ooty, Tamil Nadu, India"),
    "coorg": (12.4244, 75.7382, "Coorg, Karnataka, India"),
    "madikeri": (12.4244, 75.7382, "Madikeri, Coorg, Karnataka, India"),
    "kochi": (9.9312, 76.2673, "Kochi, Kerala, India"),
    "munnar": (10.0889, 77.0595, "Munnar, Kerala, India"),
    "san francisco": (37.7749, -122.4194, "San Francisco, California, USA"),
    "big sur": (36.2704, -121.8081, "Big Sur, California, USA"),
    "los angeles": (34.0522, -118.2437, "Los Angeles, California, USA"),
    "new york": (40.7128, -74.0060, "New York, USA"),
    "london": (51.5074, -0.1278, "London, United Kingdom"),
    "paris": (48.8566, 2.3522, "Paris, France"),
    "ramadevara": (12.7231, 77.2917, "Ramadevara Betta, Karnataka"),
    "ramanagara": (12.7209, 77.2799, "Ramanagara, Karnataka, India"),
    "channapatna": (12.6517, 77.2089, "Channapatna, Karnataka, India"),
    "mandya": (12.5226, 76.8976, "Mandya, Karnataka, India"),
    "srirangapatna": (12.4241, 76.6950, "Srirangapatna, Karnataka, India")
}

def haversine_distance(coord1: Tuple[float, float], coord2: Tuple[float, float]) -> float:
    """
    Calculate great circle distance between two points on earth in km.
    coord: (lon, lat)
    """
    lon1, lat1 = coord1
    lon2, lat2 = coord2
    R = 6371.0

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

class OpenRouteServiceClient:
    def __init__(self, default_api_key: Optional[str] = None):
        from pathlib import Path
        from dotenv import load_dotenv
        backend_dir = Path(__file__).resolve().parent
        load_dotenv(backend_dir / ".env")
        load_dotenv(backend_dir.parent / ".env")
        load_dotenv()
        self.default_api_key = (
            default_api_key
            or os.getenv("ORS_API_KEY", "").strip()
            or os.getenv("VITE_ORS_API_KEY", "").strip()
        )

    def get_effective_key(self, custom_key: Optional[str] = None) -> Optional[str]:
        if custom_key and isinstance(custom_key, str) and custom_key.strip():
            return custom_key.strip()
        if self.default_api_key:
            return self.default_api_key
        return None

    async def geocode(self, query: str, custom_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Geocodes a location name to { name, lat, lon, display_name }.
        Tier 1: Instant local dictionary lookup.
        Tier 2: OpenRouteService Geocoding (if key provided).
        Tier 3: Photon OSM Geocoding (high reliability, no strict user-agent blocking).
        Tier 4: Nominatim OpenStreetMap (with browser headers & simplified tokens).
        """
        clean_q = query.strip().lower()

        # Tier 1: Check instant local dictionary
        for key, (lat, lon, label) in COMMON_LOCATIONS.items():
            if key in clean_q or clean_q in key:
                return {
                    "name": query.split(",")[0].strip(),
                    "display_name": label,
                    "lon": lon,
                    "lat": lat,
                    "source": "Local Geocache"
                }

        api_key = self.get_effective_key(custom_key)

        # Tier 2: OpenRouteService Geocoding if key is available
        if api_key:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        f"{ORS_BASE_URL}/geocode/search",
                        params={"api_key": api_key, "text": query, "size": 1}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        features = data.get("features", [])
                        if features:
                            feat = features[0]
                            coords = feat["geometry"]["coordinates"] # [lon, lat]
                            props = feat.get("properties", {})
                            return {
                                "name": props.get("name", query),
                                "display_name": props.get("label", query),
                                "lon": float(coords[0]),
                                "lat": float(coords[1]),
                                "source": "OpenRouteService Geocode"
                            }
            except Exception as e:
                print(f"[ORS Geocode Error] {e}")

        # Tier 3: Photon OSM API (Fast, free OpenStreetMap geocoding with no email restrictions)
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    "https://photon.komoot.io/api/",
                    params={"q": query, "limit": 1}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    feats = data.get("features", [])
                    if feats:
                        f = feats[0]
                        coords = f["geometry"]["coordinates"]
                        p = f.get("properties", {})
                        city_name = p.get("name") or query.split(",")[0]
                        country = p.get("country", "")
                        state = p.get("state", "")
                        disp = ", ".join(filter(bool, [city_name, state, country])) or query
                        return {
                            "name": city_name,
                            "display_name": disp,
                            "lon": float(coords[0]),
                            "lat": float(coords[1]),
                            "source": "Photon OSM"
                        }
        except Exception as e:
            print(f"[Photon Geocode Error] {e}")

        # Tier 4: Nominatim OSM Geocoding (with realistic User-Agent)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Roamify/1.0",
            "Accept-Language": "en"
        }
        queries_to_try = [query]
        if "," in query:
            queries_to_try.append(query.split(",")[0].strip())

        for q_try in queries_to_try:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={"q": q_try, "format": "json", "limit": 1},
                        headers=headers
                    )
                    if resp.status_code == 200:
                        results = resp.json()
                        if results:
                            item = results[0]
                            return {
                                "name": item.get("name") or q_try,
                                "display_name": item.get("display_name", q_try),
                                "lon": float(item["lon"]),
                                "lat": float(item["lat"]),
                                "source": "Nominatim OSM"
                            }
            except Exception as e:
                print(f"[Nominatim Error on '{q_try}'] {e}")

        raise ValueError(
            f"Could not locate destination: '{query}'. Try a shorter city name, e.g. 'Bengaluru' or 'Mysuru'."
        )

    async def get_directions(
        self,
        coordinates: List[List[float]], # [[lon, lat], ...]
        profile: str = "driving-car",
        custom_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculates directions between points.
        Returns { distance_km, duration_min, geometry, provider, summary }
        """
        api_key = self.get_effective_key(custom_key)

        # 1. Try OpenRouteService if API key is provided
        if api_key:
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    payload = {
                        "coordinates": coordinates,
                        "instructions": False,
                        "preference": "recommended"
                    }
                    resp = await client.post(
                        f"{ORS_BASE_URL}/v2/directions/{profile}/geojson",
                        json=payload,
                        headers={
                            "Authorization": api_key,
                            "Content-Type": "application/json; charset=utf-8"
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        feat = data["features"][0]
                        props = feat.get("properties", {})
                        summary = props.get("summary", {})
                        distance_m = summary.get("distance", 0.0)
                        duration_s = summary.get("duration", 0.0)
                        geom_coords = feat["geometry"]["coordinates"] # list of [lon, lat]

                        return {
                            "distance_km": round(distance_m / 1000.0, 2),
                            "duration_min": round(duration_s / 60.0, 1),
                            "geometry": geom_coords,
                            "provider": "OpenRouteService",
                            "summary": f"{round(distance_m/1000.0, 1)} km, {round(duration_s/60.0)} mins"
                        }
                    else:
                        print(f"[ORS Directions API] Returned {resp.status_code}: {resp.text}")
            except Exception as e:
                print(f"[ORS Directions API Error]: {e}. Falling back to OSRM...")

        # 2. Fallback to public OSRM directions
        try:
            coord_str = ";".join([f"{c[0]},{c[1]}" for c in coordinates])
            osrm_profile = "driving"
            if "cycling" in profile:
                osrm_profile = "bike"
            elif "foot" in profile:
                osrm_profile = "walk"

            async with httpx.AsyncClient(timeout=12.0) as client:
                url = f"{OSRM_BASE_URL}/route/v1/{osrm_profile}/{coord_str}"
                resp = await client.get(url, params={"overview": "full", "geometries": "geojson"})
                if resp.status_code == 200:
                    data = resp.json()
                    routes = data.get("routes", [])
                    if routes:
                        best = routes[0]
                        dist_km = round(best["distance"] / 1000.0, 2)
                        dur_min = round(best["duration"] / 60.0, 1)
                        geom = best["geometry"]["coordinates"]
                        return {
                            "distance_km": dist_km,
                            "duration_min": dur_min,
                            "geometry": geom,
                            "provider": "OSRM (OpenRouteService Fallback)",
                            "summary": f"{dist_km} km, {round(dur_min)} mins"
                        }
        except Exception as e:
            print(f"[OSRM Directions Error]: {e}. Synthesizing interpolated route...")

        # 3. Ultimate Fallback: Synthesized route with natural curve
        return self._synthesize_fallback_route(coordinates)

    def _synthesize_fallback_route(self, coordinates: List[List[float]]) -> Dict[str, Any]:
        """
        Creates smooth route geometry if external routing APIs are unreachable.
        """
        full_coords = []
        total_dist = 0.0

        for i in range(len(coordinates) - 1):
            p1 = coordinates[i]
            p2 = coordinates[i + 1]
            seg_dist = haversine_distance((p1[0], p1[1]), (p2[0], p2[1]))
            total_dist += seg_dist

            steps = max(8, int(seg_dist / 4))
            for s in range(steps):
                t = s / steps
                perp_lat = -(p2[0] - p1[0]) * 0.07 * math.sin(math.pi * t)
                perp_lon = (p2[1] - p1[1]) * 0.07 * math.sin(math.pi * t)
                lon = p1[0] + (p2[0] - p1[0]) * t + perp_lon
                lat = p1[1] + (p2[1] - p1[1]) * t + perp_lat
                full_coords.append([round(lon, 6), round(lat, 6)])

        full_coords.append(coordinates[-1])
        duration_min = round((total_dist / 50.0) * 60, 1)

        return {
            "distance_km": round(total_dist, 2),
            "duration_min": duration_min,
            "geometry": full_coords,
            "provider": "Roamify Route Synthesizer (Offline Fallback)",
            "summary": f"{round(total_dist, 1)} km, ~{round(duration_min)} mins"
        }
