import os
from typing import Dict, Any, List, Optional
from google import genai
from fastapi import HTTPException
from models import TripRequest, ReplanRequest, CopilotChatRequest

# Priority sequence of models: fast 3.5 flash first, then 3.5 flash-lite, then 3.8 flash
PREFERRED_MODELS = [
    os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip(),
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash"
]


def get_gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or api_key == "your_gemini_api_key_here" or api_key == "your_gemini_key_here":
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is missing or not configured in backend/.env.",
        )
    return genai.Client(api_key=api_key)


def build_system_prompt() -> str:
    return """You are Roamify Co-Pilot, an intelligent, practical, and candid road-trip companion.

CRITICAL OPERATIONAL RULES:
1. Provide actionable, realistic travel advice based ONLY on the verified trip parameters supplied.
2. Clearly distinguish realistic estimates from verified ground truth.
3. NEVER fabricate or invent live traffic conditions, precise road closures, opening hours, or claiming to have booked tickets.
4. Keep currency estimates grounded in realistic Indian Rupees (INR) or local currency where applicable.
5. Emphasize road safety, mountain pass daylight hours (Western Ghats, Himalayas, etc.), and weather preparedness.
6. Format your output cleanly in GitHub Markdown with clear headers, bullet points, and estimated time allocations."""


def generate_trip_plan(trip: TripRequest, reason: str = "") -> Dict[str, Any]:
    """Generates a complete road-trip plan or customized adjustment using Gemini."""
    if not trip.origin.strip() or not trip.destination.strip():
        raise HTTPException(
            status_code=422,
            detail="Both origin and destination are required for trip planning.",
        )

    client = get_gemini_client()

    # Format planned stops context
    stops_summary = "None selected yet."
    if trip.planned_stops:
        stops_summary = "\n".join([
            f"- {s.name} ({s.category or 'Scenic Stop'}) [Detour: +{s.detour_min or 20} mins]"
            for s in trip.planned_stops
        ])

    route_info = ""
    if trip.route_distance_km and trip.route_duration_min:
        route_info = f"Calculated Highway Route: {trip.route_distance_km} km · ~{int(trip.route_duration_min // 60)}h {int(trip.route_duration_min % 60)}m driving time"

    prompt = f"""
TRIP PLANNING REQUEST:
- Origin: {trip.origin}
- Destination: {trip.destination}
- Primary Interests: {", ".join(trip.interests) if trip.interests else "General Exploration"}
- Budget Level: {trip.budget}
- Available Travel Time: {trip.time_available}
- Custom Traveler Notes: {trip.extra_preferences or "None"}
- Current Waypoints / Stops:
{stops_summary}
- Route Metrics: {route_info or "Direct corridor"}
- Current Weather Assessment: {trip.weather_summary or "Moderate seasonal conditions"}
- Special Adjustment Reason: {reason or "Initial journey creation"}

Please deliver:
1. **Journey Strategy & Departure Guidance**: Best time of day to embark, recommended driving stretches, and road safety cautions.
2. **Sequential Itinerary**: Ordered stops with practical arrival time estimates, rest breaks, and activity durations.
3. **Dining & Scenic Highlights**: Specific local dishes and viewpoint recommendations matching their interests and budget.
4. **Budget & Contingency Breakdown**: Honest estimated expenses in INR and alternative options if weather or fatigue requires shortening the drive.
"""

    last_error = None
    for model_name in PREFERRED_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "system_instruction": build_system_prompt(),
                    "temperature": 0.7,
                }
            )
            if response.text and response.text.strip():
                return {
                    "answer": response.text.strip(),
                    "model_used": model_name,
                    "status": "success",
                }
        except Exception as err:
            last_error = err
            print(f"[Gemini Model {model_name} Error]: {err}")
            continue

    raise HTTPException(
        status_code=502,
        detail=f"Gemini API request failed across available models. Please verify API key and network connection. ({last_error})",
    )


def handle_copilot_chat(chat_req: CopilotChatRequest) -> Dict[str, Any]:
    """Handles an interactive chat turn with Gemini while retaining the trip context."""
    client = get_gemini_client()

    context_str = "No active trip planned yet."
    if chat_req.trip_context:
        t = chat_req.trip_context
        context_str = (
            f"Trip: {t.origin} -> {t.destination} | "
            f"Interests: {', '.join(t.interests)} | Budget: {t.budget} | Duration: {t.time_available} | "
            f"Stops: {', '.join([s.name for s in t.planned_stops]) if t.planned_stops else 'None'} | "
            f"Weather: {t.weather_summary or 'Normal'}"
        )

    # Build prompt with history
    history_lines = []
    for h in chat_req.chat_history[-6:]:
        history_lines.append(f"{h.get('role', 'user').capitalize()}: {h.get('text', '')}")

    history_str = "\n".join(history_lines)

    prompt = f"""
ROAD TRIP CONTEXT:
{context_str}

CONVERSATION HISTORY:
{history_str}

USER QUERY:
{chat_req.message}

Provide a helpful, precise, and practical response relevant to this road trip. Never invent fake place details or guarantee weather. If recommending a detour, explain its approximate added time.
"""

    last_error = None
    for model_name in PREFERRED_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={
                    "system_instruction": build_system_prompt(),
                    "temperature": 0.7,
                }
            )
            if response.text and response.text.strip():
                return {
                    "reply": response.text.strip(),
                    "model_used": model_name,
                }
        except Exception as err:
            last_error = err
            print(f"[Gemini Chat {model_name} Error]: {err}")
            continue

    raise HTTPException(
        status_code=502,
        detail=f"Gemini chat failed: {last_error}",
    )
