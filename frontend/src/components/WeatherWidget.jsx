import { useState, useEffect, useCallback } from "react";
import {
  CloudIcon,
  CloudRainIcon,
  SunIcon,
  WindIcon,
  DropletsIcon,
  ThermometerIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from "./Icons";
import { fetchRouteWeather, fetchWeatherForecast } from "../services/api";

export default function WeatherWidget({
  origin,
  destination,
  scenicStops = [],
  customWaypoints = [],
}) {
  const [routeWeather, setRouteWeather] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState(0);

  const loadWeather = useCallback(async () => {
    if (!origin && !destination) return;
    setLoading(true);
    setError(null);

    try {
      const points = [];
      if (origin) {
        points.push({
          name: origin.name || "Origin",
          lat: origin.lat,
          lon: origin.lon,
          role: "origin",
        });
      }

      // Add active scenic stops
      scenicStops
        .filter((s) => s.is_included !== false && s.lat && s.lon)
        .forEach((s) => {
          points.push({
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            role: "scenic-stop",
          });
        });

      // Add custom waypoints
      customWaypoints.forEach((wp) => {
        if (wp.coordinates) {
          points.push({
            name: wp.name,
            lat: wp.coordinates[1],
            lon: wp.coordinates[0],
            role: "waypoint",
          });
        }
      });

      if (destination) {
        points.push({
          name: destination.name || "Destination",
          lat: destination.lat,
          lon: destination.lon,
          role: "destination",
        });
      }

      if (points.length === 0) return;

      // 1. Fetch real route weather for all points
      const weatherData = await fetchRouteWeather(points);
      setRouteWeather(weatherData);

      // 2. Fetch destination 5-day forecast
      const targetForForecast = destination || origin;
      if (targetForForecast) {
        try {
          const fc = await fetchWeatherForecast({
            lat: targetForForecast.lat,
            lon: targetForForecast.lon,
            city: targetForForecast.name,
          });
          setForecast(fc);
        } catch (fcErr) {
          console.warn("Forecast fetch notice:", fcErr);
        }
      }
    } catch (err) {
      console.error("Failed to load route weather:", err);
      setError(err.message || "Failed to load live weather observations.");
    } finally {
      setLoading(false);
    }
  }, [origin, destination, scenicStops, customWaypoints]);

  useEffect(() => {
    let ignore = false;
    const timer = setTimeout(() => {
      if (!ignore) {
        loadWeather();
      }
    }, 0);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [loadWeather]);

  if (!origin && !destination) {
    return null;
  }

  const activeWeather = routeWeather[selectedPointIndex] || routeWeather[0];

  return (
    <section className="corridor-weather-card" aria-label="Route Weather Conditions">
      <div className="weather-card-header">
        <div className="weather-header-title-wrap">
          <div className="weather-badge-icon" aria-hidden="true">
            <CloudIcon size={18} />
          </div>
          <div>
            <span className="weather-eyebrow">METEOROLOGICAL TELEMETRY</span>
            <h3 className="weather-title">Corridor & Route Weather Outlook</h3>
          </div>
        </div>

        <button
          type="button"
          className="btn-weather-refresh"
          onClick={loadWeather}
          disabled={loading}
          title="Refresh real-time weather from OpenWeatherMap"
          aria-label="Refresh weather data"
        >
          <RefreshCwIcon size={14} className={loading ? "spin-icon" : ""} />
          <span>{loading ? "Updating..." : "Live Sync"}</span>
        </button>
      </div>

      {error ? (
        <div className="weather-alert-banner">
          <AlertTriangleIcon size={16} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Points Navigator Tabs */}
      {routeWeather.length > 0 && (
        <div className="weather-points-tabs" role="tablist">
          {routeWeather.map((pt, idx) => {
            const isSelected = idx === selectedPointIndex;
            return (
              <button
                key={`${pt.point_name}-${idx}`}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`weather-point-tab ${isSelected ? "is-active" : ""}`}
                onClick={() => setSelectedPointIndex(idx)}
              >
                <span className={`point-role-tag ${pt.role || "stop"}`}>
                  {pt.role === "origin"
                    ? "Departure"
                    : pt.role === "destination"
                    ? "Arrival"
                    : "Waypoint"}
                </span>
                <span className="point-tab-name">{pt.point_name}</span>
                {pt.temperature_c !== null && pt.temperature_c !== undefined && (
                  <span className="point-tab-temp">{Math.round(pt.temperature_c)}°C</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active Point Weather Highlight */}
      {activeWeather && !activeWeather.error ? (
        <div className="weather-active-pane">
          <div className="weather-active-main">
            <div className="weather-active-primary">
              {activeWeather.icon_url ? (
                <img
                  src={activeWeather.icon_url}
                  alt={activeWeather.condition}
                  className="weather-live-icon-img"
                />
              ) : (
                <SunIcon size={44} className="weather-fallback-icon" />
              )}
              <div className="weather-temp-block">
                <span className="weather-current-temp">
                  {Math.round(activeWeather.temperature_c)}°C
                </span>
                <span className="weather-condition-label">{activeWeather.condition}</span>
                <span className="weather-feels-like">
                  Feels like {Math.round(activeWeather.feels_like_c)}°C · {activeWeather.city}
                  {activeWeather.country ? `, ${activeWeather.country}` : ""}
                </span>
              </div>
            </div>

            {/* Weather Metrics Grid */}
            <div className="weather-metrics-grid">
              <div className="weather-metric-cell">
                <WindIcon size={14} className="metric-icon" />
                <span className="metric-label">Wind</span>
                <strong className="metric-value">{activeWeather.wind_speed_kmh} km/h</strong>
              </div>
              <div className="weather-metric-cell">
                <DropletsIcon size={14} className="metric-icon" />
                <span className="metric-label">Humidity</span>
                <strong className="metric-value">{activeWeather.humidity_percent}%</strong>
              </div>
              <div className="weather-metric-cell">
                <ThermometerIcon size={14} className="metric-icon" />
                <span className="metric-label">Min / Max</span>
                <strong className="metric-value">
                  {Math.round(activeWeather.temp_min_c)}° / {Math.round(activeWeather.temp_max_c)}°
                </strong>
              </div>
              <div className="weather-metric-cell">
                <CloudRainIcon size={14} className="metric-icon" />
                <span className="metric-label">Precipitation</span>
                <strong className="metric-value">
                  {activeWeather.precipitation_mm !== null &&
                  activeWeather.precipitation_mm !== undefined
                    ? `${activeWeather.precipitation_mm} mm`
                    : "0.0 mm"}
                </strong>
              </div>
            </div>
          </div>

          {/* Real Travel Advisory from OpenWeatherMap */}
          {activeWeather.travel_advisory && (
            <div className="weather-travel-advisory-box">
              <span className="advisory-label">Road Advisory:</span>
              <p className="advisory-text">{activeWeather.travel_advisory}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="weather-loading-state">
          {loading ? (
            <div className="weather-loading-indicator">
              <span className="btn-spinner" />
              <span>Fetching live observations from OpenWeatherMap...</span>
            </div>
          ) : (
            <p className="weather-unavailable-msg">
              Weather observation currently unavailable for this corridor coordinate.
            </p>
          )}
        </div>
      )}

      {/* 5-Day Forecast Grid for Destination */}
      {forecast && forecast.forecast_available && forecast.days?.length > 0 && (
        <div className="weather-forecast-drawer">
          <div className="forecast-header">
            <span className="forecast-title">
              5-Day Outlook for {forecast.city || destination?.name || "Destination"}
            </span>
            <span className="forecast-source">OpenWeatherMap 5-Day Forecast</span>
          </div>

          <div className="forecast-days-row">
            {forecast.days.map((d) => (
              <div key={d.date} className="forecast-day-card">
                <span className="forecast-date">
                  {new Date(d.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {d.icon_url && (
                  <img
                    src={d.icon_url}
                    alt={d.condition}
                    className="forecast-mini-icon"
                    title={d.condition}
                  />
                )}
                <span className="forecast-temp-range">
                  {Math.round(d.temp_max_c)}° / {Math.round(d.temp_min_c)}°
                </span>
                <span className="forecast-cond-snippet">{d.condition}</span>
                {d.pop_percent > 0 && (
                  <span className="forecast-pop-badge" title="Precipitation probability">
                    💧 {d.pop_percent}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Provider Attribution & Disclaimer */}
      <div className="weather-footer-attribution">
        <span>Verified OpenWeatherMap Observations</span>
        <span className="attribution-sep">·</span>
        <span className="disclaimer-text">
          Weather conditions can change rapidly in mountain and coastal routes. Verify before setting out.
        </span>
      </div>
    </section>
  );
}
