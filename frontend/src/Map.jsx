import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export default function Map({ routeGeoJson }) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [currentStyle, setCurrentStyle] = useState('mapbox://styles/mapbox/navigation-day-v1');

  const styles = [
    { label: 'Day', url: 'mapbox://styles/mapbox/navigation-day-v1' },
    { label: 'Night', url: 'mapbox://styles/mapbox/navigation-night-v1' },
    { label: 'Satellite', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
  ];

  const fitMapToBounds = (coordinates) => {
    if (!map.current || !coordinates || coordinates.length === 0) return;

    const bounds = coordinates.reduce((acc, coord) => {
      return acc.extend(coord);
    }, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

    map.current.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: 14,
      duration: 1500
    });
  };

  const fetchRoadSnappedRoute = async () => {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/77.5946,12.9716;76.6394,12.2958?geometries=geojson&access_token=${mapboxgl.accessToken}`;
    
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (json.routes && json.routes[0]) {
        const routeData = {
          type: 'Feature',
          properties: {},
          geometry: json.routes[0].geometry
        };
        
        if (map.current && map.current.getSource('scenic-route')) {
          map.current.getSource('scenic-route').setData(routeData);
          fitMapToBounds(routeData.geometry.coordinates);
        }
      }
    } catch (err) {
      console.error("Failed to fetch road snapped route:", err);
    }
  };

  const loadLayers = () => {
    if (!map.current.getSource('scenic-route')) {
      map.current.addSource('scenic-route', {
        type: 'geojson',
        data: routeGeoJson || { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
      });
    }

    if (!map.current.getLayer('route-glow')) {
      map.current.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'scenic-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#2563eb',
          'line-width': 10,
          'line-opacity': 0.4
        }
      });
    }

    if (!map.current.getLayer('route-line')) {
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'scenic-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#0070f3',
          'line-width': 5
        }
      });
    }
  };

  useEffect(() => {
    if (map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: currentStyle,
      center: [77.5946, 12.9716],
      zoom: 9,
      pitch: 45
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      loadLayers();
      if (routeGeoJson) {
        fitMapToBounds(routeGeoJson.geometry.coordinates);
      } else {
        fetchRoadSnappedRoute();
      }
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle style switching dynamically
  const switchStyle = (styleUrl) => {
    setCurrentStyle(styleUrl);
    if (map.current) {
      map.current.setStyle(styleUrl);
      map.current.once('style.load', () => {
        loadLayers();
        if (!routeGeoJson) {
          fetchRoadSnappedRoute();
        }
      });
    }
  };

  useEffect(() => {
    if (map.current && map.current.getSource('scenic-route') && routeGeoJson) {
      map.current.getSource('scenic-route').setData(routeGeoJson);
      if (routeGeoJson.geometry && routeGeoJson.geometry.coordinates) {
        fitMapToBounds(routeGeoJson.geometry.coordinates);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeGeoJson]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      {/* Mapbox Container */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Member 1 Map Controls Overlay */}
      <div style={{
        position: 'absolute',
        bottom: '30px',
        right: '20px',
        display: 'flex',
        gap: '8px',
        background: 'rgba(255, 255, 255, 0.9)',
        padding: '8px 12px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 10
      }}>
        {styles.map((style) => (
          <button
            key={style.label}
            onClick={() => switchStyle(style.url)}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              background: currentStyle === style.url ? '#0070f3' : '#e5e7eb',
              color: currentStyle === style.url ? '#ffffff' : '#374151'
            }}
          >
            {style.label}
          </button>
        ))}
      </div>
    </div>
  );
}