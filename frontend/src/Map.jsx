import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './Map.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
if (MAPBOX_TOKEN) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
}

const MAP_STYLES = [
  { label: 'Day', url: 'mapbox://styles/mapbox/navigation-day-v1' },
  { label: 'Night', url: 'mapbox://styles/mapbox/navigation-night-v1' },
  { label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
];

// Neutral world view for initial unplanned state
const DEFAULT_CENTER = [0, 20];
const DEFAULT_ZOOM = 2;

export default function Map({
  routeGeoJson,
  directRouteGeoJson,
  startLocation,
  destination,
  scenicStops = [],
  customWaypoints = [],
  onToggleStop,
  onRemoveWaypoint,
  sharedLocation,
  theme = 'light',
  focusedLocation,
}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const geolocateCtrlRef = useRef(null);
  const markersRef = useRef([]);
  const hasCenteredOnUserRef = useRef(false);

  const initialStyle = theme === 'dark' ? MAP_STYLES[1].url : MAP_STYLES[0].url;
  const [currentStyle, setCurrentStyle] = useState(initialStyle);
  const currentStyleRef = useRef(initialStyle);
  const [is3D, setIs3D] = useState(false);
  const [toastMessage, setToastMessage] = useState(null); // { text, type: 'info' | 'warning' }
  const toastTimerRef = useRef(null);

  // Helper to trigger non-intrusive notification banners
  const showToast = useCallback((text, type = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage({ text, type });
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Safely fit map viewport to an array of coordinate pairs [lng, lat]
  const fitMapToBounds = useCallback((coordinates) => {
    if (!map.current || !coordinates || coordinates.length === 0) return;

    try {
      const bounds = coordinates.reduce((acc, coord) => {
        return acc.extend(coord);
      }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

      map.current.fitBounds(bounds, {
        padding: { top: 70, bottom: 70, left: 70, right: 70 },
        maxZoom: 15,
        duration: 1100
      });
    } catch (err) {
      console.warn('fitBounds error:', err);
    }
  }, []);

  // Configure road-snapped GeoJSON sources & layers (direct and scenic routes)
  const loadRouteLayers = useCallback((scenicData, directData) => {
    if (!map.current) return;

    const emptyGeoJson = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [] }
    };

    // 1. Direct Route Source & Dashed Layer
    const directPayload = directData || emptyGeoJson;
    if (!map.current.getSource('direct-route')) {
      map.current.addSource('direct-route', {
        type: 'geojson',
        data: directPayload
      });
    } else {
      map.current.getSource('direct-route').setData(directPayload);
    }

    if (!map.current.getLayer('direct-route-line')) {
      map.current.addLayer({
        id: 'direct-route-line',
        type: 'line',
        source: 'direct-route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#64748b',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.75
        }
      });
    }

    // 2. Scenic Route Source & Vibrant Glow Layers
    const scenicPayload = scenicData || emptyGeoJson;
    if (!map.current.getSource('scenic-route')) {
      map.current.addSource('scenic-route', {
        type: 'geojson',
        data: scenicPayload
      });
    } else {
      map.current.getSource('scenic-route').setData(scenicPayload);
    }

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
          'line-color': '#059669',
          'line-width': 10,
          'line-opacity': 0.3
        }
      });
    }

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
          'line-color': '#10b981',
          'line-width': 5,
          'line-opacity': 0.95
        }
      });
    }
  }, []);

  // Sync Markers on Mapbox (Start, Destination, Scenic Stops, Custom Waypoints)
  const syncMarkers = useCallback(() => {
    if (!map.current) return;

    // Remove existing markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const allBoundingCoords = [];

    // 1. Start Marker (Green)
    if (startLocation && (startLocation.lat || startLocation.latitude)) {
      const lat = Number(startLocation.lat ?? startLocation.latitude);
      const lon = Number(startLocation.lon ?? startLocation.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const el = document.createElement('div');
        el.className = 'custom-mapbox-marker marker-start';
        el.innerHTML = '<span class="marker-symbol">A</span>';

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="marker-popup-content">
            <span class="popup-tag origin-tag">Origin</span>
            <h4 class="popup-title">${startLocation.name || 'Starting Point'}</h4>
            ${startLocation.display_name ? `<p class="popup-sub">${startLocation.display_name}</p>` : ''}
          </div>
        `);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(map.current);

        markersRef.current.push(marker);
        allBoundingCoords.push([lon, lat]);
      }
    }

    // 2. Destination Marker (Red)
    if (destination && (destination.lat || destination.latitude)) {
      const lat = Number(destination.lat ?? destination.latitude);
      const lon = Number(destination.lon ?? destination.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const el = document.createElement('div');
        el.className = 'custom-mapbox-marker marker-dest';
        el.innerHTML = '<span class="marker-symbol">B</span>';

        const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(`
          <div class="marker-popup-content">
            <span class="popup-tag dest-tag">Destination</span>
            <h4 class="popup-title">${destination.name || 'Destination'}</h4>
            ${destination.display_name ? `<p class="popup-sub">${destination.display_name}</p>` : ''}
          </div>
        `);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([lon, lat])
          .setPopup(popup)
          .addTo(map.current);

        markersRef.current.push(marker);
        allBoundingCoords.push([lon, lat]);
      }
    }

    // 3. Scenic Stops Markers (Amber/Slate with Toggle Action in Popup)
    scenicStops.forEach((stop, index) => {
      const lat = Number(stop.lat);
      const lon = Number(stop.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const isIncluded = stop.is_included !== false;
      const el = document.createElement('div');
      el.className = `custom-mapbox-marker marker-scenic-stop ${isIncluded ? 'is-included' : 'is-excluded'}`;
      el.innerHTML = `<span class="marker-symbol">${index + 1}</span>`;

      const popupNode = document.createElement('div');
      popupNode.className = 'marker-popup-content';
      popupNode.innerHTML = `
        <span class="popup-tag stop-tag">Stop #${index + 1} · ${stop.category || 'Scenic Vista'}</span>
        <h4 class="popup-title">${stop.name}</h4>
        <p class="popup-desc">${stop.description || ''}</p>
        <div class="popup-meta">
          <span>+${stop.detour_min || 15} min detour</span>
          <span>Score: ${stop.scenic_score || 4.5}</span>
        </div>
        <button type="button" class="popup-action-btn ${isIncluded ? 'btn-remove-stop' : 'btn-add-stop'}">
          ${isIncluded ? 'Remove from Route' : '+ Include in Route'}
        </button>
      `;

      const actionBtn = popupNode.querySelector('.popup-action-btn');
      if (actionBtn && onToggleStop) {
        actionBtn.addEventListener('click', () => {
          onToggleStop(stop.id);
        });
      }

      const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupNode);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map.current);

      markersRef.current.push(marker);
      allBoundingCoords.push([lon, lat]);
    });

    // 4. Custom Waypoints Markers (Added from Nearby Places)
    customWaypoints.forEach((wp) => {
      if (!wp.coordinates || wp.coordinates.length !== 2) return;
      const [lon, lat] = wp.coordinates;

      const el = document.createElement('div');
      el.className = 'custom-mapbox-marker marker-custom-waypoint';
      el.innerHTML = '<span class="marker-symbol">★</span>';

      const popupNode = document.createElement('div');
      popupNode.className = 'marker-popup-content';
      popupNode.innerHTML = `
        <span class="popup-tag waypoint-tag">Custom Waypoint</span>
        <h4 class="popup-title">${wp.name}</h4>
        ${wp.address ? `<p class="popup-sub">${wp.address}</p>` : ''}
        <button type="button" class="popup-action-btn btn-remove-stop">
          Remove from Trip
        </button>
      `;

      const removeBtn = popupNode.querySelector('.popup-action-btn');
      if (removeBtn && onRemoveWaypoint) {
        removeBtn.addEventListener('click', () => {
          onRemoveWaypoint(wp.id);
        });
      }

      const popup = new mapboxgl.Popup({ offset: 25 }).setDOMContent(popupNode);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lon, lat])
        .setPopup(popup)
        .addTo(map.current);

      markersRef.current.push(marker);
      allBoundingCoords.push([lon, lat]);
    });

    // Fit map bounds to coordinates if route coordinates are also available
    if (routeGeoJson?.geometry?.coordinates?.length) {
      fitMapToBounds([...routeGeoJson.geometry.coordinates, ...allBoundingCoords]);
    } else if (allBoundingCoords.length > 0) {
      fitMapToBounds(allBoundingCoords);
    }
  }, [
    startLocation,
    destination,
    scenicStops,
    customWaypoints,
    routeGeoJson,
    onToggleStop,
    onRemoveWaypoint,
    fitMapToBounds
  ]);

  // Initialize Mapbox Canvas
  useEffect(() => {
    if (!MAPBOX_TOKEN || map.current) return;

    const initialCenter = sharedLocation || DEFAULT_CENTER;
    const initialZoom = sharedLocation ? 12 : DEFAULT_ZOOM;

    const mapInstance = new mapboxgl.Map({
      container: mapContainer.current,
      style: currentStyle,
      center: initialCenter,
      zoom: initialZoom,
      pitch: 0,
      bearing: 0,
      antialias: true
    });

    map.current = mapInstance;

    // Navigation Controls (Zoom / Pitch / Compass)
    mapInstance.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Live Device Geolocation Control
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
      showUserLocation: true
    });

    geolocateCtrlRef.current = geolocate;
    mapInstance.addControl(geolocate, 'top-right');

    mapInstance.on('pitch', () => {
      setIs3D(mapInstance.getPitch() > 25);
    });

    mapInstance.on('load', () => {
      loadRouteLayers(routeGeoJson, directRouteGeoJson);
      syncMarkers();
    });

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []); // Run once on mount

  // If user grants device location permission and no route exists yet, center on real device location
  useEffect(() => {
    if (sharedLocation && map.current && !hasCenteredOnUserRef.current && !routeGeoJson) {
      hasCenteredOnUserRef.current = true;
      map.current.flyTo({ center: sharedLocation, zoom: 13, duration: 1200 });
    }
  }, [sharedLocation, routeGeoJson]);

  // Synchronize map style with site theme (Day vs Night) unless explicitly in Satellite mode
  useEffect(() => {
    if (!map.current) return;
    const targetStyle =
      theme === 'dark'
        ? 'mapbox://styles/mapbox/navigation-night-v1'
        : 'mapbox://styles/mapbox/navigation-day-v1';

    if (currentStyleRef.current !== targetStyle && currentStyleRef.current !== 'mapbox://styles/mapbox/satellite-streets-v12') {
      currentStyleRef.current = targetStyle;
      map.current.setStyle(targetStyle);
      map.current.once('style.load', () => {
        loadRouteLayers(routeGeoJson, directRouteGeoJson);
        syncMarkers();
      });
      setTimeout(() => setCurrentStyle(targetStyle), 0);
    }
  }, [theme, routeGeoJson, directRouteGeoJson, loadRouteLayers, syncMarkers]);

  // Handle focusing on a selected stop or nearby place
  useEffect(() => {
    if (!focusedLocation || !map.current) return;
    const lon = Number(focusedLocation.lon ?? focusedLocation.lng ?? focusedLocation.longitude);
    const lat = Number(focusedLocation.lat ?? focusedLocation.latitude);
    const name = focusedLocation.name || 'Selected Place';

    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      map.current.flyTo({
        center: [lon, lat],
        zoom: 15,
        duration: 1200,
        essential: true,
      });

      new mapboxgl.Popup({ offset: 25, closeButton: true })
        .setLngLat([lon, lat])
        .setHTML(`
          <div class="marker-popup-content focused-popup">
            <span class="popup-tag stop-tag">Selected Place</span>
            <h4 class="popup-title">${name}</h4>
          </div>
        `)
        .addTo(map.current);

      setTimeout(() => {
        showToast(`Focused on ${name}`, 'info');
      }, 0);
    }
  }, [focusedLocation, showToast]);

  // Sync route layers when routeGeoJson or directRouteGeoJson updates
  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
      loadRouteLayers(routeGeoJson, directRouteGeoJson);
      syncMarkers();
    }
  }, [routeGeoJson, directRouteGeoJson, loadRouteLayers, syncMarkers]);

  // Handle dynamic map style switching (Day, Night, Satellite)
  const handleSwitchStyle = (styleUrl) => {
    if (styleUrl === currentStyle || !map.current) return;
    currentStyleRef.current = styleUrl;
    setCurrentStyle(styleUrl);
    setCurrentStyle(styleUrl);

    map.current.setStyle(styleUrl);
    map.current.once('style.load', () => {
      loadRouteLayers(routeGeoJson, directRouteGeoJson);
      syncMarkers();
    });
  };

  // Recenter to live GPS location
  const handleRecenterLocation = () => {
    if (sharedLocation && map.current) {
      map.current.flyTo({ center: sharedLocation, zoom: 15, duration: 900 });
      showToast('Centered on your live location', 'info');
    } else if (geolocateCtrlRef.current) {
      try {
        geolocateCtrlRef.current.trigger();
        showToast('Requesting GPS location...', 'info');
      } catch {
        showToast('Current GPS location is unavailable.', 'warning');
      }
    } else {
      showToast('Current GPS location is unavailable.', 'warning');
    }
  };

  // Recenter Route Handler
  const handleRecenterRoute = () => {
    if (routeGeoJson?.geometry?.coordinates?.length) {
      fitMapToBounds(routeGeoJson.geometry.coordinates);
      showToast('View fitted to active scenic route', 'info');
    } else {
      showToast('No active route to recenter.', 'info');
    }
  };

  // Toggle 3D Pitch Handler
  const handleTogglePitch = () => {
    if (!map.current) return;

    if (is3D) {
      map.current.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      setIs3D(false);
    } else {
      map.current.easeTo({ pitch: 58, bearing: -15, duration: 600 });
      setIs3D(true);
    }
  };

  const hasActiveRoute = Boolean(routeGeoJson?.geometry?.coordinates?.length);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="roamify-map-wrapper">
        <div className="roamify-token-alert">
          <h3>Mapbox Configuration Required</h3>
          <p>Configure your Mapbox public token in <code>frontend/.env</code> to load map tiles:</p>
          <code>VITE_MAPBOX_TOKEN=your_mapbox_token_here</code>
        </div>
      </div>
    );
  }

  return (
    <div className="roamify-map-wrapper">
      {/* Mapbox Canvas Container */}
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

      {/* Map Legend Overlay (when route is active) */}
      {hasActiveRoute && (
        <div className="mapbox-legend-bar" aria-label="Route Map Legend">
          <div className="legend-entry">
            <span className="legend-swatch scenic-swatch" />
            <span>Scenic Detour</span>
          </div>
          {directRouteGeoJson && (
            <div className="legend-entry">
              <span className="legend-swatch direct-swatch" />
              <span>Direct Route</span>
            </div>
          )}
          <div className="legend-entry">
            <span className="legend-dot scenic-dot" />
            <span>Scenic Stops</span>
          </div>
          {customWaypoints.length > 0 && (
            <div className="legend-entry">
              <span className="legend-dot waypoint-dot" />
              <span>Waypoints</span>
            </div>
          )}
        </div>
      )}

      {/* Floating Canvas Controls Overlay (Bottom-Right) */}
      <div className="roamify-floating-controls">
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
            <span>Fit Route</span>
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

        {/* Map Style Switcher Widget */}
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
