import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { RouteIcon, TrashIcon, MapPinIcon, XIcon, ClockIcon } from "./Icons";

export default function SavedTripsModal({ onLoadTrip }) {
  const { savedTripsModalOpen, setSavedTripsModalOpen, savedTrips, deleteTrip } = useAuth();

  useEffect(() => {
    if (!savedTripsModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSavedTripsModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [savedTripsModalOpen, setSavedTripsModalOpen]);

  if (!savedTripsModalOpen) return null;

  return (
    <div
      className="roamify-modal-backdrop"
      onClick={() => setSavedTripsModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-trips-modal-title"
    >
      <div
        className="roamify-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="roamify-modal-header">
          <div className="roamify-modal-header-left">
            <div className="roamify-modal-icon-badge blue">
              <RouteIcon size={22} />
            </div>
            <div>
              <h2 id="saved-trips-modal-title" className="roamify-modal-title">
                Saved Trips & Itineraries
              </h2>
              <p className="roamify-modal-subtitle">
                {savedTrips.length} {savedTrips.length === 1 ? "route" : "routes"} saved to your account
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSavedTripsModalOpen(false)}
            className="roamify-modal-close-btn"
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="roamify-modal-body">
          {savedTrips.length === 0 ? (
            <div className="saved-empty-state">
              <div className="saved-empty-icon">
                <RouteIcon size={28} />
              </div>
              <h3 className="saved-empty-title">
                No saved trips yet
              </h3>
              <p className="saved-empty-desc">
                Plan a route between any two cities, customize scenic detours, and click "Save Trip" to keep it here.
              </p>
            </div>
          ) : (
            <div className="saved-trips-list">
              {savedTrips.map((trip) => {
                const formattedDate = trip.created_at
                  ? new Date(trip.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "";

                return (
                  <div key={trip.id} className="saved-item-card">
                    <div className="saved-item-top">
                      <div className="saved-item-info">
                        <h4 className="saved-item-title">
                          {trip.title}
                        </h4>
                        <div className="saved-item-meta">
                          <span className="saved-item-route">
                            <MapPinIcon size={13} style={{ color: "#10b981", flexShrink: 0 }} />
                            {trip.start_location} → {trip.destination}
                          </span>
                          {trip.distance_km && (
                            <span>{Math.round(trip.distance_km)} km</span>
                          )}
                          {trip.duration_min && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <ClockIcon size={12} style={{ color: "var(--text-muted)" }} />
                              {Math.round(trip.duration_min)} min
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="saved-item-actions">
                        <button
                          type="button"
                          onClick={() => {
                            if (onLoadTrip) onLoadTrip(trip);
                            setSavedTripsModalOpen(false);
                          }}
                          className="btn-load-journey"
                        >
                          Load Journey
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteTrip(trip.id)}
                          className="btn-delete-item"
                          title="Delete Trip"
                          aria-label="Delete trip"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </div>
                    </div>

                    {trip.stops && trip.stops.length > 0 && (
                      <div className="saved-stops-strip">
                        <span className="saved-stops-label">Scenic Stops:</span>
                        {trip.stops.map((s, idx) => (
                          <span key={idx} className="saved-stop-chip">
                            {s.name || s.title || `Stop ${idx + 1}`}
                          </span>
                        ))}
                      </div>
                    )}

                    {formattedDate && (
                      <div className="saved-item-date">
                        Saved on {formattedDate}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="roamify-modal-footer">
          <span>Trips are stored securely in SQLite database.</span>
          <button
            type="button"
            onClick={() => setSavedTripsModalOpen(false)}
            className="btn-modal-done"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
