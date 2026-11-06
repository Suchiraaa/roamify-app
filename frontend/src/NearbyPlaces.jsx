import { useState } from "react";
import {
  CompassIcon,
  SearchIcon,
  MapPinIcon,
  CheckIcon,
  PlusIcon,
  AlertTriangleIcon,
  BookmarkIcon,
} from "./components/Icons";
import { useAuth } from "./context/AuthContext";

function NearbyPlaces({
  userLocation,
  activeWaypoints = [],
  onAddWaypoint,
  onRemoveWaypoint,
  onFocusPlace,
}) {
  const { isPlaceSaved, bookmarkPlace, unbookmarkPlace } = useAuth();
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const findNearbyPlaces = async () => {
    setError("");

    // Determine target coordinates: prefer current user location, or request via browser
    let targetLngLat = userLocation;

    if (!targetLngLat || targetLngLat.length !== 2) {
      if (!navigator.geolocation) {
        setError("Browser geolocation is not supported on this device.");
        return;
      }

      setLoading(true);
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
          });
        });
        targetLngLat = [position.coords.longitude, position.coords.latitude];
      } catch {
        setLoading(false);
        setError("Location permission denied or unavailable. Grant GPS access to discover nearby places.");
        return;
      }
    }

    setLoading(true);
    const [longitude, latitude] = targetLngLat;

    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN;
      if (!token) {
        throw new Error("Mapbox token is missing. Configure VITE_MAPBOX_TOKEN in your environment.");
      }

      const url = new URL(
        "https://api.mapbox.com/search/searchbox/v1/category/park,landmark,tourist_attraction"
      );
      url.searchParams.set("proximity", `${longitude},${latitude}`);
      url.searchParams.set("limit", "8");
      url.searchParams.set("access_token", token);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch nearby places (status: ${response.status}).`);
      }

      const data = await response.json();
      const mappedPlaces = (data.features || []).map((feature) => ({
        id:
          feature.properties.mapbox_id ||
          feature.id ||
          `${feature.geometry.coordinates[0]}-${feature.geometry.coordinates[1]}`,
        name: feature.properties.name || "Scenic Attraction",
        address: feature.properties.full_address || feature.properties.place_formatted || "",
        coordinates: feature.geometry.coordinates, // [lng, lat]
      }));

      setPlaces(mappedPlaces);
    } catch (err) {
      setError(err.message || "Failed to locate nearby attractions.");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlace = (place) => {
    const isAdded = activeWaypoints.some((wp) => wp.id === place.id);
    if (isAdded) {
      if (onRemoveWaypoint) onRemoveWaypoint(place.id);
    } else {
      if (onAddWaypoint) {
        onAddWaypoint({
          id: place.id,
          name: place.name,
          lat: place.coordinates[1],
          lon: place.coordinates[0],
          is_stop: true,
        });
      }
    }
  };

  return (
    <section className="nearby-places-card" aria-label="Nearby Scenic Stops Discovery">
      <div className="nearby-header">
        <div className="nearby-title-group">
          <div className="nearby-badge">
            <CompassIcon size={14} />
            <span>LOCAL EXPLORATION</span>
          </div>
          <h3 className="nearby-title">Nearby Scenic Attractions</h3>
          <p className="nearby-subtitle">
            Find tourist landmarks, state parks, and scenic lookouts near your current position.
          </p>
        </div>

        <button
          type="button"
          className="btn-discover"
          onClick={findNearbyPlaces}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner-sm" />
              <span>Scanning...</span>
            </>
          ) : (
            <>
              <SearchIcon size={14} />
              <span>Discover Nearby</span>
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="nearby-error-banner" role="alert">
          <AlertTriangleIcon size={16} />
          <span>{error}</span>
        </div>
      )}

      {places.length > 0 && (
        <div className="nearby-grid">
          {places.map((place) => {
            const isAdded = activeWaypoints.some((wp) => wp.id === place.id);
            const isSaved = isPlaceSaved(place.id);

            return (
              <article key={place.id} className={`nearby-place-card ${isAdded ? "is-in-trip" : ""}`}>
                <div className="place-info">
                  <div className="place-title-row">
                    <CompassIcon size={14} className="place-icon-badge" />
                    <h4 className="place-name">{place.name}</h4>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSaved) {
                          unbookmarkPlace(place.id);
                        } else {
                          bookmarkPlace({
                            id: place.id,
                            name: place.name,
                            category: "Attraction",
                            lat: place.coordinates[1],
                            lon: place.coordinates[0],
                            address: place.address,
                          });
                        }
                      }}
                      className={`ml-auto p-1 rounded-md border transition-colors cursor-pointer ${
                        isSaved
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "text-slate-400 hover:text-amber-500 border-slate-200 dark:border-slate-700"
                      }`}
                      title={isSaved ? "Remove from Saved Places" : "Save to Bookmarks"}
                      aria-label={isSaved ? "Remove from Saved Places" : "Save to Bookmarks"}
                    >
                      <BookmarkIcon size={13} filled={isSaved} />
                    </button>
                  </div>
                  {place.address && <p className="place-address">{place.address}</p>}
                </div>
                <div className="nearby-actions-group">
                  <button
                    type="button"
                    className="btn-focus-place"
                    onClick={() =>
                      onFocusPlace &&
                      onFocusPlace({
                        lat: place.coordinates[1],
                        lon: place.coordinates[0],
                        name: place.name,
                      })
                    }
                    title={`Focus ${place.name} on the map`}
                  >
                    <MapPinIcon size={13} />
                    <span>View Map</span>
                  </button>
                  <button
                    type="button"
                    className={`btn-add-trip ${isAdded ? "btn-added" : ""}`}
                    onClick={() => handleTogglePlace(place)}
                    aria-pressed={isAdded}
                  >
                    {isAdded ? (
                      <>
                        <CheckIcon size={13} />
                        <span>In Trip</span>
                      </>
                    ) : (
                      <>
                        <PlusIcon size={13} />
                        <span>Add to Trip</span>
                      </>
                    )}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default NearbyPlaces;
