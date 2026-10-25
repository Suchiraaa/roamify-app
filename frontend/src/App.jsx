import { useState, useEffect } from "react";
import "./App.css";

// Mapbox live map + real-time route search (Member 1)
import Map from "./Map";

// Trip planner UI components (Member 2 / Subhashini)
import TripPlannerForm from "./components/TripPlannerForm";
import RouteMap from "./components/RouteMap";
import RouteSummary from "./components/RouteSummary";
import ScenicStopsList from "./components/ScenicStopsList";
import ApiKeyModal from "./components/ApiKeyModal";

// FastAPI backend API service (Member 2 / Subhashini)
import {
  checkBackendHealth,
  fetchPresets,
  planTrip,
  recalculateRoute,
} from "./services/api";

function App() {
  // ── Trip Planner State (ORS / FastAPI) ───────────────────────────────────
  const [startLocation, setStartLocation] = useState("Bengaluru, Karnataka, India");
  const [destination, setDestination] = useState("Mysuru, Karnataka, India");
  const [budget, setBudget] = useState("Moderate");
  const [interest, setInterest] = useState("Nature");
  const [duration, setDuration] = useState("3 hours");
  const [profile, setProfile] = useState("driving-car");

  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [tripResult, setTripResult] = useState(null);
  const [showResults, setShowResults] = useState(false);

  const [presets, setPresets] = useState([]);
  const [backendStatus, setBackendStatus] = useState(null);
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("roamify_ors_key") || ""
  );
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // ── Mapbox live map route state (Member 1) ───────────────────────────────
  // Holds a GeoJSON Feature (LineString) to display on the Mapbox canvas.
  // When an ORS scenic route is planned, we convert and push it here so the
  // Mapbox canvas always reflects the current active route.
  const [mapboxRouteGeoJson, setMapboxRouteGeoJson] = useState(null);

  // ── Backend health check & presets on mount / key change ─────────────────
  useEffect(() => {
    async function init() {
      const status = await checkBackendHealth(apiKey);
      setBackendStatus(status);
      const presetData = await fetchPresets();
      setPresets(presetData);
    }
    init();
  }, [apiKey]);

  // ── ORS API Key management ────────────────────────────────────────────────
  const handleSaveApiKey = (newKey) => {
    setApiKey(newKey);
    if (newKey) {
      localStorage.setItem("roamify_ors_key", newKey);
    } else {
      localStorage.removeItem("roamify_ors_key");
    }
    checkBackendHealth(newKey).then(setBackendStatus);
  };

  // ── Preset trip quick-select ──────────────────────────────────────────────
  const handleSelectPreset = (preset) => {
    setStartLocation(preset.start);
    setDestination(preset.destination);
    if (preset.interest) setInterest(preset.interest);
    if (preset.duration) setDuration(preset.duration);
    setShowResults(false);
    setMapboxRouteGeoJson(null);
  };

  /**
   * Convert an ORS geometry array ([[lon, lat], ...]) into a GeoJSON Feature
   * compatible with Map.jsx / Mapbox GL route layer.
   */
  const orsGeometryToGeoJson = (geometryCoords) => {
    if (!geometryCoords || geometryCoords.length === 0) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: {
        type: "LineString",
        coordinates: geometryCoords, // ORS already returns [lon, lat] pairs
      },
    };
  };

  // ── Plan Trip via FastAPI + ORS ───────────────────────────────────────────
  const handlePlanTrip = async (e) => {
    if (e) e.preventDefault();
    if (!startLocation.trim() || !destination.trim()) {
      setErrorMsg("Please provide both starting location and destination.");
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

      setTripResult(result);
      setShowResults(true);

      // Push the ORS scenic route geometry to the Mapbox live canvas
      if (result.scenic_route?.geometry?.length > 0) {
        setMapboxRouteGeoJson(orsGeometryToGeoJson(result.scenic_route.geometry));
      }

      // Smooth scroll to results
      setTimeout(() => {
        document.getElementById("results-section")?.scrollIntoView({
          behavior: "smooth",
        });
      }, 150);
    } catch (err) {
      console.error("Trip planning error:", err);
      setErrorMsg(
        err.message ||
          "Failed to generate route. Ensure the backend is running at http://127.0.0.1:8000."
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Called when Mapbox RouteSearchOverlay calculates a live point-to-point
   * route independently (Mapbox Directions API). Keeps Mapbox canvas in sync.
   */
  const handleMapboxRouteUpdate = (routeGeoJson) => {
    setMapboxRouteGeoJson(routeGeoJson);
  };

  // ── Toggle a scenic stop on/off → re-route via FastAPI ───────────────────
  const handleToggleStop = async (stopId) => {
    if (!tripResult || recalculating) return;

    const currentStops = tripResult.scenic_stops || [];
    const updatedStops = currentStops.map((s) =>
      s.id === stopId ? { ...s, is_included: !s.is_included } : s
    );

    const includedStops = updatedStops.filter((s) => s.is_included);

    setRecalculating(true);
    try {
      const startCoords = [
        tripResult.start_location.lon,
        tripResult.start_location.lat,
      ];
      const destCoords = [
        tripResult.destination.lon,
        tripResult.destination.lat,
      ];
      const waypointCoords = includedStops.map((s) => [s.lon, s.lat]);

      const updatedRoute = await recalculateRoute(
        {
          start_coords: startCoords,
          dest_coords: destCoords,
          waypoint_coords: waypointCoords,
          profile,
        },
        apiKey
      );

      const addedKm = Math.max(
        0,
        Math.round(
          (updatedRoute.distance_km - tripResult.direct_route.distance_km) * 100
        ) / 100
      );
      const addedMin = Math.max(
        0,
        Math.round(
          (updatedRoute.duration_min - tripResult.direct_route.duration_min) * 10
        ) / 10
      );

      const newTripResult = {
        ...tripResult,
        scenic_stops: updatedStops,
        scenic_route: updatedRoute,
        detour_added_km: addedKm,
        detour_added_min: addedMin,
      };

      setTripResult(newTripResult);

      // Keep Mapbox canvas in sync with the recalculated route
      if (updatedRoute.geometry?.length > 0) {
        setMapboxRouteGeoJson(orsGeometryToGeoJson(updatedRoute.geometry));
      }
    } catch (err) {
      console.error("Failed to recalculate route:", err);
    } finally {
      setRecalculating(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Top Navigation ─────────────────────────────────────────────── */}
      <nav className="navbar">
        <div className="nav-brand">
          <a className="logo" href="#home">
            🌍 Roamify
          </a>
          <span className="nav-tagline">Scenic Routing &amp; Trip Planner</span>
        </div>

        <div className="nav-actions">
          <button
            className={`ors-status-btn ${
              backendStatus?.ors_api_key_configured
                ? "status-live"
                : "status-ready"
            }`}
            onClick={() => setIsConfigOpen(true)}
            title="Configure OpenRouteServices API key"
          >
            <span className="pulse-indicator">●</span>
            {backendStatus?.ors_api_key_configured
              ? "OpenRouteService Live"
              : "ORS Engine Config"}
          </button>
        </div>
      </nav>

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main id="home">
        {/* Hero Banner */}
        <section className="hero">
          <p className="eyebrow">THE JOURNEY IS THE DESTINATION</p>
          <h1>
            Turn your drive into
            <br />
            <span>an unforgettable exploration.</span>
          </h1>
          <p className="hero-text">
            Roamify intelligently calculates scenic detours, discovers hidden
            vistas, cultural enclaves, and authentic food stops along your path
            using OpenRouteServices.
          </p>
        </section>

        {/* ── Mapbox Live Map ──────────────────────────────────────────── */}
        {/*
          The Mapbox canvas provides real-time GPS, live map route search
          (Mapbox Directions API), Day/Night/Satellite styles, 2D/3D toggle,
          and geocoding autocomplete — independent of the ORS backend.
          It also displays the ORS scenic route when a trip is planned
          (via mapboxRouteGeoJson state).
        */}
        <section className="mapbox-section">
          <div className="mapbox-section-header">
            <div>
              <h2>Live Map &amp; Route Search</h2>
              <p className="mapbox-section-subtext">
                Search routes live, toggle map styles and 3D view — or plan a
                scenic trip below using OpenRouteServices.
              </p>
            </div>
          </div>
          <div className="mapbox-map-container">
            <Map
              routeGeoJson={mapboxRouteGeoJson}
              onRouteUpdate={handleMapboxRouteUpdate}
            />
          </div>
        </section>

        {/* ── ORS Trip Planner Form ────────────────────────────────────── */}
        <TripPlannerForm
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
        />

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <div>
              <strong>Could not generate route:</strong> {errorMsg}
              <p className="error-subtext">
                Tip: Start the FastAPI backend with{" "}
                <code>python run.py</code> inside the <code>backend</code>{" "}
                directory. Confirm your ORS API key via the config button above.
              </p>
            </div>
          </div>
        )}

        {/* ── Results Section ──────────────────────────────────────────── */}
        {showResults && tripResult && (
          <section id="results-section" className="results-wrapper">
            <div className="results-header">
              <span className="eyebrow">SCENIC ITINERARY GENERATED</span>
              <h2>
                {tripResult.start_location.name} →{" "}
                {tripResult.destination.name}
              </h2>
              <p className="section-text">
                {interest} focus · {budget} · Detour budget: {duration}
              </p>
            </div>

            {/* Route Stats & Metrics Comparison */}
            <RouteSummary
              directRoute={tripResult.direct_route}
              scenicRoute={tripResult.scenic_route}
              detourAddedKm={tripResult.detour_added_km}
              detourAddedMin={tripResult.detour_added_min}
              stopsCount={
                tripResult.scenic_stops?.filter((s) => s.is_included).length ||
                0
              }
              provider={tripResult.provider}
            />

            {/*
              Leaflet Scenic Itinerary Map — used exclusively here in the
              results section to visualise the ORS scenic route corridor with
              clickable stop markers. The Mapbox canvas above shows the live
              searchable map; this card shows the computed scenic itinerary.
            */}
            <div className="map-card">
              <div className="map-card-header">
                <h3>Interactive Scenic Route Corridor</h3>
                {recalculating && (
                  <span className="recalculating-badge">Updating route...</span>
                )}
              </div>
              <RouteMap
                startLocation={tripResult.start_location}
                destination={tripResult.destination}
                directRoute={tripResult.direct_route}
                scenicRoute={tripResult.scenic_route}
                scenicStops={tripResult.scenic_stops}
                onToggleStop={handleToggleStop}
              />
            </div>

            {/* Scenic Stops Along The Corridor */}
            <ScenicStopsList
              stops={tripResult.scenic_stops}
              onToggleStop={handleToggleStop}
              interest={interest}
            />
          </section>
        )}
      </main>

      {/* ── ORS Settings Modal ─────────────────────────────────────────────── */}
      <ApiKeyModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        apiKey={apiKey}
        onSaveKey={handleSaveApiKey}
        backendStatus={backendStatus}
      />

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer>
        <p>
          Roamify © 2026 · Powered by{" "}
          <strong>OpenRouteServices</strong> &amp; OpenStreetMap · Live map by{" "}
          <strong>Mapbox</strong>.
        </p>
      </footer>
    </div>
  );
}

export default App;
