
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import "./App.css";

const waypoints = [
  { id: 1, name: 'Start Point', lat: 40.7128, lng: -74.0060 },
  { id: 2, name: 'Checkpoint 1', lat: 40.7306, lng: -73.9352 },
  { id: 3, name: 'Destination', lat: 40.7589, lng: -73.9851 },
]

function Waypoints() {
  const mapContainer = useRef(null)

  useEffect(() => {
    mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-74.0060, 40.7128],
      zoom: 11,
    })

    waypoints.forEach((pin, index) => {
      new mapboxgl.Marker({ color: index === 0 ? '#1E293B' : (index === waypoints.length - 1 ? '#BA6E65' : '#334155') })
        .setLngLat([pin.lng, pin.lat])
        .setPopup(new mapboxgl.Popup({ offset: 25 }).setText(pin.name))
        .addTo(map)
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    return () => map.remove()
  }, [])

  return (
    <main className="roamify-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">YOUR JOURNEY</p>
          <h1>Route Overview</h1>
          <p className="page-description">
            Explore your route and view each stop along the way.
          </p>
        </div>
        <span className="stop-count">{waypoints.length} stops</span>
      </header>

      <section className="map-card">
        <div className="section-heading">
          <h2>Route Map</h2>
          <p>Your start, checkpoints and destination</p>
        </div>

        <div ref={mapContainer} className="route-map" />
      </section>

      <section className="stops-section">
        <div className="section-heading">
          <h2>Your Stops</h2>
          <p>Locations included in your journey</p>
        </div>

        <div className="stops-list">
          {waypoints.map((pin, index) => (
            <article className="stop-card" key={pin.id}>
              <div className={`stop-number stop-${index}`}>
                {String(index + 1).padStart(2, '0')}
              </div>

              <div className="stop-details">
                <h3>{pin.name}</h3>
                <p>
                  {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
                </p>
              </div>

              <span className="stop-type">
                {index === 0
                  ? 'START'
                  : index === waypoints.length - 1
                    ? 'END'
                    : 'WAYPOINT'}
              </span>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

export default Waypoints
