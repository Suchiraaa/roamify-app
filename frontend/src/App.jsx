import { useState, useEffect } from "react";
import "./App.css";
import TripPlannerForm from "./components/TripPlannerForm";
import RouteMap from "./components/RouteMap";
import RouteSummary from "./components/RouteSummary";
import ScenicStopsList from "./components/ScenicStopsList";
import ApiKeyModal from "./components/ApiKeyModal";
import {
  checkBackendHealth,
  fetchPresets,
  planTrip,
  recalculateRoute,
} from "./services/api";

function App() {
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
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("roamify_ors_key") || "");
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // Initial health check and presets load
  useEffect(() => {
    async function init() {
      const status = await checkBackendHealth(apiKey);
      setBackendStatus(status);
      const presetData = await fetchPresets();
      setPresets(presetData);
    }
    init();
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
  };

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

      // Smooth scroll to results
      setTimeout(() => {
        document.getElementById("results-section")?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    } catch (err) {
      console.error("Trip planning error:", err);
      setErrorMsg(
        err.message || "Failed to generate route. Ensure the backend is running at http://127.0.0.1:8000."
      );
    } finally {
      setLoading(false);
    }
  };

  // Toggle a scenic stop on/off and dynamically re-route
  const handleToggleStop = async (stopId) => {
    if (!tripResult || recalculating) return;

    const currentStops = tripResult.scenic_stops || [];
    const updatedStops = currentStops.map((s) =>
      s.id === stopId ? { ...s, is_included: !s.is_included } : s
    );

    const includedStops = updatedStops.filter((s) => s.is_included);

    setRecalculating(true);
    try {
      const startCoords = [tripResult.start_location.lon, tripResult.start_location.lat];
      const destCoords = [tripResult.destination.lon, tripResult.destination.lat];
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
        Math.round((updatedRoute.distance_km - tripResult.direct_route.distance_km) * 100) / 100
      );
      const addedMin = Math.max(
        0,
        Math.round((updatedRoute.duration_min - tripResult.direct_route.duration_min) * 10) / 10
      );

      setTripResult({
        ...tripResult,
        scenic_stops: updatedStops,
        scenic_route: updatedRoute,
        detour_added_km: addedKm,
        detour_added_min: addedMin,
      });
    } catch (err) {
      console.error("Failed to recalculate route:", err);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <div className="app">
      {/* Top Navigation */}
      <nav className="navbar">
        <div className="nav-brand">
          <a className="logo" href="#home">
            🌍 Roamify
          </a>
          <span className="nav-tagline">Scenic Routing & Trip Planner</span>
        </div>

        <div className="nav-actions">
          <button
            className={`ors-status-btn ${backendStatus?.ors_api_key_configured ? "status-live" : "status-ready"}`}
            onClick={() => setIsConfigOpen(true)}
            title="Configure OpenRouteServices"
          >
            <span className="pulse-indicator">●</span>
            {backendStatus?.ors_api_key_configured ? "OpenRouteService Live" : "ORS Engine Config"}
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main id="home">
        {/* Hero Banner */}
        <section className="hero">
          <p className="eyebrow">THE JOURNEY IS THE DESTINATION</p>
          <h1>
            Turn your drive into<br />
            <span>an unforgettable exploration.</span>
          </h1>
          <p className="hero-text">
            Roamify intelligently calculates scenic detours, discovers hidden vistas,
            cultural enclaves, and authentic food stops along your path using OpenRouteServices.
          </p>
        </section>

        {/* Trip Planner Form */}
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
                Tip: Start the FastAPI backend with <code>python run.py</code> inside the <code>backend</code> directory.
              </p>
            </div>
          </div>
        )}

        {/* Results Section */}
        {showResults && tripResult && (
          <section id="results-section" className="results-wrapper">
            <div className="results-header">
              <span className="eyebrow">SCENIC ITINERARY GENERATED</span>
              <h2>
                {tripResult.start_location.name} → {tripResult.destination.name}
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
              stopsCount={tripResult.scenic_stops?.filter((s) => s.is_included).length || 0}
              provider={tripResult.provider}
            />

            {/* Interactive Leaflet Map */}
            <div className="map-card">
              <div className="map-card-header">
                <h3>Interactive Scenic Route Corridor</h3>
                {recalculating && <span className="recalculating-badge">Updating route...</span>}
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

      {/* Settings Modal */}
      <ApiKeyModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        apiKey={apiKey}
        onSaveKey={handleSaveApiKey}
        backendStatus={backendStatus}
      />

      {/* Footer */}
      <footer>
        <p>
          Roamify © 2026 · Powered by <strong>OpenRouteServices</strong> & OpenStreetMap.
        </p>
      </footer>
    </div>
  );
}

export default App;
