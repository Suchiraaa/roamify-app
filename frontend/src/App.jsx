import { useState, useEffect, useCallback } from "react";
import "./App.css";

// Mapbox Single Interactive Map (absorbs direct route, scenic route, markers & popups)
import Map from "./Map";

// Unified Trip Planning & Navigation Components
import UnifiedTripPlanner from "./components/UnifiedTripPlanner";
import RouteSummary from "./components/RouteSummary";
import ScenicStopsList from "./components/ScenicStopsList";
import ApiKeyModal from "./components/ApiKeyModal";
import Speedometer from "./speedometer.jsx";
import NearbyPlaces from "./NearbyPlaces.jsx";

// Shared Geolocation Hook
import { useGeolocation } from "./services/useGeolocation";

// FastAPI backend API service
import {
  checkBackendHealth,
  fetchPresets,
  planTrip,
  recalculateRoute,
} from "./services/api";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || "";

function App() {
  // ── Site-wide Day/Night Mode State ──────────────────────────────────────
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("roamify_theme");
    if (saved === "light" || saved === "dark") return saved;
    return typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      localStorage.setItem("roamify_theme", next);
      return next;
    });
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Unified Trip Planner State (Unplanned initial state) ────────────────
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [budget, setBudget] = useState("Moderate");
  const [interest, setInterest] = useState("Nature");
  const [duration, setDuration] = useState("3 hours");
  const [profile, setProfile] = useState("driving-car");

  // ── Focused Place for Map View (Task 2) ──────────────────────────────────
  const [focusedLocation, setFocusedLocation] = useState(null);

  // ── Custom Waypoints (Added from Nearby Places) ──────────────────────────
  const [customWaypoints, setCustomWaypoints] = useState([]); // [{ id, name, address, coordinates: [lng, lat] }]

  // ── Route & Calculation State ────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [tripResult, setTripResult] = useState(null);
  const [showResults, setShowResults] = useState(false);

  // ── GeoJSON Route Features for Mapbox ────────────────────────────────────
  const [mapboxRouteGeoJson, setMapboxRouteGeoJson] = useState(null);
  const [mapboxDirectRouteGeoJson, setMapboxDirectRouteGeoJson] = useState(null);

  // ── Backend Configuration & Preset Trails ────────────────────────────────
  const [presets, setPresets] = useState([]);
  const [backendStatus, setBackendStatus] = useState(null);
  const [apiKey, setApiKey] = useState(
    () => import.meta.env.VITE_ORS_API_KEY || localStorage.getItem("roamify_ors_key") || ""
  );
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // ── Shared Geolocation & Speed Telemetry ─────────────────────────────────
  const { userLocation, speed, status: geoStatus, isLive: geoLive } = useGeolocation();

  // Helper: Convert geometry array [[lon, lat], ...] to GeoJSON Feature
  const coordsToGeoJson = useCallback((geometryCoords) => {
    if (!geometryCoords || geometryCoords.length === 0) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: geometryCoords,
      },
    };
  }, []);

  // Backend health check and preset trail fetch on mount / key change
  useEffect(() => {
    let isMounted = true;
    async function init() {
      const status = await checkBackendHealth(apiKey);
      if (isMounted) setBackendStatus(status);
      const presetData = await fetchPresets();
      if (isMounted) setPresets(presetData);
    }
    init();
    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    if (newKey) {
      localStorage.setItem("roamify_ors_key", newKey);
    } else {
      localStorage.removeItem("roamify_ors_key");
    }
    checkBackendHealth(newKey).then(setBackendStatus);
  };

  const handleSelectPreset = (preset) => {
    setStartLocation(preset.start);
    setDestination(preset.destination);
    if (preset.interest) setInterest(preset.interest);
    if (preset.duration) setDuration(preset.duration);
    setShowResults(false);
    setMapboxRouteGeoJson(null);
    setMapboxDirectRouteGeoJson(null);
  };

  // ── Plan Scenic Trip via FastAPI + OpenRouteServices ─────────────────────
  const handlePlanTrip = async (e) => {
    if (e) e.preventDefault();
    if (!startLocation.trim() || !destination.trim()) {
      setErrorMsg("Please specify both a starting point and destination.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const result = await planTrip(
        {
          start_location: startLocation.trim(),
          destination: destination.trim(),
          interest,
          budget,
          duration,
          profile,
        },
        apiKey
      );

      // If user had already added custom waypoints, recalculate with them included
      let finalScenicRoute = result.scenic_route;
      let finalDetourKm = result.detour_added_km;
      let finalDetourMin = result.detour_added_min;

      if (customWaypoints.length > 0 && result.start_location && result.destination) {
        try {
          const startCoords = [result.start_location.lon, result.start_location.lat];
          const destCoords = [result.destination.lon, result.destination.lat];
          const scenicStopsCoords = (result.scenic_stops || [])
            .filter((s) => s.is_included !== false)
            .map((s) => [s.lon, s.lat]);
          const customCoords = customWaypoints.map((wp) => [wp.coordinates[0], wp.coordinates[1]]);
          const allWaypoints = [...scenicStopsCoords, ...customCoords];

          const updatedRoute = await recalculateRoute(
            {
              start_coords: startCoords,
              dest_coords: destCoords,
              waypoint_coords: allWaypoints,
              profile,
            },
            apiKey
          );
          finalScenicRoute = updatedRoute;
          finalDetourKm = Math.max(
            0,
            Math.round((updatedRoute.distance_km - result.direct_route.distance_km) * 100) / 100
          );
          finalDetourMin = Math.max(
            0,
            Math.round((updatedRoute.duration_min - result.direct_route.duration_min) * 10) / 10
          );
        } catch (recalcErr) {
          console.warn("Initial waypoint incorporation notice:", recalcErr);
        }
      }

      const mergedResult = {
        ...result,
        scenic_route: finalScenicRoute,
        detour_added_km: finalDetourKm,
        detour_added_min: finalDetourMin,
      };

      setTripResult(mergedResult);
      setShowResults(true);

      // Feed Mapbox with both lines
      if (finalScenicRoute?.geometry?.length > 0) {
        setMapboxRouteGeoJson(coordsToGeoJson(finalScenicRoute.geometry));
      }
      if (result.direct_route?.geometry?.length > 0) {
        setMapboxDirectRouteGeoJson(coordsToGeoJson(result.direct_route.geometry));
      }

      // Smooth scroll to route summary
      setTimeout(() => {
        document.getElementById("route-summary-section")?.scrollIntoView({
          behavior: "smooth",
        });
      }, 150);
    } catch (err) {
      console.error("Trip planning error:", err);
      setErrorMsg(
        err.message ||
          "Could not calculate scenic route. Ensure backend is running at http://127.0.0.1:8000."
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Recalculate route whenever stops or custom waypoints change ──────────
  const runRouteRecalculation = useCallback(async (updatedScenicStops, updatedCustomWaypoints) => {
    if (!tripResult || recalculating) return;

    setRecalculating(true);
    try {
      const startCoords = [tripResult.start_location.lon, tripResult.start_location.lat];
      const destCoords = [tripResult.destination.lon, tripResult.destination.lat];

      const scenicWaypointCoords = updatedScenicStops
        .filter((s) => s.is_included !== false)
        .map((s) => [s.lon, s.lat]);

      const customCoords = updatedCustomWaypoints.map((wp) => [
        wp.coordinates[0],
        wp.coordinates[1],
      ]);

      const allWaypointCoords = [...scenicWaypointCoords, ...customCoords];

      const updatedRoute = await recalculateRoute(
        {
          start_coords: startCoords,
          dest_coords: destCoords,
          waypoint_coords: allWaypointCoords,
          profile,
        },
        apiKey
      );

      const addedKm = Math.max(
        0,
        Math.round((updatedRoute.distance_km - tripResult.direct_route.distance_km) * 100) / 100
      );
      const addedMin = Math.max(
        0,
        Math.round((updatedRoute.duration_min - tripResult.direct_route.duration_min) * 10) / 10
      );

      setTripResult({
        ...tripResult,
        scenic_stops: updatedScenicStops,
        scenic_route: updatedRoute,
        detour_added_km: addedKm,
        detour_added_min: addedMin,
      });

      if (updatedRoute.geometry?.length > 0) {
        setMapboxRouteGeoJson(coordsToGeoJson(updatedRoute.geometry));
      }
    } catch (err) {
      console.error("Route recalculation error:", err);
    } finally {
      setRecalculating(false);
    }
  }, [tripResult, recalculating, profile, apiKey, coordsToGeoJson]);

  // ── Toggle individual scenic stop inclusion ──────────────────────────────
  const handleToggleStop = (stopId) => {
    if (!tripResult) return;
    const currentStops = tripResult.scenic_stops || [];
    const updatedStops = currentStops.map((s) =>
      s.id === stopId ? { ...s, is_included: !s.is_included } : s
    );
    runRouteRecalculation(updatedStops, customWaypoints);
  };

  // ── Add Waypoint from Nearby Places ───────────────────────────────────────
  const handleAddWaypoint = useCallback((place) => {
    if (!place || !place.coordinates) return;

    // Prevent duplicate additions
    if (customWaypoints.some((wp) => wp.id === place.id)) {
      return;
    }

    const newWaypoint = {
      id: place.id,
      name: place.name || "Scenic Waypoint",
      address: place.address || "",
      coordinates: place.coordinates, // [lng, lat]
    };

    const nextWaypoints = [...customWaypoints, newWaypoint];
    setCustomWaypoints(nextWaypoints);

    // If an active trip exists, immediately recalculate route to include this waypoint
    if (tripResult && tripResult.start_location && tripResult.destination) {
      runRouteRecalculation(tripResult.scenic_stops || [], nextWaypoints);
    }
  }, [customWaypoints, tripResult, runRouteRecalculation]);

  // ── Focus Place Handler (Task 2) ─────────────────────────────────────────
  const handleFocusPlace = useCallback((place) => {
    if (!place) return;
    const lon = Number(place.lon ?? place.longitude ?? place.coordinates?.[0]);
    const lat = Number(place.lat ?? place.latitude ?? place.coordinates?.[1]);
    const name = place.name || "Selected Location";

    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      setFocusedLocation({ lon, lat, name });
      const mapSection = document.getElementById("primary-map-section");
      if (mapSection) {
        mapSection.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, []);

  // ── Remove Waypoint from Trip ─────────────────────────────────────────────
  const handleRemoveWaypoint = (waypointId) => {
    const nextWaypoints = customWaypoints.filter((wp) => wp.id !== waypointId);
    setCustomWaypoints(nextWaypoints);

    if (tripResult && tripResult.start_location && tripResult.destination) {
      runRouteRecalculation(tripResult.scenic_stops || [], nextWaypoints);
    }
  };

  // Listen for legacy custom event "roamify:add-waypoint"
  useEffect(() => {
    const onCustomEvent = (e) => {
      if (e.detail && e.detail.coordinates) {
        handleAddWaypoint(e.detail);
      }
    };
    window.addEventListener("roamify:add-waypoint", onCustomEvent);
    return () => window.removeEventListener("roamify:add-waypoint", onCustomEvent);
  }, [handleAddWaypoint]);

  return (
    <div className="roamify-app-root" data-theme={theme}>
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <header className="app-navbar">
        <div className="navbar-container">
          <div className="nav-brand-group">
            <span className="brand-logo-mark" aria-hidden="true">🧭</span>
            <span className="brand-name">Roamify</span>
            <span className="brand-divider">/</span>
            <span className="brand-sub">Scenic Navigation</span>
          </div>

          <div className="nav-status-group">
            {/* Day / Night Theme Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "Day" : "Night"} Mode`}
              aria-label="Toggle day and night mode"
            >
              <span className="theme-toggle-icon">{theme === "dark" ? "🌙" : "☀️"}</span>
              <span className="theme-toggle-label">{theme === "dark" ? "Night" : "Day"}</span>
            </button>

            <button
              type="button"
              className={`engine-status-pill ${
                backendStatus?.ors_api_key_configured ? "is-configured" : "is-default"
              }`}
              onClick={() => setIsConfigOpen(true)}
              title="OpenRouteServices Configuration"
            >
              <span className="status-indicator-dot" />
              <span>
                {backendStatus?.ors_api_key_configured
                  ? "ORS Engine Active"
                  : "Configure ORS Key"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Application Content ───────────────────────────────────── */}
      <main className="app-main-layout">
        {/* Unified Search & Preferences Panel */}
        <section className="planner-section" aria-label="Trip Configuration">
          <UnifiedTripPlanner
            startLocation={startLocation}
            setStartLocation={setStartLocation}
            destination={destination}
            setDestination={setDestination}
            budget={budget}
            setBudget={setBudget}
            interest={interest}
            setInterest={setInterest}
            duration={duration}
            setDuration={setDuration}
            profile={profile}
            setProfile={setProfile}
            onSubmit={handlePlanTrip}
            loading={loading}
            presets={presets}
            onSelectPreset={handleSelectPreset}
            mapboxToken={MAPBOX_TOKEN}
            userLocation={userLocation}
          />
        </section>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="error-alert-banner" role="alert">
            <span className="alert-icon">⚠️</span>
            <div className="alert-body">
              <strong>Calculation Error:</strong> {errorMsg}
            </div>
            <button
              type="button"
              className="alert-dismiss"
              onClick={() => setErrorMsg("")}
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Primary Map Section (Single Mapbox Canvas) ────────────────── */}
        <section id="primary-map-section" className="primary-map-section" aria-label="Interactive Route Map">
          <div className="map-viewport-frame">
            <Map
              routeGeoJson={mapboxRouteGeoJson}
              directRouteGeoJson={mapboxDirectRouteGeoJson}
              startLocation={tripResult?.start_location}
              destination={tripResult?.destination}
              scenicStops={tripResult?.scenic_stops || []}
              customWaypoints={customWaypoints}
              onToggleStop={handleToggleStop}
              onRemoveWaypoint={handleRemoveWaypoint}
              sharedLocation={userLocation}
              theme={theme}
              focusedLocation={focusedLocation}
            />

            {/* Live Speedometer Telemetry HUD (Overlaid neatly on top-left of map) */}
            <div className="map-speedometer-overlay">
              <Speedometer speed={speed} status={geoStatus} isLive={geoLive} />
            </div>

            {/* Recalculating indicator */}
            {recalculating && (
              <div className="map-updating-overlay">
                <span className="btn-spinner" /> Updating route with detours...
              </div>
            )}
          </div>
        </section>

        {/* ── Active Waypoints Bar (Chips) ──────────────────────────────── */}
        {customWaypoints.length > 0 && (
          <section className="active-waypoints-strip" aria-label="Trip Waypoints">
            <span className="waypoints-label">Active Waypoints ({customWaypoints.length}):</span>
            <div className="waypoints-chip-list">
              {customWaypoints.map((wp) => (
                <div key={wp.id} className="waypoint-chip">
                  <span className="chip-name">{wp.name}</span>
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => handleRemoveWaypoint(wp.id)}
                    title={`Remove ${wp.name} from trip`}
                    aria-label={`Remove ${wp.name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Results Section (Route Metrics & Scenic Stops) ────────────── */}
        {showResults && tripResult && (
          <section id="route-summary-section" className="results-container">
            <div className="results-header-bar">
              <div>
                <span className="results-eyebrow">SCENIC DETOUR ITINERARY</span>
                <h2 className="results-title">
                  {tripResult.start_location.name} → {tripResult.destination.name}
                </h2>
              </div>
              <div className="results-meta-pill">
                {interest} focus · {budget} budget · {duration}
              </div>
            </div>

            {/* Route Summary Comparison */}
            <RouteSummary
              directRoute={tripResult.direct_route}
              scenicRoute={tripResult.scenic_route}
              detourAddedKm={tripResult.detour_added_km}
              detourAddedMin={tripResult.detour_added_min}
              stopsCount={
                (tripResult.scenic_stops?.filter((s) => s.is_included !== false).length || 0) +
                customWaypoints.length
              }
              provider={tripResult.provider}
            />

            {/* Scenic Stops Along The Corridor */}
            <ScenicStopsList
              stops={tripResult.scenic_stops}
              onToggleStop={handleToggleStop}
              onFocusStop={handleFocusPlace}
              interest={interest}
            />
          </section>
        )}

        {/* ── Nearby Places Detour Discovery ───────────────────────────── */}
        <NearbyPlaces
          userLocation={userLocation}
          activeWaypoints={customWaypoints}
          onAddWaypoint={handleAddWaypoint}
          onRemoveWaypoint={handleRemoveWaypoint}
          onFocusPlace={handleFocusPlace}
        />
      </main>

      {/* ── ORS API Key Settings Modal ─────────────────────────────────── */}
      <ApiKeyModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        apiKey={apiKey}
        onSaveKey={handleSaveApiKey}
        backendStatus={backendStatus}
      />

      {/* ── Application Footer ─────────────────────────────────────────── */}
      <footer className="app-footer">
        <p>
          Roamify © 2026 · Powered by <strong>OpenRouteServices</strong> &amp; OpenStreetMap · Map engine by <strong>Mapbox</strong>.
        </p>
      </footer>
    </div>
  );
}

export default App;
