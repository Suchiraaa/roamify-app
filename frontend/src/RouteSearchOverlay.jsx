import { useState, useEffect, useRef, useCallback } from 'react';

export default function RouteSearchOverlay({
  mapboxToken,
  userLocation,
  onRouteCalculated,
  onClearRoute,
  activeRouteInfo,
  onNotify
}) {
  const [startQuery, setStartQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [startCoords, setStartCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);

  const [startSuggestions, setStartSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'start' | 'dest' | null

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const overlayRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (overlayRef.current && !overlayRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch geocoding suggestions from official Mapbox Places API
  const fetchSuggestions = useCallback(async (query, type) => {
    if (!query || query.trim().length < 2 || !mapboxToken) {
      if (type === 'start') setStartSuggestions([]);
      if (type === 'dest') setDestSuggestions([]);
      return;
    }

    try {
      const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${mapboxToken}&autocomplete=true&limit=5`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Geocoding request failed');
      const data = await res.json();

      const suggestions = (data.features || []).map((feature) => ({
        id: feature.id,
        place_name: feature.place_name,
        text: feature.text,
        center: feature.center // [lng, lat]
      }));

      if (type === 'start') {
        setStartSuggestions(suggestions);
        setActiveDropdown('start');
      } else {
        setDestSuggestions(suggestions);
        setActiveDropdown('dest');
      }
    } catch (err) {
      console.warn('Geocoding lookup error:', err);
    }
  }, [mapboxToken]);

  // Handle typing in Start query
  const handleStartChange = (e) => {
    const val = e.target.value;
    setStartQuery(val);
    setStartCoords(null);
    setErrorMessage('');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(val, 'start');
    }, 300);
  };

  // Handle typing in Dest query
  const handleDestChange = (e) => {
    const val = e.target.value;
    setDestQuery(val);
    setDestCoords(null);
    setErrorMessage('');

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      fetchSuggestions(val, 'dest');
    }, 300);
  };

  const handleSelectSuggestion = (suggestion, type) => {
    if (type === 'start') {
      setStartQuery(suggestion.place_name);
      setStartCoords(suggestion.center);
      setStartSuggestions([]);
    } else {
      setDestQuery(suggestion.place_name);
      setDestCoords(suggestion.center);
      setDestSuggestions([]);
    }
    setActiveDropdown(null);
  };

  // Set start position to device live geolocation
  const handleUseCurrentLocation = () => {
    if (userLocation && userLocation.length === 2) {
      setStartCoords(userLocation);
      setStartQuery('Current Location');
      setStartSuggestions([]);
      setActiveDropdown(null);
      setErrorMessage('');
    } else {
      const msg = 'Device location is not yet available. Please grant GPS permission.';
      setErrorMessage(msg);
      if (onNotify) onNotify(msg, 'warning');
    }
  };

  // Swap start & destination
  const handleSwap = () => {
    const tempQuery = startQuery;
    const tempCoords = startCoords;
    setStartQuery(destQuery);
    setStartCoords(destCoords);
    setDestQuery(tempQuery);
    setDestCoords(tempCoords);
  };

  // Forward geocode fallback if user typed a query without picking from dropdown
  const resolveCoordinates = async (query, currentCoords) => {
    if (currentCoords) return currentCoords;
    if (!query || query.trim().length === 0) return null;

    const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query.trim())}.json?access_token=${mapboxToken}&limit=1`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Could not resolve location: "${query}"`);
    const data = await res.json();
    if (!data.features || data.features.length === 0) {
      throw new Error(`Location not found: "${query}"`);
    }
    return data.features[0].center;
  };

  // Request road-snapped route polyline via Mapbox Directions API
  const handleFetchRoute = async () => {
    if (!startQuery.trim() || !destQuery.trim()) {
      setErrorMessage('Please enter both a start location and destination.');
      return;
    }

    setErrorMessage('');
    setIsLoading(true);
    setActiveDropdown(null);

    try {
      const fromCoords = await resolveCoordinates(startQuery, startCoords);
      const toCoords = await resolveCoordinates(destQuery, destCoords);

      if (!fromCoords || !toCoords) {
        throw new Error('Please specify valid Start and Destination points.');
      }

      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fromCoords[0]},${fromCoords[1]};${toCoords[0]},${toCoords[1]}?geometries=geojson&overview=full&steps=true&access_token=${mapboxToken}`;
      const response = await fetch(url);
      const json = await response.json();

      if (!response.ok || !json.routes || json.routes.length === 0) {
        throw new Error(json.message || 'No drivable route found between these locations.');
      }

      const route = json.routes[0];
      const routeFeature = {
        type: 'Feature',
        properties: {
          distance: route.distance, // meters
          duration: route.duration, // seconds
          summary: route.legs?.[0]?.summary || ''
        },
        geometry: route.geometry
      };

      onRouteCalculated(routeFeature, {
        distanceKm: (route.distance / 1000).toFixed(1),
        durationMin: Math.round(route.duration / 60),
        summary: route.legs?.[0]?.summary || ''
      });
    } catch (err) {
      console.error('Route calculation error:', err);
      setErrorMessage(err.message || 'Failed to fetch road-snapped route.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setStartQuery('');
    setDestQuery('');
    setStartCoords(null);
    setDestCoords(null);
    setErrorMessage('');
    setActiveDropdown(null);
    onClearRoute();
  };

  const formatDuration = (totalMinutes) => {
    if (!totalMinutes) return '0 min';
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours === 0) return `${mins} min`;
    return `${hours} hr ${mins} min`;
  };

  return (
    <div className="roamify-search-overlay" ref={overlayRef}>
      {/* Overlay Header */}
      <div className="roamify-overlay-header">
        <div className="roamify-brand-badge">
          <svg className="roamify-header-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A2 2 0 012.5 15.485V4.515a2 2 0 011.053-1.791L9 0l6 3 5.447-2.724A2 2 0 0121.5 2.015v10.97a2 2 0 01-1.053 1.791L15 17l-6-3z" />
          </svg>
          <span>Route Search</span>
        </div>
        {activeRouteInfo && (
          <button
            type="button"
            className="roamify-text-btn"
            onClick={handleClear}
            title="Clear current route"
          >
            Clear Route
          </button>
        )}
      </div>

      {/* Input Group with Route Line Connector */}
      <div className="roamify-search-inputs-container">
        {/* Visual route connector dots */}
        <div className="roamify-route-indicator" aria-hidden="true">
          <span className="roamify-dot roamify-dot-start"></span>
          <span className="roamify-dot-line"></span>
          <span className="roamify-dot roamify-dot-dest"></span>
        </div>

        <div className="roamify-inputs-wrapper">
          {/* Start Location Input */}
          <div className="roamify-input-wrapper">
            <input
              type="text"
              className="roamify-input-field"
              placeholder="Start location (or use GPS)..."
              value={startQuery}
              onChange={handleStartChange}
              onFocus={() => {
                if (startSuggestions.length > 0) setActiveDropdown('start');
              }}
              aria-label="Start location"
            />
            <div className="roamify-input-actions">
              {startQuery && (
                <button
                  type="button"
                  className="roamify-input-icon-btn"
                  title="Clear start location"
                  onClick={() => {
                    setStartQuery('');
                    setStartCoords(null);
                  }}
                  aria-label="Clear start location"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                className={`roamify-input-icon-btn ${userLocation ? 'active' : ''}`}
                title="Use current GPS location"
                onClick={handleUseCurrentLocation}
                aria-label="Use current location"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                </svg>
              </button>
            </div>

            {activeDropdown === 'start' && startSuggestions.length > 0 && (
              <div className="roamify-suggestions-dropdown">
                {startSuggestions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="roamify-suggestion-item"
                    onClick={() => handleSelectSuggestion(item, 'start')}
                  >
                    <span className="roamify-sugg-icon">📍</span>
                    <span className="roamify-sugg-text">{item.place_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Destination Location Input */}
          <div className="roamify-input-wrapper">
            <input
              type="text"
              className="roamify-input-field"
              placeholder="Enter destination..."
              value={destQuery}
              onChange={handleDestChange}
              onFocus={() => {
                if (destSuggestions.length > 0) setActiveDropdown('dest');
              }}
              aria-label="Destination"
            />
            <div className="roamify-input-actions">
              {destQuery && (
                <button
                  type="button"
                  className="roamify-input-icon-btn"
                  title="Clear destination"
                  onClick={() => {
                    setDestQuery('');
                    setDestCoords(null);
                  }}
                  aria-label="Clear destination"
                >
                  ✕
                </button>
              )}
            </div>

            {activeDropdown === 'dest' && destSuggestions.length > 0 && (
              <div className="roamify-suggestions-dropdown">
                {destSuggestions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className="roamify-suggestion-item"
                    onClick={() => handleSelectSuggestion(item, 'dest')}
                  >
                    <span className="roamify-sugg-icon">🏁</span>
                    <span className="roamify-sugg-text">{item.place_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Swap Button */}
        <button
          type="button"
          className="roamify-swap-btn"
          title="Swap Start and Destination"
          onClick={handleSwap}
          aria-label="Swap locations"
        >
          ⇅
        </button>
      </div>

      {/* Action Row */}
      <div className="roamify-action-row">
        <button
          type="button"
          className="roamify-btn-primary"
          disabled={isLoading || (!startQuery.trim()) || (!destQuery.trim())}
          onClick={handleFetchRoute}
        >
          {isLoading ? (
            <>
              <span className="roamify-spinner" aria-hidden="true"></span>
              <span>Finding Route...</span>
            </>
          ) : (
            'Find Route'
          )}
        </button>
        <button
          type="button"
          className="roamify-btn-secondary"
          onClick={handleClear}
          title="Reset search inputs and clear route"
        >
          Reset
        </button>
      </div>

      {/* Error message banner */}
      {errorMessage && (
        <div className="roamify-error-banner" role="alert">
          <span className="roamify-error-icon">⚠️</span>
          <span className="roamify-error-text">{errorMessage}</span>
          <button
            type="button"
            className="roamify-dismiss-btn"
            onClick={() => setErrorMessage('')}
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Route Metrics Card */}
      {activeRouteInfo && (
        <div className="roamify-route-card">
          <div className="roamify-route-stats">
            <div className="roamify-stat-item">
              <span className="roamify-stat-value">{formatDuration(activeRouteInfo.durationMin)}</span>
              <span className="roamify-stat-label">Estimated Drive</span>
            </div>
            <div className="roamify-stat-item" style={{ textAlign: 'right' }}>
              <span className="roamify-stat-value">{activeRouteInfo.distanceKm} km</span>
              <span className="roamify-stat-label">Distance</span>
            </div>
          </div>
          {activeRouteInfo.summary && (
            <div className="roamify-route-summary">
              via {activeRouteInfo.summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
