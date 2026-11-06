import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { BookmarkIcon, TrashIcon, MapPinIcon, XIcon, CompassIcon } from "./Icons";

export default function SavedPlacesModal({ onSelectPlace, onAddStop }) {
  const { savedPlacesModalOpen, setSavedPlacesModalOpen, savedPlaces, unbookmarkPlace } = useAuth();

  useEffect(() => {
    if (!savedPlacesModalOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setSavedPlacesModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [savedPlacesModalOpen, setSavedPlacesModalOpen]);

  if (!savedPlacesModalOpen) return null;

  return (
    <div
      className="roamify-modal-backdrop"
      onClick={() => setSavedPlacesModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-places-modal-title"
    >
      <div
        className="roamify-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="roamify-modal-header">
          <div className="roamify-modal-header-left">
            <div className="roamify-modal-icon-badge amber">
              <BookmarkIcon size={22} filled />
            </div>
            <div>
              <h2 id="saved-places-modal-title" className="roamify-modal-title">
                Saved Places & Bookmarks
              </h2>
              <p className="roamify-modal-subtitle">
                {savedPlaces.length} {savedPlaces.length === 1 ? "place" : "places"} bookmarked across your journeys
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSavedPlacesModalOpen(false)}
            className="roamify-modal-close-btn"
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        {/* Content list */}
        <div className="roamify-modal-body">
          {savedPlaces.length === 0 ? (
            <div className="saved-empty-state">
              <div className="saved-empty-icon">
                <BookmarkIcon size={28} />
              </div>
              <h3 className="saved-empty-title">
                No saved places yet
              </h3>
              <p className="saved-empty-desc">
                Tap the bookmark icon on any scenic viewpoint, roadside eatery, or attraction to save it here for future trips.
              </p>
            </div>
          ) : (
            <div className="saved-places-list">
              {savedPlaces.map((place) => (
                <div
                  key={place.id || place.place_id}
                  className="saved-item-card"
                >
                  <div className="saved-item-top">
                    <div className="saved-item-info">
                      <span className="saved-place-category">
                        {place.category || "Scenic Vista"}
                      </span>
                      <h4 className="saved-item-title">
                        {place.name}
                      </h4>

                      {place.address && (
                        <p className="saved-place-address">
                          <MapPinIcon size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {place.address}
                          </span>
                        </p>
                      )}

                      {place.description && (
                        <p className="saved-place-desc">
                          {place.description}
                        </p>
                      )}
                    </div>

                    <div className="saved-item-actions">
                      {onSelectPlace && (
                        <button
                          type="button"
                          onClick={() => {
                            onSelectPlace(place);
                            setSavedPlacesModalOpen(false);
                          }}
                          className="btn-view-place"
                          title="View on Map"
                        >
                          <CompassIcon size={13} />
                          <span>View</span>
                        </button>
                      )}

                      {onAddStop && (
                        <button
                          type="button"
                          onClick={() => {
                            onAddStop({
                              id: place.place_id,
                              name: place.name,
                              lat: place.lat,
                              lon: place.lon,
                              category: place.category,
                              description: place.description,
                            });
                            setSavedPlacesModalOpen(false);
                          }}
                          className="btn-add-stop-modal"
                          title="Add to Itinerary"
                        >
                          + Add Stop
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => unbookmarkPlace(place.place_id || place.id)}
                        className="btn-delete-item"
                        title="Remove from saved"
                        aria-label="Remove place"
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="roamify-modal-footer">
          <span>Saved places sync across sessions and devices.</span>
          <button
            type="button"
            onClick={() => setSavedPlacesModalOpen(false)}
            className="btn-modal-done"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
