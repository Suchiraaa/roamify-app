import {
  ClockIcon,
  CoinsIcon,
  StarIcon,
  MapPinIcon,
  ExternalLinkIcon,
  CheckIcon,
  PlusIcon,
  CategoryIcon,
} from "./Icons";

export default function ScenicStopsList({
  stops = [],
  onToggleStop,
  onFocusStop,
}) {
  if (!stops || stops.length === 0) {
    return (
      <div className="empty-stops-box">
        <p>No scenic stops found along this corridor yet. Try expanding your detour window or selecting additional interests.</p>
      </div>
    );
  }

  const includedCount = stops.filter((s) => s.is_included !== false).length;

  return (
    <div className="scenic-stops-section">
      <div className="scenic-stops-header">
        <div>
          <span className="section-eyebrow">CURATED ITINERARY</span>
          <h3 className="section-title">Scenic Stops Along Your Route</h3>
          <p className="section-subtext">
            {includedCount} of {stops.length} stops included in your current scenic itinerary. Check or uncheck stops to customize your route.
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
                  <div className="stop-vector-icon" title={stop.category || "Scenic Vista"}>
                    <CategoryIcon category={stop.category} className="stop-category-svg" size={20} />
                  </div>
                  <span className="stop-number">#{idx + 1}</span>
                </div>

                <div className="stop-details">
                  <div className="stop-title-row">
                    <h4 className="stop-title">{stop.name}</h4>
                    <span className="category-tag">{stop.category || "Scenic"}</span>
                  </div>

                  <p className="stop-description">{stop.description}</p>

                  <div className="stop-meta-row">
                    <span className="meta-item detour-time">
                      <ClockIcon size={13} className="meta-svg" />
                      <span>+{stop.detour_min || 20} min detour</span>
                    </span>
                    <span className="meta-item budget-level">
                      <CoinsIcon size={13} className="meta-svg" />
                      <span>{stop.budget || "Moderate"}</span>
                    </span>
                    <span className="meta-item rating">
                      <StarIcon size={13} filled={true} className="star-svg" />
                      <span>{stop.scenic_score || 4.5}</span>
                    </span>
                    {stop.lat && stop.lon && (
                      <div className="stop-map-actions">
                        <button
                          type="button"
                          className="btn-focus-map"
                          onClick={() => onFocusStop && onFocusStop(stop)}
                          title={`Focus ${stop.name} on the interactive map`}
                        >
                          <MapPinIcon size={13} className="focus-pin-svg" />
                          <span>View on Map</span>
                        </button>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.name)}+${stop.lat},${stop.lon}`}
                          target="_blank"
                          rel="noreferrer"
                          className="meta-link-external"
                          title="Open location in external map"
                          aria-label={`Open ${stop.name} in external map`}
                        >
                          <ExternalLinkIcon size={13} />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="stop-action-bar">
                <button
                  type="button"
                  className={`toggle-stop-action-btn ${isIncluded ? "btn-active" : "btn-inactive"}`}
                  onClick={() => onToggleStop(stop.id)}
                  aria-pressed={isIncluded}
                >
                  {isIncluded ? (
                    <>
                      <CheckIcon size={14} className="action-btn-icon" />
                      <span>Included in Scenic Route</span>
                    </>
                  ) : (
                    <>
                      <PlusIcon size={14} className="action-btn-icon" />
                      <span>Add to Scenic Route</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
