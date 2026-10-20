import { useEffect, useRef } from "react";

export default function RouteMap({
  startLocation,
  destination,
  directRoute,
  scenicRoute,
  scenicStops = [],
  onToggleStop,
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layersGroupRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current || !window.L) return;

    // Initialize Leaflet map instance once
    if (!mapInstanceRef.current) {
      const map = window.L.map(mapContainerRef.current, {
        center: [12.9716, 77.5946],
        zoom: 7,
        zoomControl: true,
      });

      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      layersGroupRef.current = window.L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    const layers = layersGroupRef.current;
    layers.clearLayers();

    const bounds = window.L.latLngBounds([]);

    // 1. Draw Direct Route (Muted dashed line)
    if (directRoute && directRoute.geometry && directRoute.geometry.length > 0) {
      const directLatLngs = directRoute.geometry.map(([lon, lat]) => [lat, lon]);
      const directPoly = window.L.polyline(directLatLngs, {
        color: "#64748b",
        weight: 3.5,
        dashArray: "6, 8",
        opacity: 0.7,
      });
      directPoly.bindTooltip(
        `Direct Route: ${directRoute.distance_km} km · ${Math.round(directRoute.duration_min)} min`,
        { sticky: true }
      );
      layers.addLayer(directPoly);
      directLatLngs.forEach((pt) => bounds.extend(pt));
    }

    // 2. Draw Scenic Route (Emerald solid vibrant line)
    if (scenicRoute && scenicRoute.geometry && scenicRoute.geometry.length > 0) {
      const scenicLatLngs = scenicRoute.geometry.map(([lon, lat]) => [lat, lon]);
      const scenicPoly = window.L.polyline(scenicLatLngs, {
        color: "#059669",
        weight: 5.5,
        opacity: 0.95,
      });
      scenicPoly.bindTooltip(
        `Scenic Route: ${scenicRoute.distance_km} km · ${Math.round(scenicRoute.duration_min)} min`,
        { sticky: true }
      );
      layers.addLayer(scenicPoly);
      scenicLatLngs.forEach((pt) => bounds.extend(pt));
    }

    // Custom DivIcons helper
    const createMarkerIcon = (htmlContent, className = "custom-map-pin") => {
      return window.L.divIcon({
        className,
        html: htmlContent,
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -34],
      });
    };

    // 3. Start Marker
    if (startLocation && startLocation.lat && startLocation.lon) {
      const startLatLng = [startLocation.lat, startLocation.lon];
      const startIcon = createMarkerIcon(
        `<div style="background:#10b981; color:white; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); border:2px solid white; font-size:16px;">🚀</div>`
      );
      const startMarker = window.L.marker(startLatLng, { icon: startIcon });
      startMarker.bindPopup(`
        <div style="font-family:inherit; min-width:180px;">
          <span style="font-size:11px; font-weight:bold; color:#059669; text-transform:uppercase;">Origin</span>
          <h4 style="margin:4px 0 2px; font-size:15px;">${startLocation.name || "Starting Point"}</h4>
          <p style="margin:0; font-size:12px; color:#64748b;">${startLocation.display_name || ""}</p>
        </div>
      `);
      layers.addLayer(startMarker);
      bounds.extend(startLatLng);
    }

    // 4. Destination Marker
    if (destination && destination.lat && destination.lon) {
      const destLatLng = [destination.lat, destination.lon];
      const destIcon = createMarkerIcon(
        `<div style="background:#ef4444; color:white; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); border:2px solid white; font-size:16px;">🏁</div>`
      );
      const destMarker = window.L.marker(destLatLng, { icon: destIcon });
      destMarker.bindPopup(`
        <div style="font-family:inherit; min-width:180px;">
          <span style="font-size:11px; font-weight:bold; color:#ef4444; text-transform:uppercase;">Destination</span>
          <h4 style="margin:4px 0 2px; font-size:15px;">${destination.name || "Destination"}</h4>
          <p style="margin:0; font-size:12px; color:#64748b;">${destination.display_name || ""}</p>
        </div>
      `);
      layers.addLayer(destMarker);
      bounds.extend(destLatLng);
    }

    // 5. Scenic Stops Markers
    scenicStops.forEach((stop, index) => {
      if (!stop.lat || !stop.lon) return;
      const stopLatLng = [stop.lat, stop.lon];
      const isIncluded = stop.is_included !== false;

      const stopIcon = createMarkerIcon(
        `<div style="background:${isIncluded ? "#f59e0b" : "#94a3b8"}; color:white; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); border:2px solid white; font-size:15px;">
          ${stop.icon || "📍"}
        </div>`
      );

      const marker = window.L.marker(stopLatLng, { icon: stopIcon });

      const popupContent = document.createElement("div");
      popupContent.style.minWidth = "210px";
      popupContent.innerHTML = `
        <div style="font-family:inherit;">
          <span style="font-size:11px; font-weight:bold; color:#d97706; text-transform:uppercase;">
            Stop #${index + 1} · ${stop.category}
          </span>
          <h4 style="margin:4px 0 3px; font-size:15px; color:#1e293b;">${stop.name}</h4>
          <p style="margin:0 0 8px; font-size:12px; color:#475569; line-height:1.4;">${stop.description}</p>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; color:#64748b; margin-bottom:8px;">
            <span>⏱️ +${stop.detour_min} min detour</span>
            <span>⭐ ${stop.scenic_score || 4.5}</span>
          </div>
          <button id="toggle-stop-btn-${stop.id}" style="width:100%; padding:6px 10px; border-radius:6px; border:none; cursor:pointer; font-weight:bold; font-size:12px; background:${
        isIncluded ? "#fee2e2" : "#d1fae5"
      }; color:${isIncluded ? "#991b1b" : "#065f46"};">
            ${isIncluded ? "Remove from Route" : "Add to Scenic Route"}
          </button>
        </div>
      `;

      // Handle button click inside popup
      marker.on("popupopen", () => {
        const btn = document.getElementById(`toggle-stop-btn-${stop.id}`);
        if (btn) {
          btn.onclick = () => {
            if (onToggleStop) onToggleStop(stop.id);
            marker.closePopup();
          };
        }
      });

      marker.bindPopup(popupContent);
      layers.addLayer(marker);
      bounds.extend(stopLatLng);
    });

    // Fit map bounds
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [startLocation, destination, directRoute, scenicRoute, scenicStops, onToggleStop]);

  return (
    <div className="map-wrapper">
      <div id="map" ref={mapContainerRef} style={{ width: "100%", height: "480px", borderRadius: "16px" }} />
      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-line scenic-line"></span>
          <span>Scenic Route (OpenRouteServices)</span>
        </div>
        <div className="legend-item">
          <span className="legend-line direct-line"></span>
          <span>Direct Route (Fastest)</span>
        </div>
        <div className="legend-item">
          <span className="legend-icon">📍</span>
          <span>Scenic Corridor Stops</span>
        </div>
      </div>
    </div>
  );
}
