
import { useState } from "react";

function NearbyPlaces() {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function findNearbyPlaces() {
    setError("");

    if (!navigator.geolocation) {
      setError("Your browser does not support location access.");
      return;
    }

    setLoading(true);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const token = import.meta.env.VITE_MAPBOX_TOKEN;

          if (!token) {
            throw new Error("Mapbox token is missing.");
          }

          const url = new URL(
            "https://api.mapbox.com/search/searchbox/v1/category/park,landmark,tourist_attraction"
          );

          url.searchParams.set("proximity", `${longitude},${latitude}`);
          url.searchParams.set("limit", "10");
          url.searchParams.set("access_token", token);

          const response = await fetch(url);

          if (!response.ok) {
            throw new Error("Could not fetch nearby places.");
          }

          const data = await response.json();

          setPlaces(
            (data.features || []).map((feature) => ({
              id: feature.properties.mapbox_id,
              name: feature.properties.name,
              address: feature.properties.full_address || "",
              coordinates: feature.geometry.coordinates,
            }))
          );
        } catch (err) {
          setError(err.message || "Something went wrong.");
        } finally {
          setLoading(false);
        }
      },
      () => {
        setError("Location permission denied. Allow location access and try again.");
        setLoading(false);
      }
    );
  }

  return (
    <section className="nearby-places">
      <h2>Explore Nearby</h2>
      <p>Discover places worth a detour on your journey.</p>

      <button onClick={findNearbyPlaces} disabled={loading}>
        {loading ? "Finding places..." : "Find Nearby Places"}
      </button>

      {error && <p role="alert">{error}</p>}

      {places.map((place) => (
        <article key={place.id} className="nearby-place">
          <h3>{place.name}</h3>
          {place.address && <p>{place.address}</p>}
          <button
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("roamify:add-waypoint", {
                  detail: {
                    name: place.name,
                    coordinates: place.coordinates,
                  },
                })
              )
            }
          >
            Add to trip
          </button>
        </article>
      ))}
    </section>
  );
}

export default NearbyPlaces;
