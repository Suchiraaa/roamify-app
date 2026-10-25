import './App.css';

/**
 * Speedometer Component
 * Displays live vehicle / device telemetry (speed in km/h, GPS lock status).
 * Can receive telemetry via props (shared location) or run standalone.
 */
function Speedometer({ speed, status, isLive }) {
  // If no props passed, display waiting state gracefully
  const displaySpeed = speed !== null && speed !== undefined ? speed : '--';
  const displayStatus = status || 'Waiting for location';
  const hasLiveSignal = Boolean(isLive);

  return (
    <aside className="speedometer-hud" aria-label="Live Speedometer Telemetry">
      <div className="speedometer-top">
        <span className="speedometer-label">SPEED</span>
        <div className={`speedometer-dot ${hasLiveSignal ? 'dot-active' : 'dot-idle'}`} title={displayStatus} />
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
