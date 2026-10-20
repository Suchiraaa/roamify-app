import { useState, useEffect } from 'react'

function Speedometer() {
  const [speed, setSpeed] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported on this device')
      return
    }

    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        const speedMs = position.coords.speed
        if (speedMs !== null) {
          const speedKmh = (speedMs * 3.6).toFixed(1)
          setSpeed(speedKmh)
        } else {
          setSpeed(0)
        }
      },
      (err) => setError('Location permission denied'),
      { enableHighAccuracy: true }
    )

    return () => navigator.geolocation.clearWatch(watcher)
  }, [])

  return (
    <div style={{
      background: '#1a1a2e',
      color: 'white',
      borderRadius: '12px',
      padding: '20px',
      textAlign: 'center',
      width: '200px',
      margin: '20px auto'
    }}>
      <h3 style={{ margin: 0, color: '#888' }}>SPEED</h3>
      {error ? (
        <p style={{ color: 'red', fontSize: '14px' }}>{error}</p>
      ) : (
        <>
          <p style={{ fontSize: '48px', fontWeight: 'bold', margin: '10px 0' }}>
            {speed ?? '—'}
          </p>
          <p style={{ color: '#888', margin: 0 }}>km/h</p>
        </>
      )}
    </div>
  )
}

export default Speedometer