import { ArrowUpDownIcon } from "./Icons";

export default function TripPlannerForm({
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
}) {
  const handleSwap = () => {
    const temp = startLocation;
    setStartLocation(destination);
    setDestination(temp);
  };

  return (
    <section className="planner-card">
      <div className="planner-header">
        <h2>Plan your scenic journey</h2>
        <p className="section-text">
          Enter your journey endpoints and personal travel taste to discover high-value scenic detours.
        </p>
      </div>

      {/* Preset Trips Quick Chips */}
      {presets.length > 0 && (
        <div className="presets-container">
          <span className="presets-label">Explore popular trails:</span>
          <div className="preset-chips">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="preset-chip"
                onClick={() => onSelectPreset(preset)}
              >
                {preset.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={onSubmit} className="trip-form">
        <div className="locations-group">
          <div className="input-field">
            <label htmlFor="startLocation">Where are you starting from?</label>
            <div className="input-with-icon">
              <span className="input-icon">A</span>
              <input
                id="startLocation"
                value={startLocation}
                onChange={(e) => setStartLocation(e.target.value)}
                placeholder="e.g. Bengaluru, Karnataka or City"
                required
              />
            </div>
          </div>

          <button
            type="button"
            className="swap-locations-btn"
            onClick={handleSwap}
            title="Swap start and destination"
            aria-label="Swap locations"
          >
            <ArrowUpDownIcon size={14} />
          </button>

          <div className="input-field">
            <label htmlFor="destination">Where are you heading?</label>
            <div className="input-with-icon">
              <span className="input-icon">B</span>
              <input
                id="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Mysuru, Karnataka or City"
                required
              />
            </div>
          </div>
        </div>

        <div className="preferences-grid">
          <div className="select-field">
            <label htmlFor="interest">Your main interest</label>
            <select
              id="interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
            >
              <option value="Nature">Nature & Panoramas</option>
              <option value="Food">Local Food & Culinary</option>
              <option value="Culture">Heritage & Culture</option>
              <option value="Adventure">Adventure & Outdoors</option>
              <option value="Places of worship">Places of Worship</option>
            </select>
          </div>

          <div className="select-field">
            <label htmlFor="budget">Your budget level</label>
            <select
              id="budget"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            >
              <option value="Budget-friendly">Budget-friendly</option>
              <option value="Moderate">Moderate</option>
              <option value="Premium">Premium Experience</option>
            </select>
          </div>

          <div className="select-field">
            <label htmlFor="duration">Available detour time</label>
            <select
              id="duration"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            >
              <option value="1 hour">1 hour detour</option>
              <option value="3 hours">3 hours detour</option>
              <option value="Half a day">Half a day (4 hrs)</option>
              <option value="Full day">Full day (8+ hrs)</option>
            </select>
          </div>

          <div className="select-field">
            <label htmlFor="profile">Travel Mode</label>
            <select
              id="profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
            >
              <option value="driving-car">Driving (Car)</option>
              <option value="cycling-regular">Cycling</option>
              <option value="foot-walking">Walking / Hiking</option>
            </select>
          </div>
        </div>

        <button
          className="explore-button"
          type="submit"
          disabled={loading}
        >
          {loading ? (
            <span className="spinner-text">
              <span className="spinner"></span> Routing with OpenRouteServices...
            </span>
          ) : (
            "Find Scenic Routes & Detours"
          )}
        </button>
      </form>
    </section>
  );
}
