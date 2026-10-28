import { ClockIcon, RouteIcon, ShieldCheckIcon } from "./Icons";

export default function RouteSummary({
  directRoute,
  scenicRoute,
  detourAddedKm,
  detourAddedMin,
  stopsCount,
  provider,
}) {
  if (!directRoute || !scenicRoute) return null;

  const formatHoursMins = (mins) => {
    if (mins < 60) return `${Math.round(mins)} mins`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
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

      <div className="routing-provider-bar">
        <div className="provider-info-group">
          <ShieldCheckIcon size={14} className="provider-icon" />
          <span>Routing Engine: <strong>{provider || "OpenRouteService"}</strong></span>
        </div>
        <span className="provider-indicator">Live corridor telemetry active</span>
      </div>
    </div>
  );
}
