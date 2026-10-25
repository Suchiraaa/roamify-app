import { useState, useEffect, useRef, useCallback } from "react";

export default function UnifiedTripPlanner({
  startLocation,
  setStartLocation,
  destination,
  setDestination,
  budget,
  setBudget,
  interest,
  setInterest,
  duration,
  setDuration,
  profile,
  setProfile,
  onSubmit,
  loading,
  presets = [],
  onSelectPreset,
  mapboxToken,
  userLocation,
}) {
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);
  const [activeDropdown, setActiveDropdown] = useState(null); // 'start' | 'dest' | null

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setActiveDropdown(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Mapbox Geocoding Autocomplete
  const fetchSuggestions = useCallback(
    async (query, type) => {
      if (!query || query.trim().length < 2 || !mapboxToken) {
        if (type === "start") setStartSuggestions([]);
        if (type === "dest") setDestSuggestions([]);
        return;
      }

      try {
        const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          query.trim()
        )}.json?access_token=${mapboxToken}&autocomplete=true&limit=5`;
        const res = await fetch(endpoint);
        if (!res.ok) return;
        const data = await res.json();

        const suggestions = (data.features || []).map((feature) => ({
          id: feature.id,
          place_name: feature.place_name,
          center: feature.center,
        }));

        if (type === "start") {
          setStartSuggestions(suggestions);
          setActiveDropdown("start");
        } else {
          setDestSuggestions(suggestions);
          setActiveDropdown("dest");
        }
      } catch (err) {
        console.warn("Geocoding lookup error:", err);
      }
    },
    [mapboxToken]
  );

  const handleStartChange = (e) => {
    const val = e.target.value;
    setStartLocation(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => fetchSuggestions(val, "start"), 300);
  };

  const handleDestChange = (e) => {
    const val = e.target.value;
    setDestination(val);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => fetchSuggestions(val, "dest"), 300);
  };

  const handleSelectSuggestion = (suggestion, type) => {
    if (type === "start") {
      setStartLocation(suggestion.place_name);
      setStartSuggestions([]);
    } else {
      setDestination(suggestion.place_name);
      setDestSuggestions([]);
    }
    setActiveDropdown(null);
  };

  const handleUseCurrentLocation = async () => {
    if (userLocation && userLocation.length === 2) {
      const [lng, lat] = userLocation;
      // Reverse geocode to get a human-readable city/area name if token is available
      if (mapboxToken) {
        try {
          const endpoint = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&limit=1`;
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            if (data.features && data.features.length > 0) {
              setStartLocation(data.features[0].place_name);
              setActiveDropdown(null);
              return;
            }
          }
        } catch {
          // Fallback to coordinates string
        }
      }
      setStartLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      setActiveDropdown(null);
    }
  };

  const handleSwap = () => {
    const temp = startLocation;
    setStartLocation(destination);
    setDestination(temp);
  };

  return (
    <div className="unified-planner-card" ref={containerRef}>
      {/* Preset Trails Carousel / Quick Chips */}
      {presets.length > 0 && (
        <div className="planner-presets-row">
          <span className="presets-badge">Popular Trails</span>
          <div className="preset-scroll-container">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="preset-chip-btn"
                onClick={() => onSelectPreset(preset)}
                title={preset.description}
              >
                {preset.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={onSubmit} className="unified-planner-form">
        <div className="search-inputs-wrap">
          {/* Origin Input */}
          <div className="search-input-field">
            <span className="search-input-icon icon-origin" aria-hidden="true">A</span>
            <input
              type="text"
              className="planner-text-input"
              value={startLocation}
              onChange={handleStartChange}
              onFocus={() => {
                if (startSuggestions.length > 0) setActiveDropdown("start");
              }}
              placeholder="Starting point or city..."
              required
              aria-label="Starting location"
            />
            {userLocation && (
              <button
                type="button"
                className="btn-my-location"
                onClick={handleUseCurrentLocation}
                title="Use current GPS location as starting point"
                aria-label="Use current GPS location"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                </svg>
              </button>
            )}

            {/* Suggestions Dropdown */}
            {activeDropdown === "start" && startSuggestions.length > 0 && (
              <ul className="search-suggestions-menu" role="listbox">
                {startSuggestions.map((item) => (
                  <li
                    key={item.id}
                    className="suggestion-item"
                    onMouseDown={() => handleSelectSuggestion(item, "start")}
                    role="option"
                    aria-selected="false"
                  >
                    <span className="suggestion-icon">📍</span>
                    <span className="suggestion-text">{item.place_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Swap Button */}
          <button
            type="button"
            className="btn-swap-endpoints"
            onClick={handleSwap}
            title="Swap start and destination"
            aria-label="Swap starting point and destination"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Destination Input */}
          <div className="search-input-field">
            <span className="search-input-icon icon-dest" aria-hidden="true">B</span>
            <input
              type="text"
              className="planner-text-input"
              value={destination}
              onChange={handleDestChange}
              onFocus={() => {
                if (destSuggestions.length > 0) setActiveDropdown("dest");
              }}
              placeholder="Where are you heading?"
              required
              aria-label="Destination location"
            />

            {/* Suggestions Dropdown */}
            {activeDropdown === "dest" && destSuggestions.length > 0 && (
              <ul className="search-suggestions-menu" role="listbox">
                {destSuggestions.map((item) => (
                  <li
                    key={item.id}
                    className="suggestion-item"
                    onMouseDown={() => handleSelectSuggestion(item, "dest")}
                    role="option"
                    aria-selected="false"
                  >
                    <span className="suggestion-icon">📍</span>
                    <span className="suggestion-text">{item.place_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Travel Preferences Bar */}
        <div className="preferences-bar">
          <div className="pref-selector">
            <label htmlFor="pref-interest">Interest</label>
            <select
              id="pref-interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              className="pref-select"
            >
              <option value="Nature">Nature &amp; Panoramas</option>
              <option value="Food">Local Food &amp; Culinary</option>
              <option value="Culture">Heritage &amp; Culture</option>
              <option value="Adventure">Adventure &amp; Outdoors</option>
              <option value="Places of worship">Places of Worship</option>
            </select>
          </div>

          <div className="pref-selector">
            <label htmlFor="pref-duration">Detour Time</label>
            <select
              id="pref-duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="pref-select"
            >
              <option value="1 hour">1 hour detour</option>
              <option value="3 hours">3 hours detour</option>
              <option value="Half a day">Half a day (4h)</option>
              <option value="Full day">Full day (8h+)</option>
            </select>
          </div>

          <div className="pref-selector">
            <label htmlFor="pref-budget">Budget</label>
            <select
              id="pref-budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="pref-select"
            >
              <option value="Budget-friendly">Budget-friendly</option>
              <option value="Moderate">Moderate</option>
              <option value="Premium">Premium</option>
            </select>
          </div>

          <div className="pref-selector">
            <label htmlFor="pref-profile">Travel Mode</label>
            <select
              id="pref-profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="pref-select"
            >
              <option value="driving-car">Driving (Car)</option>
              <option value="cycling-regular">Cycling</option>
              <option value="foot-walking">Walking / Hiking</option>
            </select>
          </div>

          {/* Submit Action */}
          <div className="pref-submit-wrap">
            <button
              type="submit"
              className="btn-plan-scenic"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="btn-spinner" /> Finding scenic route...
                </>
              ) : (
                "Plan Scenic Route"
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
