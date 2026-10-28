import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPinIcon,
  CrosshairIcon,
  ArrowUpDownIcon,
  ClockIcon,
  CoinsIcon,
  CarIcon,
  BikeIcon,
  FootprintsIcon,
  CompassIcon,
  TreePineIcon,
  UtensilsIcon,
  LandmarkIcon,
  MountainIcon,
  ChurchIcon,
  RouteIcon,
} from "./Icons";

const AVAILABLE_INTERESTS = [
  { id: "Nature", label: "Nature & Vistas", icon: TreePineIcon },
  { id: "Food", label: "Culinary & Flavors", icon: UtensilsIcon },
  { id: "Culture", label: "Heritage & Lore", icon: LandmarkIcon },
  { id: "Adventure", label: "Outdoors & Thrills", icon: MountainIcon },
  { id: "Places of worship", label: "Sacred & Sanctuaries", icon: ChurchIcon },
];

export default function UnifiedTripPlanner({
  startLocation,
  setStartLocation,
  destination,
  setDestination,
  budget,
  setBudget,
  interest,
  setInterest,
  interests,
  setInterests,
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

  // Ensure active interests array is safely resolved
  const activeInterests = Array.isArray(interests)
    ? interests
    : typeof interest === "string" && interest.length > 0
    ? interest.split(",").map((s) => s.trim()).filter(Boolean)
    : ["Nature"];

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
          // Fallback to coordinates
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

  // Toggle multi-interest selection
  const handleToggleInterest = (interestId) => {
    let next;
    if (activeInterests.includes(interestId)) {
      if (activeInterests.length === 1) {
        // Prevent leaving zero interests selected
        return;
      }
      next = activeInterests.filter((id) => id !== interestId);
    } else {
      next = [...activeInterests, interestId];
    }

    if (setInterests) {
      setInterests(next);
    }
    if (setInterest) {
      setInterest(next.join(", "));
    }
  };

  return (
    <div className="unified-planner-card" ref={containerRef}>
      {/* Card Header & Brand Mark */}
      <div className="planner-card-header">
        <div className="planner-header-lead">
          <div className="planner-badge">
            <CompassIcon size={13} className="planner-badge-icon" />
            <span>SCENIC ROUTE ATELIER</span>
          </div>
          <h2 className="planner-title">Curate Your Journey</h2>
          <p className="planner-desc">
            Define your journey corridor, travel tempo, and personal passions. Roamify orchestrates high-value scenic detours that respect your arrival time.
          </p>
        </div>
      </div>

      {/* Preset Trails Carousel / Quick Chips */}
      {presets.length > 0 && (
        <div className="planner-presets-row">
          <span className="presets-badge">Curated Trails</span>
          <div className="preset-scroll-container">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="preset-chip-btn"
                onClick={() => onSelectPreset(preset)}
                title={preset.description}
              >
                <RouteIcon size={13} className="preset-chip-icon" />
                <span>{preset.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={onSubmit} className="unified-planner-form">
        {/* Origin / Destination Search Row */}
        <div className="search-inputs-wrap">
          {/* Origin Input */}
          <div className="search-input-field">
            <span className="search-input-icon icon-origin" aria-hidden="true">
              A
            </span>
            <input
              type="text"
              className="planner-text-input"
              value={startLocation}
              onChange={handleStartChange}
              onFocus={() => {
                if (startSuggestions.length > 0) setActiveDropdown("start");
              }}
              placeholder="Departure city, landmark or address..."
              required
              aria-label="Starting location"
            />
            {userLocation && (
              <button
                type="button"
                className="btn-my-location"
                onClick={handleUseCurrentLocation}
                title="Use current GPS location"
                aria-label="Use current GPS location"
              >
                <CrosshairIcon size={15} />
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
                    <MapPinIcon size={14} className="suggestion-icon" />
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
            title="Swap departure and destination"
            aria-label="Swap starting point and destination"
          >
            <ArrowUpDownIcon size={16} />
          </button>

          {/* Destination Input */}
          <div className="search-input-field">
            <span className="search-input-icon icon-dest" aria-hidden="true">
              B
            </span>
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
                    <MapPinIcon size={14} className="suggestion-icon" />
                    <span className="suggestion-text">{item.place_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Multi-Select Interests Selector */}
        <div className="interests-selector-section">
          <div className="interests-header-row">
            <label className="section-mini-label">
              <span>EXPLORATION INTERESTS</span>
              <span className="selection-count-pill">
                {activeInterests.length} selected
              </span>
            </label>
            <span className="interests-hint">Select one or multiple categories to blend into your route</span>
          </div>

          <div className="interests-chip-grid" role="group" aria-label="Exploration interests">
            {AVAILABLE_INTERESTS.map(({ id, label, icon: IconComponent }) => {
              const isSelected = activeInterests.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`interest-toggle-chip ${isSelected ? "is-selected" : ""}`}
                  onClick={() => handleToggleInterest(id)}
                  aria-pressed={isSelected}
                  title={`Toggle ${label}`}
                >
                  <IconComponent size={16} className="interest-chip-icon" />
                  <span className="interest-chip-label">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Travel Parameters Bar (Detour Time, Budget, Profile, Submit) */}
        <div className="preferences-bar">
          <div className="pref-selector">
            <label htmlFor="pref-duration">
              <ClockIcon size={13} className="pref-label-icon" />
              <span>Detour Window</span>
            </label>
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
            <label htmlFor="pref-budget">
              <CoinsIcon size={13} className="pref-label-icon" />
              <span>Budget Tier</span>
            </label>
            <select
              id="pref-budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="pref-select"
            >
              <option value="Budget-friendly">Budget-friendly</option>
              <option value="Moderate">Moderate</option>
              <option value="Premium">Premium Experience</option>
            </select>
          </div>

          <div className="pref-selector">
            <label htmlFor="pref-profile">
              {profile === "driving-car" ? (
                <CarIcon size={13} className="pref-label-icon" />
              ) : profile === "cycling-regular" ? (
                <BikeIcon size={13} className="pref-label-icon" />
              ) : (
                <FootprintsIcon size={13} className="pref-label-icon" />
              )}
              <span>Travel Mode</span>
            </label>
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
                  <span className="btn-spinner" />
                  <span>Computing Scenic Detours...</span>
                </>
              ) : (
                <>
                  <RouteIcon size={16} />
                  <span>Curate Scenic Route</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
