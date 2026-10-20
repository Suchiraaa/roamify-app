export default function ScenicStopsList({
  stops = [],
  onToggleStop,
  interest,
}) {
  if (!stops || stops.length === 0) {
    return (
      <div className="empty-stops-box">
        <p>No scenic stops found along this corridor yet. Try adjusting your interest or time limit.</p>
      </div>
    );
  }

  const includedCount = stops.filter((s) => s.is_included !== false).length;

  return (
    <div className="scenic-stops-section">
      <div className="scenic-stops-header">
        <div>
          <h3>Scenic Stops Along Your Way</h3>
          <p className="section-subtext">
            {includedCount} of {stops.length} stops included in your current scenic route. Check or uncheck stops to customize your detour.
          </p>
        </div>
      </div>

      <div className="stops-grid">
        {stops.map((stop, idx) => {
          const isIncluded = stop.is_included !== false;

          return (
            <div
              key={stop.id || idx}
              className={`stop-card ${isIncluded ? "stop-included" : "stop-excluded"}`}
            >
              <div className="stop-card-main">
                <div className="stop-icon-container">
                  <span className="stop-emoji">{stop.icon || "📍"}</span>
                  <span className="stop-number">#{idx + 1}</span>
                </div>

                <div className="stop-details">
                  <div className="stop-title-row">
                    <h4 className="stop-title">{stop.name}</h4>
                    <span className="category-tag">{stop.category}</span>
                  </div>

                  <p className="stop-description">{stop.description}</p>

                  <div className="stop-meta-row">
                    <span className="meta-item detour-time">
                      ⏱️ +{stop.detour_min || 20} min detour
                    </span>
                    <span className="meta-item budget-level">
                      💰 {stop.budget || "Moderate"}
                    </span>
                    <span className="meta-item rating">
                      ⭐ {stop.scenic_score || 4.5}
                    </span>
                    {stop.lat && stop.lon && (
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${stop.lat}&mlon=${stop.lon}#map=16/${stop.lat}/${stop.lon}`}
                        target="_blank"
                        rel="noreferrer"
                        className="meta-link"
                      >
                        Map view ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="stop-action-bar">
                <button
                  type="button"
                  className={`toggle-stop-action-btn ${isIncluded ? "btn-active" : "btn-inactive"}`}
                  onClick={() => onToggleStop(stop.id)}
                >
                  {isIncluded ? "✓ Included in Scenic Route" : "+ Add to Scenic Route"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
