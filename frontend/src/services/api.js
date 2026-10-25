/**
 * Roamify API Client
 * Connects React frontend to FastAPI backend & OpenRouteServices.
 */

const BACKEND_URL = "http://127.0.0.1:8000";

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
    // If backend is unreachable, throw clear message or use client fallback
    console.warn("Backend call failed:", error);
    throw error;
  }
}

export async function recalculateRoute(recalcParams, customApiKey = "") {
  const headers = { "Content-Type": "application/json" };
  if (customApiKey) {
    headers["X-ORS-API-Key"] = customApiKey;
  }

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
}
