import math
import os
import re
from pathlib import Path
from typing import List, Tuple, Dict, Any, Optional
from urllib.parse import quote
import httpx
from dotenv import load_dotenv

ORS_BASE_URL = "https://api.openrouteservice.org"
OSRM_BASE_URL = "https://router.project-osrm.org"


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
        backend_dir = Path(__file__).resolve().parent
        load_dotenv(backend_dir / ".env")
        load_dotenv(backend_dir.parent / ".env")
        load_dotenv(backend_dir.parent / "frontend" / ".env")
        load_dotenv()

        self.default_api_key = (
            default_api_key
            or os.getenv("ORS_API_KEY", "").strip()
            or os.getenv("OPENROUTESERVICE_API_KEY", "").strip()
            or os.getenv("ORS_KEY", "").strip()
            or os.getenv("VITE_ORS_API_KEY", "").strip()
        )
        self.mapbox_token = (
            os.getenv("MAPBOX_TOKEN", "").strip()
            or os.getenv("VITE_MAPBOX_TOKEN", "").strip()
            or os.getenv("MAPBOX_ACCESS_TOKEN", "").strip()
        )

    def get_effective_key(self, custom_key: Optional[str] = None) -> Optional[str]:
        if custom_key and isinstance(custom_key, str) and custom_key.strip():
            key = custom_key.strip()
            if not key.startswith("your_"):
                return key
        if self.default_api_key and not self.default_api_key.startswith("your_"):
            return self.default_api_key
        return None

    async def geocode(self, query: str, custom_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Global geocoding pipeline supporting valid cities, towns, villages, landmarks,
        tourist attractions, and street addresses worldwide.
        
        Tier 1: Direct Coordinate Recognition (e.g., '12.9716, 77.5946')
        Tier 2: Mapbox Geocoding API (high-accuracy global landmarks, POIs, and addresses)
        Tier 3: OpenRouteService Geocoding (if active ORS API key is configured)
        Tier 4: Photon OSM API (fuzzy/typo-tolerant OpenStreetMap geocoding)
        Tier 5: Nominatim OpenStreetMap (comprehensive worldwide street/village geocoding)
        """
        clean_q = query.strip()
        if not clean_q:
            raise ValueError("Location query cannot be empty.")

        # ── Tier 1: Direct Coordinate Input ──────────────────────────────────
        if "," in clean_q:
            parts = [p.strip() for p in clean_q.split(",")]
            if len(parts) == 2:
                try:
                    lat_val = float(parts[0])
                    lon_val = float(parts[1])
                    if -90.0 <= lat_val <= 90.0 and -180.0 <= lon_val <= 180.0:
                        return {
                            "name": f"{lat_val:.4f}, {lon_val:.4f}",
                            "display_name": f"Coordinates ({lat_val:.4f}, {lon_val:.4f})",
                            "lon": lon_val,
                            "lat": lat_val,
                            "source": "Direct Coordinates",
                        }
                except ValueError:
                    pass

        # ── Tier 2: Mapbox Places Geocoding (Global Landmarks, Towns, Addresses) ──
        if self.mapbox_token:
            try:
                encoded_q = quote(clean_q)
                url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{encoded_q}.json"
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(url, params={"access_token": self.mapbox_token, "limit": 1})
                    if resp.status_code == 200:
                        feats = resp.json().get("features", [])
                        if feats:
                            f = feats[0]
                            coords = f["geometry"]["coordinates"] # [lon, lat]
                            return {
                                "name": f.get("text") or clean_q.split(",")[0].strip(),
                                "display_name": f.get("place_name") or clean_q,
                                "lon": float(coords[0]),
                                "lat": float(coords[1]),
                                "source": "Mapbox Places",
                            }
            except Exception as e:
                print(f"[Mapbox Geocode Notice]: {e}")

        # ── Tier 3: OpenRouteService Geocoding ───────────────────────────────
        api_key = self.get_effective_key(custom_key)
        if api_key:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        f"{ORS_BASE_URL}/geocode/search",
                        params={"api_key": api_key, "text": clean_q, "size": 1}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        features = data.get("features", [])
                        if features:
                            feat = features[0]
                            coords = feat["geometry"]["coordinates"] # [lon, lat]
                            props = feat.get("properties", {})
                            return {
                                "name": props.get("name") or clean_q.split(",")[0].strip(),
                                "display_name": props.get("label") or clean_q,
                                "lon": float(coords[0]),
                                "lat": float(coords[1]),
                                "source": "OpenRouteService",
                            }
            except Exception as e:
                print(f"[ORS Geocode Notice]: {e}")

        # ── Tier 4: Photon OSM API (Fuzzy, typo-tolerant OpenStreetMap) ─────
        queries_to_try = [clean_q]
        if "," in clean_q:
            queries_to_try.append(clean_q.split(",")[0].strip())

        for q_candidate in queries_to_try:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        "https://photon.komoot.io/api/",
                        params={"q": q_candidate, "limit": 1}
                    )
                    if resp.status_code == 200:
                        feats = resp.json().get("features", [])
                        if feats:
                            f = feats[0]
                            coords = f["geometry"]["coordinates"] # [lon, lat]
                            props = f.get("properties", {})
                            loc_name = props.get("name") or q_candidate
                            country = props.get("country", "")
                            state = props.get("state", "")
                            city = props.get("city", "")
                            disp = ", ".join(filter(bool, [loc_name, city, state, country])) or q_candidate
                            return {
                                "name": loc_name,
                                "display_name": disp,
                                "lon": float(coords[0]),
                                "lat": float(coords[1]),
                                "source": "Photon OSM",
                            }
            except Exception as e:
                print(f"[Photon Geocode Notice]: {e}")

        # ── Tier 5: Nominatim OpenStreetMap (Exhaustive Global Cartography) ──
        headers = {
            "User-Agent": "RoamifyTravelPlatform/2.0 (contact: info@roamify.app)",
            "Accept-Language": "en"
        }
        for q_candidate in queries_to_try:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(
                        "https://nominatim.openstreetmap.org/search",
                        params={"q": q_candidate, "format": "jsonv2", "addressdetails": 1, "limit": 1},
                        headers=headers
                    )
                    if resp.status_code == 200:
                        results = resp.json()
                        if results:
                            item = results[0]
                            return {
                                "name": item.get("name") or q_candidate,
                                "display_name": item.get("display_name", q_candidate),
                                "lon": float(item["lon"]),
                                "lat": float(item["lat"]),
                                "source": "Nominatim OSM",
                            }
            except Exception as e:
                print(f"[Nominatim Notice on '{q_candidate}']: {e}")

        raise ValueError(
            f"Could not locate '{clean_q}'. Please check spelling or specify a nearby city or country (e.g., 'Paris, France' or 'Zermatt, Switzerland')."
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
