import { useState } from "react";
import { SettingsIcon, XIcon, ShieldCheckIcon, SparklesIcon, CloudIcon } from "./Icons";

export default function ApiKeyModal({
  isOpen,
  onClose,
  apiKey,
  onSaveKey,
  backendStatus,
}) {
  const [inputVal, setInputVal] = useState(apiKey || "");

  if (!isOpen) return null;

  const backendKeyConfigured = backendStatus?.ors_api_key_configured === true;
  const geminiConfigured = backendStatus?.integrations?.gemini_ai_copilot?.configured === true;
  const weatherConfigured = backendStatus?.integrations?.weather_service?.configured === true;

  const handleSave = (e) => {
    e.preventDefault();
    onSaveKey(inputVal.trim());
    onClose();
  };

  const handleClear = () => {
    setInputVal("");
    onSaveKey("");
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <SettingsIcon size={18} className="modal-header-icon" />
            <h3 id="modal-title">Engine & Integrations Status</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close configuration modal">
            <XIcon size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="status-banner">
            <span className={`status-dot ${backendStatus?.status === "online" ? "online" : "offline"}`} />
            <div>
              <div className="status-row">
                <ShieldCheckIcon size={14} className="status-verified-icon" />
                <strong>Backend Engine: </strong>
                <span>{backendStatus?.status === "online" ? "Online (FastAPI)" : "Offline (Local mode)"}</span>
              </div>
              <p className="status-mode-detail">{backendStatus?.mode || "Routing engine ready"}</p>
            </div>
          </div>

          {/* Connected Integrations Grid */}
          <div className="backend-integrations-list">
            <div className="backend-integration-item">
              <div className="integration-item-left">
                <SparklesIcon size={15} className="integration-icon-gemini" />
                <div>
                  <strong>Gemini AI Co-Pilot</strong>
                  <span className="integration-item-sub">
                    {backendStatus?.integrations?.gemini_ai_copilot?.provider || "Google Gemini"}
                  </span>
                </div>
              </div>
              <span className={`integration-badge ${geminiConfigured ? "is-live" : "is-off"}`}>
                {geminiConfigured ? "✓ Active" : "Key Needed in backend/.env"}
              </span>
            </div>

            <div className="backend-integration-item">
              <div className="integration-item-left">
                <CloudIcon size={15} className="integration-icon-weather" />
                <div>
                  <strong>Weather Observations</strong>
                  <span className="integration-item-sub">
                    {backendStatus?.integrations?.weather_service?.provider || "OpenWeatherMap Live API"}
                  </span>
                </div>
              </div>
              <span className={`integration-badge ${weatherConfigured ? "is-live" : "is-off"}`}>
                {weatherConfigured ? "✓ Active" : "Key Needed in backend/.env"}
              </span>
            </div>
          </div>

          {backendKeyConfigured && (
            <div className="status-banner" style={{ borderLeft: "3px solid var(--rose-500, #C4918A)", marginTop: "12px" }}>
              <div>
                <div className="status-row">
                  <ShieldCheckIcon size={14} className="status-verified-icon" />
                  <strong>ORS API Key: </strong>
                  <span>Configured on backend</span>
                </div>
                <p className="status-mode-detail">
                  The backend already has an OpenRouteService key configured. You do not need to enter one here unless you want to override it with a custom key.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} style={{ marginTop: "16px" }}>
            <label htmlFor="orsApiKey" className="modal-label">
              {backendKeyConfigured
                ? "Custom ORS API Key (Override — Optional)"
                : "OpenRouteService API Key (Optional)"}
            </label>
            <p className="modal-hint">
              {backendKeyConfigured ? (
                <>
                  A key is already configured on the backend server. Only enter a custom key here if you want to override it.
                  The backend will fall back to OSRM routing if no valid key is available.
                </>
              ) : (
                <>
                  Get a free API key at{" "}
                  <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noreferrer">
                    openrouteservice.org
                  </a>{" "}
                  or leave blank to use the public OSRM routing fallback.
                </>
              )}
            </p>

            <input
              id="orsApiKey"
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder={backendKeyConfigured ? "Leave blank to use backend key" : "Paste ORS API key (e.g. 5b3ce359785a...)"}
              className="modal-input"
              autoComplete="off"
            />

            <div className="modal-actions">
              {apiKey && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={handleClear}
                >
                  Clear Key
                </button>
              )}
              <div className="modal-action-group">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onClose}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
