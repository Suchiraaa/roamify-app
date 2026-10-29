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
import WeatherWidget from "./components/WeatherWidget";
import GeminiCopilot from "./components/GeminiCopilot";

// Lucide-compatible vector SVG Icons
import {
  CompassIcon,
  SunIcon,
  MoonIcon,
  RouteIcon,
  MapPinIcon,
  AlertTriangleIcon,
  XIcon,
  ClockIcon,
  ShieldCheckIcon,
  SparklesIcon,
  CloudIcon,
} from "./components/Icons";

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

  // ── Unified Trip Planner State (Supports multi-interest selection) ───────
  const [startLocation, setStartLocation] = useState("");
  const [destination, setDestination] = useState("");
  const [budget, setBudget] = useState("Moderate");
  const [interests, setInterests] = useState(["Nature"]);
  const [interest, setInterest] = useState("Nature");
  const [duration, setDuration] = useState("3 hours");
  const [profile, setProfile] = useState("driving-car");

  // Keep single 'interest' string and 'interests' array in sync
  const handleUpdateInterests = (newInterests) => {
    setInterests(newInterests);
    setInterest(newInterests.join(", "));
  };

  // ── Focused Place for Map View ───────────────────────────────────────────
  const [focusedLocation, setFocusedLocation] = useState(null);

  // ── Custom Waypoints (Added from Nearby Places) ──────────────────────────
  const [customWaypoints, setCustomWaypoints] = useState([]); // [{ id, name, address, coordinates: [lng, lat] }]

  // ── Route & Calculation State ────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [tripResult, setTripResult] = useState(null);
  const [showResults, setShowResults] = useState(false);

  // ── Gemini AI Co-Pilot & Weather Telemetry State ─────────────────────────
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [weatherSummary, setWeatherSummary] = useState("");

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
    if (preset.interest) {
      setInterest(preset.interest);
      setInterests([preset.interest]);
    }
    if (preset.duration) setDuration(preset.duration);
    setShowResults(false);
    setMapboxRouteGeoJson(null);
    setMapboxDirectRouteGeoJson(null);
  };

  // ── Plan Scenic Trip via FastAPI + OpenRouteServices ─────────────────────
  const handlePlanTrip = async (e) => {
    if (e) e.preventDefault();
    if (!startLocation.trim() || !destination.trim()) {
      setErrorMsg("Please specify both a departure point and destination.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const selectedInterestString = interests.length > 0 ? interests.join(", ") : "Nature";

      const result = await planTrip(
        {
          start_location: startLocation.trim(),
          destination: destination.trim(),
          interest: selectedInterestString,
          interests: interests.length > 0 ? interests : ["Nature"],
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

      // Build basic weather summary string from endpoints if possible
      setWeatherSummary(
        `Corridor: ${result.start_location?.name || startLocation} to ${result.destination?.name || destination} with ${
          result.scenic_stops?.length || 0
        } scenic stops.`
      );

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

    if (tripResult && tripResult.start_location && tripResult.destination) {
      runRouteRecalculation(tripResult.scenic_stops || [], nextWaypoints);
    }
  }, [customWaypoints, tripResult, runRouteRecalculation]);

  // ── Focus Place Handler ──────────────────────────────────────────────────
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

  // Listen for custom event "roamify:add-waypoint"
  useEffect(() => {
    const onCustomEvent = (e) => {
      if (e.detail && e.detail.coordinates) {
        handleAddWaypoint(e.detail);
      }
    };
    window.addEventListener("roamify:add-waypoint", onCustomEvent);
    return () => window.removeEventListener("roamify:add-waypoint", onCustomEvent);
  }, [handleAddWaypoint]);

  const geminiConfigured = backendStatus?.integrations?.gemini_ai_copilot?.configured;
  const weatherConfigured = backendStatus?.integrations?.weather_service?.configured;

  return (
    <div className="roamify-app-root" data-theme={theme}>
      {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
      <header className="app-navbar">
        <div className="navbar-container">
          <div className="nav-brand-group">
            <div className="brand-logo-mark" aria-hidden="true">
              <CompassIcon size={20} className="brand-compass-svg" />
            </div>
            <div className="brand-text-block">
              <span className="brand-name">Roamify</span>
              <span className="brand-sub">Scenic Route Atelier</span>
            </div>
          </div>

          <nav className="nav-links-row" aria-label="Quick Navigation">
            <a href="#trip-planner-section" className="nav-anchor">
              Trip Atelier
            </a>
            <a href="#primary-map-section" className="nav-anchor">
              Interactive Map
            </a>
            {showResults && (
              <>
                <a href="#corridor-weather-section" className="nav-anchor">
                  Live Weather
                </a>
                <a href="#gemini-copilot-section" className="nav-anchor">
                  AI Co-Pilot
                </a>
              </>
            )}
            <a href="#editorial-philosophy" className="nav-anchor">
              Philosophy
            </a>
          </nav>

          <div className="nav-status-group">
            {/* Quick Trigger: Gemini AI Co-Pilot */}
            <button
              type="button"
              className={`nav-copilot-quick-btn ${geminiConfigured ? "is-active" : ""}`}
              onClick={() => setIsCopilotOpen(true)}
              title="Open Gemini AI Co-Pilot Drawer"
              aria-label="Open Gemini AI Co-Pilot Drawer"
            >
              <SparklesIcon size={14} className="sparkle-nav-icon" />
              <span>AI Co-Pilot</span>
            </button>

            {/* Weather status indicator if route calculated */}
            {showResults && (
              <a
                href="#corridor-weather-section"
                className={`nav-copilot-quick-btn ${weatherConfigured ? "is-active" : ""}`}
                title="View Corridor Weather Outlook"
              >
                <CloudIcon size={14} />
                <span>Weather</span>
              </a>
            )}

            {/* Day / Night Theme Toggle */}
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "Day" : "Night"} Mode`}
              aria-label="Toggle day and night mode"
            >
              <span className="theme-toggle-icon">
                {theme === "dark" ? <MoonIcon size={14} /> : <SunIcon size={14} />}
              </span>
              <span className="theme-toggle-label">{theme === "dark" ? "Night" : "Day"}</span>
            </button>

            <button
              type="button"
              className={`engine-status-pill ${
                backendStatus?.ors_api_key_configured ? "is-configured" : "is-default"
              }`}
              onClick={() => setIsConfigOpen(true)}
              title="Routing Engine & API Configuration"
            >
              <span className="status-indicator-dot" />
              <span>
                {backendStatus?.ors_api_key_configured
                  ? "ORS Engine Active"
                  : "Engine Config"}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Application Content ───────────────────────────────────── */}
      <main className="app-main-layout">
        {/* ── Hero Section / Travel Editorial Experience ─────────────────── */}
        <section className="app-hero-banner" aria-label="Roamify Introduction">
          <div className="hero-atmosphere-backdrop" aria-hidden="true" />
          <div className="hero-content-wrap">
            <div className="hero-eyebrow-container">
              <CompassIcon size={13} className="hero-eyebrow-compass" />
              <span className="hero-eyebrow">CURATED SCENIC ROUTING · TRAVEL EDITORIAL</span>
            </div>

            <h1 className="hero-title">
              Where the journey outshines <em>the destination.</em>
            </h1>

            <p className="hero-subtitle">
              Roamify intelligently orchestrates scenic detours, panoramic vistas, heritage landmarks, 
              live meteorological forecasts, and Gemini AI road-trip guidance along your travel corridor.
            </p>

            {/* Actions Row */}
            <div className="hero-actions-row">
              <button
                type="button"
                className="btn-hero-primary"
                onClick={() => {
                  const plannerEl = document.getElementById("trip-planner-section");
                  if (plannerEl) {
                    plannerEl.scrollIntoView({ behavior: "smooth" });
                    const firstInput = plannerEl.querySelector("input");
                    if (firstInput) firstInput.focus();
                  }
                }}
              >
                <RouteIcon size={17} className="btn-icon" />
                <span>Plan My Trip</span>
              </button>

              <button
                type="button"
                className="btn-hero-secondary"
                onClick={() => {
                  const mapEl = document.getElementById("primary-map-section");
                  if (mapEl) {
                    mapEl.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                <CompassIcon size={17} className="btn-icon" />
                <span>Explore Live Map</span>
              </button>

              <button
                type="button"
                className="btn-hero-tertiary"
                onClick={() => setIsCopilotOpen(true)}
              >
                <SparklesIcon size={16} className="btn-icon sparkle-hero-icon" />
                <span>Gemini AI Co-Pilot</span>
              </button>
            </div>

            {/* Feature Telemetry Pillars Strip */}
            <div className="hero-pillars-grid">
              <div className="hero-pillar-item">
                <ShieldCheckIcon size={16} className="pillar-icon" />
                <div>
                  <strong>Corridor Geometry</strong>
                  <span>Dynamically scored detours</span>
                </div>
              </div>
              <div className="hero-pillar-item">
                <ClockIcon size={16} className="pillar-icon" />
                <div>
                  <strong>Strict Time Budget</strong>
                  <span>Zero arrival overshoots</span>
                </div>
              </div>
              <div className="hero-pillar-item">
                <CloudIcon size={16} className="pillar-icon" />
                <div>
                  <strong>Live Weather</strong>
                  <span>OpenWeatherMap observations</span>
                </div>
              </div>
              <div className="hero-pillar-item">
                <SparklesIcon size={16} className="pillar-icon" />
                <div>
                  <strong>Gemini AI Co-Pilot</strong>
                  <span>Candid journey strategies</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Unified Search & Preferences Panel ────────────────────────── */}
        <section id="trip-planner-section" className="planner-section" aria-label="Trip Configuration">
          <UnifiedTripPlanner
            startLocation={startLocation}
            setStartLocation={setStartLocation}
            destination={destination}
            setDestination={setDestination}
            budget={budget}
            setBudget={setBudget}
            interest={interest}
            setInterest={setInterest}
            interests={interests}
            setInterests={handleUpdateInterests}
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
            <AlertTriangleIcon size={18} className="alert-icon-svg" />
            <div className="alert-body">
              <strong>Calculation Error:</strong> {errorMsg}
            </div>
            <button
              type="button"
              className="alert-dismiss"
              onClick={() => setErrorMsg("")}
              aria-label="Dismiss error"
            >
              <XIcon size={14} />
            </button>
          </div>
        )}

        {/* ── Primary Map Section (Single Mapbox Canvas) ────────────────── */}
        <section id="primary-map-section" className="primary-map-section" aria-label="Interactive Route Map">
          <div className="map-section-header">
            <div>
              <span className="section-eyebrow">CARTOGRAPHIC CANVAS</span>
              <h2 className="map-section-title">Interactive Corridor Map</h2>
            </div>
            <div className="map-section-actions">
              <span className="map-projection-tag">Mapbox GL · WGS84 Projection</span>
            </div>
          </div>

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
            <div className="waypoints-strip-header">
              <MapPinIcon size={15} className="waypoints-header-icon" />
              <span className="waypoints-label">Active Custom Waypoints ({customWaypoints.length}):</span>
            </div>
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
                    <XIcon size={12} />
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
                <span className="results-eyebrow">CURATED DETOUR ITINERARY</span>
                <h2 className="results-title">
                  {tripResult.start_location.name} → {tripResult.destination.name}
                </h2>
              </div>
              <div className="results-meta-pill">
                <span>{interests.join(" + ")} focus</span>
                <span className="meta-dot">·</span>
                <span>{budget} budget</span>
                <span className="meta-dot">·</span>
                <span>{duration}</span>
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

            {/* ── Feature Integration: Real Weather Corridor Outlook ──────── */}
            <div id="corridor-weather-section">
              <WeatherWidget
                origin={tripResult.start_location}
                destination={tripResult.destination}
                scenicStops={tripResult.scenic_stops}
                customWaypoints={customWaypoints}
              />
            </div>

            {/* ── Feature Integration: Gemini AI Co-Pilot Road-Trip Strategy ── */}
            <div id="gemini-copilot-section">
              <GeminiCopilot
                startLocation={tripResult.start_location}
                destination={tripResult.destination}
                interests={interests}
                budget={budget}
                duration={duration}
                tripResult={tripResult}
                weatherSummary={weatherSummary}
              />
            </div>
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

        {/* ── Editorial Philosophy Section (Authentic Content, No Fabrications) ─ */}
        <section id="editorial-philosophy" className="editorial-philosophy-section" aria-label="Roamify Philosophy">
          <div className="philosophy-header">
            <span className="section-eyebrow">THE CRAFT OF SCENIC TRAVEL</span>
            <h2 className="philosophy-title">How Roamify Orchestrates Every Road</h2>
            <p className="philosophy-subtitle">
              Traditional GPS applications prioritize the fastest route through monotonous highways. Roamify rebalances the equation: finding the most scenic path while honoring your arrival time.
            </p>
          </div>

          <div className="philosophy-cards-grid">
            <article className="philosophy-card">
              <div className="philosophy-icon-badge">
                <RouteIcon size={20} />
              </div>
              <h3 className="philosophy-card-title">Elliptical Corridor Geometry</h3>
              <p className="philosophy-card-desc">
                Instead of searching blindly across whole states, Roamify projects an adaptive elliptical corridor between your origin and destination. It identifies high-value waypoints within reach, avoiding unnecessary doubling back.
              </p>
            </article>

            <article className="philosophy-card">
              <div className="philosophy-icon-badge">
                <ClockIcon size={20} />
              </div>
              <h3 className="philosophy-card-title">Mathematical Detour Caps</h3>
              <p className="philosophy-card-desc">
                Whether you have an extra hour or a full day to spare, our iterative constraint solver guarantees that the calculated scenic route will not exceed your specified time limit. No unexpected delays.
              </p>
            </article>

            <article className="philosophy-card">
              <div className="philosophy-icon-badge">
                <ShieldCheckIcon size={20} />
              </div>
              <h3 className="philosophy-card-title">Verified Open Source Cartography</h3>
              <p className="philosophy-card-desc">
                Powered by OpenRouteServices, OpenStreetMap, Mapbox GL, OpenWeatherMap, and Google Gemini AI, all telemetry, weather observations, and itinerary strategies are grounded in verified data.
              </p>
            </article>
          </div>
        </section>
      </main>

      {/* ── Floating Gemini AI Co-Pilot Button ─────────────────────────── */}
      <button
        type="button"
        className="floating-copilot-btn"
        onClick={() => setIsCopilotOpen(true)}
        title="Open Gemini AI Co-Pilot"
        aria-label="Open Gemini AI Co-Pilot"
      >
        <SparklesIcon size={18} className="floating-sparkle-icon" />
        <span className="floating-btn-text">AI Co-Pilot</span>
      </button>

      {/* ── Slide-out Gemini Co-Pilot Drawer Modal ──────────────────────── */}
      <GeminiCopilot
        startLocation={tripResult?.start_location || startLocation}
        destination={tripResult?.destination || destination}
        interests={interests}
        budget={budget}
        duration={duration}
        tripResult={tripResult}
        weatherSummary={weatherSummary}
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        isDrawer={true}
      />

      {/* ── ORS & Backend Engine Settings Modal ─────────────────────────── */}
      <ApiKeyModal
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        apiKey={apiKey}
        onSaveKey={handleSaveApiKey}
        backendStatus={backendStatus}
      />

      {/* ── Application Footer ─────────────────────────────────────────── */}
      <footer className="app-footer">
        <div className="footer-container">
          <div className="footer-brand-column">
            <div className="footer-brand-title">
              <CompassIcon size={18} className="footer-compass-svg" />
              <span>Roamify Atelier</span>
            </div>
            <p className="footer-tagline">
              Curated scenic routing, corridor discovery, and road telemetry for thoughtful travelers.
            </p>
          </div>

          <div className="footer-meta-column">
            <div className="footer-tech-stack">
              <span>Map Engine: <strong>Mapbox GL</strong></span>
              <span className="footer-sep">·</span>
              <span>Routing: <strong>OpenRouteService / OSRM</strong></span>
              <span className="footer-sep">·</span>
              <span>Weather: <strong>OpenWeatherMap</strong></span>
              <span className="footer-sep">·</span>
              <span>AI Co-Pilot: <strong>Google Gemini</strong></span>
            </div>
            <p className="footer-copyright">
              Roamify © 2026 · Designed for scenic exploration
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
