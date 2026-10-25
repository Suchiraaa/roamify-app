import { useState } from "react";

function NearbyPlaces({ userLocation, activeWaypoints = [], onAddWaypoint, onRemoveWaypoint, onFocusPlace }) {
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
        id: feature.properties.mapbox_id || feature.id || `${feature.geometry.coordinates[0]}-${feature.geometry.coordinates[1]}`,
        name: feature.properties.name || "Scenic Attraction",
        address: feature.properties.full_address || feature.properties.place_formatted || "",
        coordinates: feature.geometry.coordinates, // [lng, lat]
      }));

      setPlaces(mappedPlaces);
      if (mappedPlaces.length === 0) {
        setError("No major landmarks found in the immediate vicinity. Try searching in a broader area.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong fetching nearby places.");
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePlace = (place) => {
    const isAlreadyAdded = activeWaypoints.some((wp) => wp.id === place.id);

    if (isAlreadyAdded) {
      if (onRemoveWaypoint) {
        onRemoveWaypoint(place.id);
      }
    } else {
      if (onAddWaypoint) {
        onAddWaypoint(place);
      }
      // Also dispatch custom event for backward compatibility
      window.dispatchEvent(
        new CustomEvent("roamify:add-waypoint", {
          detail: {
            id: place.id,
            name: place.name,
            address: place.address,
            coordinates: place.coordinates,
          },
        })
      );
    }
  };

  return (
    <section className="nearby-places-panel" aria-label="Explore Nearby Places">
      <div className="nearby-header">
        <div>
          <h3 className="panel-title">Explore Nearby Detours</h3>
          <p className="panel-subtitle">Discover scenic parks, landmarks, and vistas near your position.</p>
        </div>
        <button
          type="button"
          className="btn-discover"
          onClick={findNearbyPlaces}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="btn-spinner" /> Searching...
            </>
          ) : (
            "Find Places"
          )}
        </button>
      </div>

      {error && (
        <div className="nearby-error-alert" role="alert">
          <span>{error}</span>
        </div>
      )}

      {places.length > 0 && (
        <div className="nearby-grid">
          {places.map((place) => {
            const isAdded = activeWaypoints.some((wp) => wp.id === place.id);
            return (
              <article key={place.id} className={`nearby-place-card ${isAdded ? "is-in-trip" : ""}`}>
                <div className="place-info">
                  <h4 className="place-name">{place.name}</h4>
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
                    📍 View Map
                  </button>
                  <button
                    type="button"
                    className={`btn-add-trip ${isAdded ? "btn-added" : ""}`}
                    onClick={() => handleTogglePlace(place)}
                    aria-pressed={isAdded}
                  >
                    {isAdded ? "In Trip" : "+ Add to Trip"}
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
