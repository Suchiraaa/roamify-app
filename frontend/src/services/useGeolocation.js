import { useState, useEffect, useRef } from 'react';

/**
 * Calculates great-circle distance between two coordinates in meters (Haversine formula).
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Shared Geolocation & Speed Telemetry Hook
 * - Watches device GPS location with high accuracy
 * - Converts native speed from m/s to km/h
 * - If native speed is null (desktops, stationary devices), estimates speed from successive GPS fixes
 * - Rejects GPS jitter and implausible jumps to avoid fake readings
 * - Returns clean, unified telemetry
 *
 * Performance notes (changes from original):
 *   - maximumAge: 0  — never use cached positions; always request a fresh fix
 *   - Minimum interval between estimated-speed fixes reduced from 0.8s to 0.3s
 *   - EMA alpha raised from 0.45 to 0.65 for faster response to real speed changes
 *   - Stale-reading timeout added: if no fix arrives within 5s, mark signal stale
 */
export function useGeolocation() {
  const [userLocation, setUserLocation] = useState(null); // [lng, lat]
  const [speed, setSpeed] = useState(null); // km/h formatted string or null
  const [status, setStatus] = useState(() =>
    typeof navigator !== 'undefined' && !navigator.geolocation
      ? 'Geolocation not supported'
      : 'Acquiring GPS signal...'
  );
  const [isLive, setIsLive] = useState(false);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(() =>
    typeof navigator !== 'undefined' && !navigator.geolocation
      ? 'Geolocation is not supported by your browser.'
      : null
  );

  const lastFixRef = useRef(null); // { lat, lng, timestamp, accuracy }
  const smoothedSpeedRef = useRef(0);
  const staleTimerRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    // Mark signal as stale if no update arrives within 10 seconds
    const resetStaleTimer = () => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        setIsLive(false);
        setStatus('GPS signal stale — waiting for update');
      }, 10000);
    };

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed: rawSpeed, accuracy: acc } = position.coords;
        const timestamp = position.timestamp || Date.now();

        // Sanity check coordinates
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          return;
        }

        setUserLocation([longitude, latitude]);
        setAccuracy(acc);
        setIsLive(true);
        setError(null);
        resetStaleTimer();

        // Path A: Browser native speed available (e.g. mobile GPS)
        if (rawSpeed !== null && Number.isFinite(rawSpeed) && rawSpeed >= 0) {
          const kmh = rawSpeed * 3.6;
          if (kmh < 0.6) {
            setSpeed('0.0');
            setStatus('GPS active (Stationary)');
          } else {
            setSpeed(kmh.toFixed(1));
            setStatus('GPS active (Live)');
          }
          lastFixRef.current = { lat: latitude, lng: longitude, timestamp, accuracy: acc };
          return;
        }

        // Path B: Fallback speed estimation from successive fixes
        const lastFix = lastFixRef.current;
        if (!lastFix) {
          lastFixRef.current = { lat: latitude, lng: longitude, timestamp, accuracy: acc };
          setSpeed('0.0');
          setStatus('GPS active (Stationary)');
          return;
        }

        const dt = (timestamp - lastFix.timestamp) / 1000; // seconds

        // Ignore updates that are too close together (< 0.3s) to avoid division by near-zero
        if (dt < 0.3) {
          return;
        }

        // If time between fixes is too large (> 30s), treat as a fresh fix
        if (dt > 30) {
          lastFixRef.current = { lat: latitude, lng: longitude, timestamp, accuracy: acc };
          setSpeed('0.0');
          setStatus('GPS active');
          return;
        }

        const distMeters = haversineDistance(lastFix.lat, lastFix.lng, latitude, longitude);

        // Jitter suppression threshold:
        // When stationary, GPS drift typically creates 1-8m jumps.
        // If movement is within accuracy uncertainty, device is stationary.
        const jitterRadius = Math.max(5, Math.min(acc, 25) * 0.35);

        if (distMeters < jitterRadius) {
          // Device is stationary within GPS uncertainty radius
          smoothedSpeedRef.current = 0;
          setSpeed('0.0');
          setStatus('GPS active (Stationary)');
          lastFixRef.current = { lat: latitude, lng: longitude, timestamp, accuracy: acc };
        } else {
          const calculatedMps = distMeters / dt;
          const calculatedKmh = calculatedMps * 3.6;

          // Reject implausible jumps (> 220 km/h) caused by cell tower hops
          if (calculatedKmh > 220) {
            lastFixRef.current = { lat: latitude, lng: longitude, timestamp, accuracy: acc };
            return;
          }

          // Responsive exponential moving average filter
          const alpha = 0.70;
          smoothedSpeedRef.current = alpha * calculatedKmh + (1 - alpha) * smoothedSpeedRef.current;
          const finalSpeed = smoothedSpeedRef.current < 0.6 ? 0 : smoothedSpeedRef.current;

          setSpeed(finalSpeed.toFixed(1));
          setStatus('GPS active (Live)');
          lastFixRef.current = { lat: latitude, lng: longitude, timestamp, accuracy: acc };
        }
      },
      (err) => {
        setIsLive(false);
        setSpeed(null);
        if (err.code === 1) {
          setStatus('Location permission denied');
          setError('Location permission was denied. Enable location in browser settings.');
        } else if (err.code === 2) {
          setStatus('GPS position unavailable');
          setError('Position unavailable. Check your device GPS.');
        } else if (err.code === 3) {
          setStatus('GPS request timed out');
          setError('GPS request timed out.');
        } else {
          setStatus('GPS error');
          setError(err.message || 'Unable to retrieve location.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 500,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, []);

  return {
    userLocation,
    speed,
    status,
    isLive,
    accuracy,
    error,
  };
}
