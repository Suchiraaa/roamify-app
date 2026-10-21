
import os
import requests
from dotenv import load_dotenv
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google import genai

# Load the existing backend/.env file without overwriting its contents.
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

app = FastAPI(title="Roamify API")

# Allow the existing Vite frontend to call this backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TripRequest(BaseModel):
    origin: str = Field(default="", max_length=200)
    destination: str = Field(default="", max_length=200)
    interests: list[str] = Field(default_factory=list, max_length=20)
    budget: str = Field(default="Any", max_length=100)
    time_available: str = Field(default="Flexible", max_length=100)
    extra_preferences: str = Field(default="", max_length=1000)


class ReplanRequest(TripRequest):
    reason: str = Field(min_length=1, max_length=500)


class WeatherRequest(BaseModel):
    city: str = Field(min_length=1, max_length=150)


def generate_plan(trip: TripRequest, reason: str = ""):
    if not trip.origin.strip() or not trip.destination.strip():
        raise HTTPException(
            status_code=422,
            detail="Origin and destination are required.",
        )

    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key or api_key == "your_gemini_key_here":
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is missing from backend/.env.",
        )

    prompt = f"""
You are Roamify, a practical, personalized travel-planning assistant.

Plan a journey using these details:
Origin: {trip.origin}
Destination: {trip.destination}
Interests: {", ".join(trip.interests) or "General sightseeing"}
Budget: {trip.budget}
Available time: {trip.time_available}
Preferences: {trip.extra_preferences or "None"}
Reason for replanning: {reason or "Initial trip plan"}

Give the user:
1. A practical itinerary in visit order.
2. Suggested stops and activities relevant to their interests.
3. Approximate time allocation.
4. Estimated costs in INR where reasonable.
5. Alternative activities if time, budget, or weather changes.

For replanning, prioritise the user's latest reason and revise the
existing trip accordingly.

Be clear about estimates. Never invent live routes, distances,
traffic, opening hours, availability, or verified places data.
Do not claim to have booked anything.
"""

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
        )

        if not response.text:
            raise HTTPException(
                status_code=502,
                detail="Gemini returned an empty response.",
            )

        # Preserve the existing /api/copilot response format.
        return {"answer": response.text}

    except HTTPException:
        raise
    except Exception as error:
        print(f"Gemini request failed: {type(error).__name__}: {error}")
        raise HTTPException(
            status_code=502,
            detail="Trip planning failed. Check Gemini API access and connection.",
        )


@app.post("/api/copilot")
def copilot(trip: TripRequest):
    return generate_plan(trip)


@app.post("/api/replan")
def replan(request: ReplanRequest):
    return generate_plan(request, reason=request.reason)


@app.post("/api/weather")
def weather(request: WeatherRequest):
    api_key = os.getenv("OPENWEATHER_API_KEY")

    if not api_key or api_key == "your_openweathermap_key_here":
        raise HTTPException(
            status_code=503,
            detail="OpenWeatherMap API key is missing from backend/.env.",
        )

    try:
        result = requests.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "q": request.city.strip(),
                "appid": api_key,
                "units": "metric",
            },
            timeout=15,
        )

        if result.status_code == 401:
            raise HTTPException(
                status_code=502,
                detail="Weather API key is invalid or not activated.",
            )

        if result.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail="City not found. Check the spelling.",
            )

        result.raise_for_status()
        data = result.json()

        temperature = data["main"]["temp"]
        condition = data["weather"][0]["description"]

        if any(word in condition.lower() for word in ("rain", "drizzle", "thunderstorm")):
            suggestion = "Consider indoor activities or covered cafes."
        elif temperature >= 35:
            suggestion = "Consider indoor activities and limit prolonged outdoor exposure."
        else:
            suggestion = "Check local conditions before finalising outdoor activities."

        return {
            "city": data["name"],
            "temperature_c": temperature,
            "feels_like_c": data["main"]["feels_like"],
            "condition": condition,
            "humidity_percent": data["main"]["humidity"],
            "travel_suggestion": suggestion,
        }

    except HTTPException:
        raise
    except requests.RequestException as error:
        print(f"Weather request failed: {type(error).__name__}: {error}")
        raise HTTPException(
            status_code=502,
            detail="Weather retrieval failed. Check the API key and connection.",
        )
    except (KeyError, IndexError, ValueError) as error:
        print(f"Unexpected weather response: {error}")
        raise HTTPException(
            status_code=502,
            detail="The weather service returned an unexpected response.",
        )

