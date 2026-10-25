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
            <span className="badge-pill direct-pill">Direct Route</span>
            <span className="card-subtext">Fastest standard highway</span>
          </div>
          <div className="summary-metric-group">
            <div className="metric">
              <span className="metric-val">{directRoute.distance_km}</span>
              <span className="metric-unit">km</span>
            </div>
            <div className="metric-divider">·</div>
            <div className="metric">
              <span className="metric-val">{formatHoursMins(directRoute.duration_min)}</span>
            </div>
          </div>
          <p className="card-footer-text">Direct point-to-point path without intermediate detours.</p>
        </div>

        {/* Scenic Detour Route Card */}
        <div className="summary-card scenic-card">
          <div className="summary-card-header">
            <span className="badge-pill scenic-pill">✨ Roamify Scenic Route</span>
            <span className="card-subtext">With {stopsCount} curated stop{stopsCount !== 1 ? "s" : ""}</span>
          </div>
          <div className="summary-metric-group">
            <div className="metric">
              <span className="metric-val emerald-val">{scenicRoute.distance_km}</span>
              <span className="metric-unit">km</span>
            </div>
            <div className="metric-divider">·</div>
            <div className="metric">
              <span className="metric-val emerald-val">{formatHoursMins(scenicRoute.duration_min)}</span>
            </div>
          </div>

          <div className="detour-badge-row">
            <span className="detour-pill">
              ⏱️ +{formatHoursMins(detourAddedMin)} detour
            </span>
            <span className="detour-pill">
              🛣️ +{detourAddedKm} km extra
            </span>
          </div>
        </div>
      </div>

      <div className="routing-provider-bar">
        <span>Routing Engine: <strong>{provider || "OpenRouteService"}</strong></span>
        <span className="provider-indicator">● Live corridor calculation</span>
      </div>
    </div>
  );
}
