
import { useState, useEffect } from 'react'
import './Roamify.css'

function Speedometer() {
  const [speed, setSpeed] = useState(null)
  const [status, setStatus] = useState('Waiting for location')

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('Location is not supported')
      return
    }

    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        const speedMs = position.coords.speed

        if (speedMs !== null && Number.isFinite(speedMs)) {
          setSpeed((speedMs * 3.6).toFixed(1))
          setStatus('GPS connected')
        } else {
          setSpeed(null)
          setStatus('Speed data unavailable')
        }
      },
      (err) => {
        setSpeed(null)
        setStatus(
          err.code === 1
            ? 'Location permission denied'
            : 'Unable to get location'
        )
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    )

    return () => navigator.geolocation.clearWatch(watcher)
  }, [])

  return (
    <section className="speed-card">
      <div className="speed-card-header">
        <div>
          <p className="eyebrow">LIVE TELEMETRY</p>
          <h2>Current Speed</h2>
        </div>

        <span className="live-indicator">
          <span className="status-dot" />
          LIVE
        </span>
      </div>

      <div className="speed-reading">
        <span className="speed-value">
          {speed ?? '--'}
        </span>
        <span className="speed-unit">km/h</span>
      </div>

      <div className="speed-divider" />

      <div className="speed-footer">
        <span className="status-dot" />
        <p>{status}</p>
      </div>
    </section>
  )
}

export default Speedometer
