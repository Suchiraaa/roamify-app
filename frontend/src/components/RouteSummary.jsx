import React, { useState } from "react";
import { ClockIcon, RouteIcon, ShieldCheckIcon, BookmarkIcon, CheckIcon } from "./Icons";
import { useAuth } from "../context/AuthContext";

export default function RouteSummary({
  directRoute,
  scenicRoute,
  detourAddedKm,
  detourAddedMin,
  stopsCount,
  provider,
  startLocation,
  destination,
  stops = [],
  tripParams = {},
}) {
  const { user, saveTrip, setAuthModalOpen } = useAuth();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!directRoute || !scenicRoute) return null;

  const formatHoursMins = (mins) => {
    if (mins < 60) return `${Math.round(mins)} mins`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const handleSaveTrip = async () => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    setSaving(true);
    try {
      const title = `${startLocation || "Origin"} to ${destination || "Destination"}`;
      await saveTrip({
        title,
        start_location: startLocation || "Start",
        destination: destination || "Destination",
        interests: tripParams.interests || [tripParams.interest || "Nature"],
        budget: tripParams.budget || "Moderate",
        duration: tripParams.duration || "3 hours",
        profile: tripParams.profile || "driving-car",
        scenic_factor: tripParams.scenic_factor || "balanced",
        route_geometry: scenicRoute.geometry || [],
        distance_km: scenicRoute.distance_km,
        duration_min: scenicRoute.duration_min,
        stops: stops.filter((s) => s.is_included !== false),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save trip:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="route-summary-container">
      <div className="route-cards-grid">
        {/* Direct Route Card */}
        <div className="summary-card direct-card">
          <div className="summary-card-header">
            <span className="badge-pill direct-pill">Direct Corridor</span>
            <span className="card-subtext">Fastest standard transit</span>
          </div>
          <div className="summary-metric-group">
            <div className="metric">
              <span className="metric-val">{directRoute.distance_km}</span>
              <span className="metric-unit">km</span>
            </div>
            <div className="metric-divider" aria-hidden="true">·</div>
            <div className="metric">
              <span className="metric-val">{formatHoursMins(directRoute.duration_min)}</span>
            </div>
          </div>
          <p className="card-footer-text">
            Standard baseline highway routing without scenic detours or curated cultural stops.
          </p>
        </div>

        {/* Scenic Detour Route Card */}
        <div className="summary-card scenic-card">
          <div className="summary-card-header">
            <span className="badge-pill scenic-pill">
              <RouteIcon size={12} className="scenic-pill-icon" />
              <span>Roamify Curated Route</span>
            </span>
            <span className="card-subtext">
              {stopsCount} curated waypoint{stopsCount !== 1 ? "s" : ""} included
            </span>
          </div>
          <div className="summary-metric-group">
            <div className="metric">
              <span className="metric-val emerald-val">{scenicRoute.distance_km}</span>
              <span className="metric-unit">km</span>
            </div>
            <div className="metric-divider" aria-hidden="true">·</div>
            <div className="metric">
              <span className="metric-val emerald-val">{formatHoursMins(scenicRoute.duration_min)}</span>
            </div>
          </div>

          <div className="detour-badge-row">
            <span className="detour-pill">
              <ClockIcon size={13} className="detour-pill-icon" />
              <span>+{formatHoursMins(detourAddedMin)} detour</span>
            </span>
            <span className="detour-pill">
              <RouteIcon size={13} className="detour-pill-icon" />
              <span>+{detourAddedKm} km extra</span>
            </span>
          </div>
        </div>
      </div>

      <div className="routing-provider-bar flex flex-wrap items-center justify-between gap-3">
        <div className="provider-info-group">
          <ShieldCheckIcon size={14} className="provider-icon" />
          <span>Routing Engine: <strong>{provider || "OpenRouteService"}</strong></span>
        </div>

        <button
          type="button"
          onClick={handleSaveTrip}
          disabled={saving}
          className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
            saved
              ? "bg-emerald-600 text-white"
              : "bg-slate-900 text-white hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-700"
          }`}
        >
          {saved ? (
            <>
              <CheckIcon size={13} />
              <span>Saved to Trips</span>
            </>
          ) : saving ? (
            <>
              <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <BookmarkIcon size={13} />
              <span>{user ? "Save Journey" : "Sign In to Save Journey"}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
