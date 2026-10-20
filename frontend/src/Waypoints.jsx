
import { useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

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

    waypoints.forEach((pin) => {
      new mapboxgl.Marker()
        .setLngLat([pin.lng, pin.lat])
        .setPopup(new mapboxgl.Popup().setText(pin.name))
        .addTo(map)
    })

    map.addControl(new mapboxgl.NavigationControl())

    return () => map.remove()
  }, [])

  return (
    <section style={{ padding: '20px' }}>
      <h2>Roamify Waypoints</h2>

      <div
        ref={mapContainer}
        style={{
          width: '100%',
          height: '450px',
          borderRadius: '12px',
        }}
      />

      <ul>
        {waypoints.map((pin) => (
          <li key={pin.id}>
            {pin.name} — {pin.lat}, {pin.lng}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default Waypoints
