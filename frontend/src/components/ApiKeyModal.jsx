import { useState } from "react";

export default function ApiKeyModal({
  isOpen,
  onClose,
  apiKey,
  onSaveKey,
  backendStatus,
}) {
  const [inputVal, setInputVal] = useState(apiKey || "");

  if (!isOpen) return null;

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>⚙️ OpenRouteServices Configuration</h3>
          <button className="modal-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="status-banner">
            <span className="status-dot online"></span>
            <div>
              <strong>Backend Status: </strong>
              <span>{backendStatus?.status === "online" ? "Online (FastAPI)" : "Offline (Local mode)"}</span>
              <p className="status-mode-detail">{backendStatus?.mode || "OpenRouteServices integration ready"}</p>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <label htmlFor="orsApiKey" className="modal-label">
              OpenRouteService API Key (Optional)
            </label>
            <p className="modal-hint">
              Get a free API key at{" "}
              <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noreferrer">
                openrouteservice.org
              </a>{" "}
              or leave blank to use the backend's configured key or free fallback routing.
            </p>

            <input
              id="orsApiKey"
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Paste your ORS API key (e.g. 5b3ce359785a...)"
              className="modal-input"
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
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
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
