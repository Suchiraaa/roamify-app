/**
 * Roamify API Client
 * Connects React frontend to FastAPI backend, OpenRouteServices, Weather, and Gemini AI.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://192.168.1.2:8000";

export async function checkBackendHealth(customApiKey = "") {
  try {
    const headers = {};
    if (customApiKey) {
      headers["X-ORS-API-Key"] = customApiKey;
    }
    const res = await fetch(`${BACKEND_URL}/api/health`, {
      headers,
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error("Health check failed");
    return await res.json();
  } catch {
    return {
      status: "offline",
      service: "FastAPI Backend is not running",
      ors_api_key_configured: false,
      mode: "Client-side fallback mode (start backend with 'python run.py')",
      integrations: {
        gemini_ai_copilot: { configured: false, provider: "Google Gemini" },
        weather_service: { configured: false, provider: "OpenWeatherMap Live API" },
        places_service: { configured: false, provider: "OpenStreetMap Nominatim" },
      },
    };
  }
}

export async function fetchPresets() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/presets`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error("Presets failed");
    return await res.json();
  } catch {
    // Fallback presets if backend is offline
    return [
      {
        id: "blr-mys",
        title: "Bengaluru to Mysuru Heritage Trail",
        start: "Bengaluru, Karnataka, India",
        destination: "Mysuru, Karnataka, India",
        interest: "Culture",
        duration: "Full day",
        description: "Experience dramatic granite hills, Janapada Loka folk village, and legendary highway eateries.",
      },
      {
        id: "mum-pune",
        title: "Western Ghats Vista Express",
        start: "Mumbai, Maharashtra, India",
        destination: "Pune, Maharashtra, India",
        interest: "Nature",
        duration: "Half a day",
        description: "Traverse lush mist-shrouded ghats, ancient Karla Buddhist rock caves, and Tiger Point viewpoints.",
      },
      {
        id: "del-agra",
        title: "Golden Triangle Heritage Passage",
        start: "Delhi, India",
        destination: "Agra, Uttar Pradesh, India",
        interest: "Culture",
        duration: "Full day",
        description: "Explore Mughal architecture, bird sanctuaries, and historic imperial citadels.",
      },
      {
        id: "sfo-bigsur",
        title: "Pacific Coast Scenic Highway",
        start: "San Francisco, California, USA",
        destination: "Big Sur, California, USA",
        interest: "Nature",
        duration: "Full day",
        description: "Iconic coastal cliffs, dramatic ocean viewpoints, and towering redwood forests.",
      },
    ];
  }
}

export async function planTrip(tripParams, customApiKey = "") {
  const headers = { "Content-Type": "application/json" };
  if (customApiKey) {
    headers["X-ORS-API-Key"] = customApiKey;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/plan-trip`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...tripParams,
        ors_api_key: customApiKey || undefined,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Server error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.warn("Backend call failed:", error);
    if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("NetworkError") || error.message.includes("Load failed"))) {
      throw new Error(`Cannot connect to backend server at ${BACKEND_URL}. Ensure the backend is running with 'python run.py'.`, { cause: error });
    }
    throw error;
  }
}

export async function recalculateRoute(recalcParams, customApiKey = "") {
  const headers = { "Content-Type": "application/json" };
  if (customApiKey) {
    headers["X-ORS-API-Key"] = customApiKey;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/recalculate-route`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...recalcParams,
        ors_api_key: customApiKey || undefined,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Recalculation error: ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    console.warn("Backend recalculate call failed:", error);
    if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("NetworkError") || error.message.includes("Load failed"))) {
      throw new Error(`Cannot connect to backend server at ${BACKEND_URL}. Ensure the backend is running with 'python run.py'.`, { cause: error });
    }
    throw error;
  }
}

// ==============================================================================
// Weather API Services (OpenWeatherMap Live Integration)
// ==============================================================================

export async function fetchCurrentWeather({ lat, lon, city } = {}) {
  const params = new URLSearchParams();
  if (lat !== undefined && lat !== null && lon !== undefined && lon !== null) {
    params.set("lat", lat);
    params.set("lon", lon);
  } else if (city) {
    params.set("city", city);
  } else {
    throw new Error("Coordinates or city name required for weather lookup.");
  }

  const res = await fetch(`${BACKEND_URL}/api/weather/current?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Weather retrieval failed (${res.status})`);
  }
  return await res.json();
}

export async function fetchWeatherForecast({ lat, lon, city } = {}) {
  const params = new URLSearchParams();
  if (lat !== undefined && lat !== null && lon !== undefined && lon !== null) {
    params.set("lat", lat);
    params.set("lon", lon);
  } else if (city) {
    params.set("city", city);
  } else {
    throw new Error("Coordinates or city name required for forecast lookup.");
  }

  const res = await fetch(`${BACKEND_URL}/api/weather/forecast?${params.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Forecast retrieval failed (${res.status})`);
  }
  return await res.json();
}

export async function fetchRouteWeather(points = []) {
  if (!points || points.length === 0) return [];
  const res = await fetch(`${BACKEND_URL}/api/weather/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ points }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Route weather lookup failed (${res.status})`);
  }
  return await res.json();
}

// ==============================================================================
// Gemini AI Co-Pilot Services (Google Gemini Integration)
// ==============================================================================

export async function fetchGeminiCopilotPlan(tripData) {
  const res = await fetch(`${BACKEND_URL}/api/copilot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tripData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gemini Co-Pilot failed (${res.status})`);
  }
  return await res.json();
}

export async function fetchGeminiReplan(replanData) {
  const res = await fetch(`${BACKEND_URL}/api/replan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(replanData),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gemini Replan failed (${res.status})`);
  }
  return await res.json();
}

export async function sendCopilotChatMessage(message, tripContext = null, chatHistory = []) {
  const res = await fetch(`${BACKEND_URL}/api/copilot/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      trip_context: tripContext,
      chat_history: chatHistory,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Gemini Chat failed (${res.status})`);
  }
  return await res.json();
}
