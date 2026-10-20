import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';
import RouteSearchOverlay from './RouteSearchOverlay';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

const MAP_STYLES = [
  { label: 'Day', url: 'mapbox://styles/mapbox/navigation-day-v1' },
  { label: 'Night', url: 'mapbox://styles/mapbox/navigation-night-v1' },
  { label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
];

// Neutral default initial center for canvas placement before user geolocation
const DEFAULT_CENTER = [77.5946, 12.9716];

export default function Map({ routeGeoJson, onRouteUpdate }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const geolocateCtrlRef = useRef(null);
  const activeRouteRef = useRef(routeGeoJson || null);

  const [currentStyle, setCurrentStyle] = useState(MAP_STYLES[0].url);
  const [is3D, setIs3D] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [activeRouteInfo, setActiveRouteInfo] = useState(null);
  const [hasActiveRoute, setHasActiveRoute] = useState(Boolean(routeGeoJson?.geometry?.coordinates?.length));
  const [toastMessage, setToastMessage] = useState(null); // { text, type: 'info' | 'warning' }
  const toastTimerRef = useRef(null);

  // Helper to trigger non-intrusive notification banners
  const showToast = useCallback((text, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ text, type });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  }, []);

  // Safely fit map viewport to an array of coordinate pairs [lng, lat]
  const fitMapToBounds = useCallback((coordinates) => {
    if (!map.current || !coordinates || coordinates.length === 0) return;

    try {
      const bounds = coordinates.reduce((acc, coord) => {
        return acc.extend(coord);
      }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

      map.current.fitBounds(bounds, {
        padding: { top: 90, bottom: 90, left: 90, right: 90 },
        maxZoom: 15,
        duration: 1200
      });
    } catch (err) {
      console.warn('fitBounds error:', err);
    }
  }, []);

  // Configure road-snapped GeoJSON source & polyline layers
  const loadRouteLayers = useCallback((routeData) => {
    if (!map.current) return;

    const emptyGeoJson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] }
    };

    const dataToLoad = routeData || emptyGeoJson;

    // Add or update source
    if (!map.current.getSource('scenic-route')) {
      map.current.addSource('scenic-route', {
        type: 'geojson',
        data: dataToLoad
      });
    } else {
      map.current.getSource('scenic-route').setData(dataToLoad);
    }

    // Outer glow / contrast casing layer
    if (!map.current.getLayer('route-glow')) {
      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'scenic-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 10,
          'line-opacity': 0.35
        }
      });
    }

    // Inner sharp polyline layer
    if (!map.current.getLayer('route-line')) {
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'scenic-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2563eb',
          'line-width': 5,
          'line-opacity': 0.95
        }
      });
    }
  }, []);

  // Initialize Mapbox Canvas
  useEffect(() => {
    if (!MAPBOX_TOKEN || map.current) return;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: currentStyle,
      center: DEFAULT_CENTER,
      zoom: 11,
      pitch: 0,
      bearing: 0,
      antialias: true
    });

    map.current = mapInstance;

    // Navigation Controls (Zoom / Pitch / Compass)
    mapInstance.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Live Device Geolocation Control
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true,
      showUserHeading: true,
      showUserLocation: true
    });

    geolocateCtrlRef.current = geolocate;
    mapInstance.addControl(geolocate, 'top-right');

    // Handle live geolocation coordinate updates
    geolocate.on('geolocate', (e) => {
      if (e.coords) {
        setUserLocation([e.coords.longitude, e.coords.latitude]);
      }
    });

    // Handle geolocation permission or hardware errors gracefully without fabricating location
    geolocate.on('error', (err) => {
      console.warn('Mapbox GeolocateControl notice:', err);
      if (err.code === 1) {
        showToast('Location permission denied. Map is ready for manual search.', 'info');
      } else if (err.code === 2 || err.code === 3) {
        showToast('GPS position unavailable. You can enter locations manually.', 'info');
      }
    });

    // Synchronize 3D pitch state with camera tilt
    mapInstance.on('pitch', () => {
      setIs3D(mapInstance.getPitch() > 25);
    });

    // Map load handler - strictly renders only active route if provided, never mock routes
    mapInstance.on('load', () => {
      loadRouteLayers(activeRouteRef.current);

      if (activeRouteRef.current?.geometry?.coordinates?.length) {
        fitMapToBounds(activeRouteRef.current.geometry.coordinates);
      }

      // Request browser geolocation permission and center on user's real position
      try {
        geolocate.trigger();
      } catch {
        // Geolocation trigger fallback for non-secure contexts
      }
    });

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [currentStyle, fitMapToBounds, loadRouteLayers, showToast]);

  // Handle dynamic map style switching (Day, Night, Satellite)
  const handleSwitchStyle = (styleUrl) => {
    if (styleUrl === currentStyle || !map.current) return;
    setCurrentStyle(styleUrl);

    map.current.setStyle(styleUrl);
    map.current.once('style.load', () => {
      // Re-apply route line layers onto newly loaded style without losing or creating any route
      loadRouteLayers(activeRouteRef.current);
    });
  };

  // Recenter to live GPS location (does not touch route or destination)
  const handleRecenterLocation = () => {
    if (userLocation && map.current) {
      map.current.flyTo({ center: userLocation, zoom: 15, duration: 1000 });
    } else if (geolocateCtrlRef.current) {
      try {
        geolocateCtrlRef.current.trigger();
        showToast('Requesting GPS location...', 'info');
      } catch {
        showToast('Current GPS location is unavailable. Check location permissions.', 'warning');
      }
    } else {
      showToast('Current GPS location is unavailable.', 'warning');
    }
  };

  // Recenter Route Handler: strictly centers on active route if one exists, does not fabricate
  const handleRecenterRoute = () => {
    if (activeRouteRef.current?.geometry?.coordinates?.length) {
      fitMapToBounds(activeRouteRef.current.geometry.coordinates);
    } else {
      showToast('No active route to recenter. Enter a start and destination first.', 'info');
    }
  };

  // Toggle 3D Pitch Handler: toggles camera tilt between 2D top-down and 3D angle without modifying route
  const handleTogglePitch = () => {
    if (!map.current) return;

    if (is3D) {
      map.current.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 750
      });
      setIs3D(false);
    } else {
      map.current.easeTo({
        pitch: 60,
        bearing: -15,
        duration: 750
      });
      setIs3D(true);
    }
  };

  // Handler when user searches and calculates a real route
  const handleRouteCalculated = (routeFeature, info) => {
    activeRouteRef.current = routeFeature;
    setActiveRouteInfo(info);
    setHasActiveRoute(Boolean(routeFeature?.geometry?.coordinates?.length));
    loadRouteLayers(routeFeature);

    if (routeFeature.geometry?.coordinates) {
      fitMapToBounds(routeFeature.geometry.coordinates);
    }

    if (onRouteUpdate) {
      onRouteUpdate(routeFeature);
    }
  };

  // Handler to clear active route completely
  const handleClearRoute = () => {
    activeRouteRef.current = null;
    setActiveRouteInfo(null);
    setHasActiveRoute(false);
    loadRouteLayers(null);

    if (onRouteUpdate) {
      onRouteUpdate(null);
    }
  };

  // Synchronize when routeGeoJson prop is passed externally from App.jsx
  useEffect(() => {
    if (routeGeoJson !== activeRouteRef.current) {
      activeRouteRef.current = routeGeoJson;
      setHasActiveRoute(Boolean(routeGeoJson?.geometry?.coordinates?.length));
      if (map.current && map.current.isStyleLoaded()) {
        loadRouteLayers(routeGeoJson);
        if (routeGeoJson?.geometry?.coordinates?.length) {
          fitMapToBounds(routeGeoJson.geometry.coordinates);
        }
      }
    }
  }, [routeGeoJson, fitMapToBounds, loadRouteLayers]);

  // Missing Mapbox token safeguard
  if (!MAPBOX_TOKEN) {
    return (
      <div className="roamify-map-wrapper">
        <div className="roamify-token-alert">
          <h3>Mapbox Configuration Required</h3>
          <p>
            Please configure your Mapbox public access token in <code>frontend/.env</code> to load map tiles and routing:
          </p>
          <code>VITE_MAPBOX_TOKEN=your_mapbox_token_here</code>
          <p className="roamify-token-hint">
            Obtain a token at <a href="https://account.mapbox.com/" target="_blank" rel="noreferrer">mapbox.com</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="roamify-map-wrapper">
      {/* Mapbox WebGL Canvas Container */}
      <div ref={mapContainer} className="roamify-map-container" />

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div className={`roamify-toast roamify-toast-${toastMessage.type}`} role="status">
          <span>{toastMessage.text}</span>
          <button
            type="button"
            className="roamify-toast-close"
            onClick={() => setToastMessage(null)}
            aria-label="Close notification"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real Route Search Overlay (Start, Destination, Autocomplete, Directions API) */}
      <RouteSearchOverlay
        mapboxToken={MAPBOX_TOKEN}
        userLocation={userLocation}
        onRouteCalculated={handleRouteCalculated}
        onClearRoute={handleClearRoute}
        activeRouteInfo={activeRouteInfo}
        onNotify={showToast}
      />

      {/* Floating Canvas Controls Overlay (Bottom-Right) */}
      <div className="roamify-floating-controls">
        {/* Canvas Actions: Recenter Location, Recenter Route, Toggle 3D Pitch */}
        <div className="roamify-action-controls">
          <button
            type="button"
            className="roamify-control-btn"
            title="Recenter to my live GPS location"
            onClick={handleRecenterLocation}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
            <span>My Location</span>
          </button>

          <button
            type="button"
            className={`roamify-control-btn ${hasActiveRoute ? '' : 'disabled'}`}
            title={hasActiveRoute ? 'Fit camera to active route' : 'No active route to recenter'}
            onClick={handleRecenterRoute}
            disabled={!hasActiveRoute}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h3l3-7 6 14 3-7h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Recenter Route</span>
          </button>

          <button
            type="button"
            className={`roamify-control-btn ${is3D ? 'active' : ''}`}
            title="Toggle 2D / 3D camera tilt"
            onClick={handleTogglePitch}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{is3D ? '3D View' : '2D View'}</span>
          </button>
        </div>

        {/* Floating Map Style Switcher Widget (Day, Night, Satellite) */}
        <div className="roamify-style-switcher" role="tablist" aria-label="Map style switcher">
          {MAP_STYLES.map((style) => (
            <button
              key={style.label}
              type="button"
              className={`roamify-style-btn ${currentStyle === style.url ? 'active' : ''}`}
              onClick={() => handleSwitchStyle(style.url)}
              title={`Switch map view to ${style.label}`}
              role="tab"
              aria-selected={currentStyle === style.url}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
