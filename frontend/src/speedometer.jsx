import { GaugeIcon } from "./components/Icons";

/**
 * Speedometer Component
 * Displays live vehicle / device telemetry (speed in km/h, GPS lock status).
 * Can receive telemetry via props (shared location) or run standalone.
 */
function Speedometer({ speed, status, isLive }) {
  const displaySpeed = speed !== null && speed !== undefined ? speed : "--";
  const displayStatus = status || "Waiting for GPS lock";
  const hasLiveSignal = Boolean(isLive);

  return (
    <aside className="speedometer-hud" aria-label="Live Speedometer Telemetry">
      <div className="speedometer-top">
        <div className="speedometer-title-group">
          <GaugeIcon size={12} className="speedometer-svg" />
          <span className="speedometer-label">TELEMETRY</span>
        </div>
        <div
          className={`speedometer-dot ${hasLiveSignal ? "dot-active" : "dot-idle"}`}
          title={displayStatus}
          aria-hidden="true"
        />
      </div>

      <div className="speedometer-value-row">
        <span className="speedometer-value">{displaySpeed}</span>
        <span className="speedometer-unit">km/h</span>
      </div>

      <div className="speedometer-footer" title={displayStatus}>
        <span className="speedometer-status-text">{displayStatus}</span>
      </div>
    </aside>
  );
}

export default Speedometer;
