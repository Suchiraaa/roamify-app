import os
import requests
from typing import Dict, Any, List, Optional
from fastapi import HTTPException

OPENWEATHER_BASE = "https://api.openweathermap.org/data/2.5"


def get_weather_api_key() -> str:
    key = os.getenv("OPENWEATHER_API_KEY", "").strip()
    if not key or key == "your_openweather_api_key_here" or key == "your_openweathermap_key_here":
        raise HTTPException(
            status_code=503,
            detail="OpenWeatherMap API key is missing or not configured in backend/.env.",
        )
    return key


def get_travel_advisory(condition: str, temp_c: float, wind_kmh: float, pop: float = 0.0) -> str:
    """Generates an honest, practical advisory based on real weather conditions."""
    cond_lower = condition.lower()
    if any(w in cond_lower for w in ("thunderstorm", "tornado", "squall", "heavy rain")):
        return "Severe weather detected: expect reduced visibility, slick roads, and potential mountain delays. Drive with extreme caution."
    if any(w in cond_lower for w in ("rain", "drizzle", "shower")):
        return "Rain expected: highways and ghat roads will be slick. Allow extra stopping distance and check wiper blades."
    if any(w in cond_lower for w in ("snow", "sleet", "blizzard")):
        return "Winter conditions detected: check tire chains and local pass conditions."
    if temp_c >= 38:
        return "Extreme heat advisory: maintain vehicle coolant levels, stay well hydrated, and limit afternoon sun exposure."
    if temp_c <= 0:
        return "Freezing temperatures: watch for black ice on elevated bridges and shady mountain bends."
    if wind_kmh >= 45:
        return "High crosswinds: maintain a firm grip on the steering wheel, especially on elevated flyovers."
    if pop >= 0.5:
        return f"{int(pop * 100)}% chance of rain: carry umbrellas and keep covered stops in mind."
    return "Favorable travel conditions. Local weather in mountain and coastal corridors can change rapidly, so verify before setting out."


def fetch_current_weather(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    city: Optional[str] = None
) -> Dict[str, Any]:
    """Retrieves real current weather from OpenWeatherMap using coordinates (preferred) or city name."""
    api_key = get_weather_api_key()

    params: Dict[str, Any] = {
        "appid": api_key,
        "units": "metric",
    }

    if lat is not None and lon is not None:
        params["lat"] = lat
        params["lon"] = lon
    elif city and city.strip():
        params["q"] = city.strip()
    else:
        raise HTTPException(
            status_code=400,
            detail="Either valid coordinates (lat, lon) or a city name must be provided.",
        )

    try:
        resp = requests.get(
            f"{OPENWEATHER_BASE}/weather",
            params=params,
            timeout=12,
        )

        if resp.status_code == 401:
            raise HTTPException(
                status_code=502,
                detail="OpenWeatherMap API key is invalid or not activated.",
            )
        if resp.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Location not found by OpenWeatherMap: {city or f'({lat}, {lon})'}.",
            )
        resp.raise_for_status()

        data = resp.json()

        main = data.get("main", {})
        weather_list = data.get("weather", [{}])
        first_weather = weather_list[0] if weather_list else {}
        wind = data.get("wind", {})
        rain = data.get("rain", {})
        snow = data.get("snow", {})

        condition = first_weather.get("description", "Unknown").capitalize()
        icon = first_weather.get("icon", "01d")
        temp = float(main.get("temp", 0.0))
        feels_like = float(main.get("feels_like", temp))
        wind_speed_ms = float(wind.get("speed", 0.0))
        wind_kmh = round(wind_speed_ms * 3.6, 1)

        # Precipitation in last 1 hour or 3 hours if reported
        precip_mm = rain.get("1h") or rain.get("3h") or snow.get("1h") or snow.get("3h")

        advisory = get_travel_advisory(condition, temp, wind_kmh)

        return {
            "city": data.get("name") or city or "Route Location",
            "country": data.get("sys", {}).get("country", ""),
            "coordinates": {
                "lat": data.get("coord", {}).get("lat", lat),
                "lon": data.get("coord", {}).get("lon", lon),
            },
            "temperature_c": round(temp, 1),
            "feels_like_c": round(feels_like, 1),
            "temp_min_c": round(float(main.get("temp_min", temp)), 1),
            "temp_max_c": round(float(main.get("temp_max", temp)), 1),
            "condition": condition,
            "icon": icon,
            "icon_url": f"https://openweathermap.org/img/wn/{icon}@2x.png",
            "humidity_percent": main.get("humidity", 0),
            "wind_speed_kmh": wind_kmh,
            "pressure_hpa": main.get("pressure"),
            "precipitation_mm": round(float(precip_mm), 1) if precip_mm is not None else None,
            "travel_advisory": advisory,
            "provider": "OpenWeatherMap Live API",
            "disclaimer": "Weather conditions are live observations from OpenWeatherMap and can change rapidly during travel. Verify before departure.",
        }

    except HTTPException:
        raise
    except requests.RequestException as err:
        print(f"[Weather Service Request Failed]: {err}")
        raise HTTPException(
            status_code=502,
            detail="Failed to connect to OpenWeatherMap. Please check your network and API key.",
        )
    except (KeyError, ValueError, IndexError) as err:
        print(f"[Weather Parsing Error]: {err}")
        raise HTTPException(
            status_code=502,
            detail="OpenWeatherMap returned an unexpected response structure.",
        )


def fetch_forecast(
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    city: Optional[str] = None
) -> Dict[str, Any]:
    """Retrieves 5-day / 3-hour forecast from OpenWeatherMap and aggregates daily outlook."""
    api_key = get_weather_api_key()

    params: Dict[str, Any] = {
        "appid": api_key,
        "units": "metric",
    }

    if lat is not None and lon is not None:
        params["lat"] = lat
        params["lon"] = lon
    elif city and city.strip():
        params["q"] = city.strip()
    else:
        raise HTTPException(
            status_code=400,
            detail="Either valid coordinates (lat, lon) or a city name must be provided.",
        )

    try:
        resp = requests.get(
            f"{OPENWEATHER_BASE}/forecast",
            params=params,
            timeout=12,
        )

        if resp.status_code == 401:
            raise HTTPException(
                status_code=502,
                detail="OpenWeatherMap API key is invalid or not activated.",
            )
        if resp.status_code == 404:
            return {
                "forecast_available": False,
                "reason": "Location not found in OpenWeatherMap forecast database.",
                "days": [],
            }
        resp.raise_for_status()

        data = resp.json()
        forecast_items = data.get("list", [])

        if not forecast_items:
            return {
                "forecast_available": False,
                "reason": "Provider returned an empty forecast list.",
                "days": [],
            }

        # Aggregate 3-hour slices into daily buckets
        days_map: Dict[str, Dict[str, Any]] = {}
        for item in forecast_items:
            dt_txt = item.get("dt_txt", "")
            date_str = dt_txt.split(" ")[0] if " " in dt_txt else "Upcoming"

            main = item.get("main", {})
            w_list = item.get("weather", [{}])
            w_info = w_list[0] if w_list else {}
            pop = float(item.get("pop", 0.0))
            temp = float(main.get("temp", 0.0))

            if date_str not in days_map:
                days_map[date_str] = {
                    "date": date_str,
                    "temps": [temp],
                    "conditions": [w_info.get("description", "Clear").capitalize()],
                    "icons": [w_info.get("icon", "01d")],
                    "max_pop": pop,
                }
            else:
                days_map[date_str]["temps"].append(temp)
                days_map[date_str]["conditions"].append(w_info.get("description", "Clear").capitalize())
                days_map[date_str]["icons"].append(w_info.get("icon", "01d"))
                days_map[date_str]["max_pop"] = max(days_map[date_str]["max_pop"], pop)

        aggregated_days = []
        for d_str, d_val in list(days_map.items())[:5]:
            temps = d_val["temps"]
            conds = d_val["conditions"]
            icons = d_val["icons"]
            # Pick midday condition/icon if available, else first
            mid_idx = len(conds) // 2
            dominant_cond = conds[mid_idx]
            dominant_icon = icons[mid_idx]

            aggregated_days.append({
                "date": d_str,
                "temp_min_c": round(min(temps), 1),
                "temp_max_c": round(max(temps), 1),
                "condition": dominant_cond,
                "icon": dominant_icon,
                "icon_url": f"https://openweathermap.org/img/wn/{dominant_icon}@2x.png",
                "pop_percent": int(d_val["max_pop"] * 100),
            })

        return {
            "forecast_available": True,
            "city": data.get("city", {}).get("name", city or "Location"),
            "days": aggregated_days,
            "provider": "OpenWeatherMap 5-Day Forecast API",
            "disclaimer": "Forecast is subject to ongoing meteorological updates. Check shortly before travel.",
        }

    except HTTPException:
        raise
    except Exception as err:
        print(f"[Forecast Retrieval Error]: {err}")
        return {
            "forecast_available": False,
            "reason": f"Forecast service temporarily unavailable: {err}",
            "days": [],
        }


def fetch_route_weather(points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Retrieves real weather for multiple points along a route (e.g. origin, stops, destination)."""
    results = []
    for pt in points:
        name = pt.get("name", "Stop")
        lat = pt.get("lat")
        lon = pt.get("lon")
        role = pt.get("role", "stop")

        try:
            w = fetch_current_weather(lat=lat, lon=lon, city=name)
            w["point_name"] = name
            w["role"] = role
            results.append(w)
        except Exception as err:
            results.append({
                "point_name": name,
                "role": role,
                "coordinates": {"lat": lat, "lon": lon},
                "error": str(err),
                "condition": "Unavailable",
                "temperature_c": None,
                "disclaimer": "Weather data unavailable for this coordinate.",
            })
    return results
