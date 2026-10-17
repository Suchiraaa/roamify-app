import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Insert your Mapbox Public Token here
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;

export default function Map({ routeGeoJson }) {
  const mapContainer = useRef(null);
  const map = useRef(null);

  // Default initial coordinates centered on India (Bengaluru to Mysuru scenic drive)
  const defaultIndiaRoute = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.5946, 12.9716], // Bengaluru
        [77.3500, 12.7500], // Ramanagara
        [77.0381, 12.5218], // Mandya
        [76.6394, 12.2958]  // Mysuru
      ]
    }
  };

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

  useEffect(() => {
    if (map.current) return;

    // Center view directly on India
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-day-v1',
      center: [77.5946, 12.9716], // India coordinates
      zoom: 9,
      pitch: 45
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      const activeData = routeGeoJson || defaultIndiaRoute;

      map.current.addSource('scenic-route', {
        type: 'geojson',
        data: activeData
      });

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

      fitMapToBounds(activeData.geometry.coordinates);
    });

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map.current && map.current.getSource('scenic-route') && routeGeoJson) {
      map.current.getSource('scenic-route').setData(routeGeoJson);
      if (routeGeoJson.geometry && routeGeoJson.geometry.coordinates) {
        fitMapToBounds(routeGeoJson.geometry.coordinates);
      }
    }
  }, [routeGeoJson]);

  return (
    <div 
      ref={mapContainer} 
      style={{ 
        width: '100vw', 
        height: '100vh', 
        position: 'absolute', 
        top: 0, 
        left: 0 
      }} 
    />
  );
}