import { useState } from 'react';
import Map from './Map';

export default function App() {
  const [routeGeoJson, setRouteGeoJson] = useState(null);

  // Production Handler: Updates the active map route when backend API payloads arrive
  const handleRouteUpdate = (newRouteData) => {
    setRouteGeoJson(newRouteData);
  };

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, overflow: 'hidden', position: 'relative' }}>
      <Map routeGeoJson={routeGeoJson} onRouteUpdate={handleRouteUpdate} />
    </div>
  );
}