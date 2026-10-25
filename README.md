# 🌍 Roamify — Trip Planner & Scenic Routing

> Make every mile worth exploring. Intelligent scenic routing and trip planning powered by **React**, **Python FastAPI**, and **OpenRouteServices (ORS)**.

---

## 🏗️ Project Architecture

```
Roamify/
├── backend/                  # Python FastAPI Backend
│   ├── main.py               # REST API endpoints & CORS
│   ├── models.py             # Pydantic data schemas
│   ├── ors_service.py        # OpenRouteServices directions, geocoding & OSRM fallback
│   ├── scenic_finder.py      # Corridor POI discovery & detour scoring
│   ├── run.py                # Single-command server starter
│   ├── requirements.txt      # Python dependencies (FastAPI, uvicorn, httpx, pydantic)
│   ├── .env.example          # Environment template
│   └── .env                  # Environment config with ORS_API_KEY
│
├── frontend/                 # React 19 + Vite Frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── TripPlannerForm.jsx  # Trip input form, preset chips, mode selector
│   │   │   ├── RouteMap.jsx         # Interactive Leaflet map (direct & scenic polylines)
│   │   │   ├── RouteSummary.jsx     # Route metrics, detour time/km comparison
│   │   │   ├── ScenicStopsList.jsx  # Scenic corridor stops with toggle controls
│   │   │   └── ApiKeyModal.jsx      # OpenRouteServices key config modal
│   │   ├── services/
│   │   │   └── api.js               # Frontend-backend API client
│   │   ├── App.jsx                  # Main application orchestrator
│   │   └── App.css                  # Modern travel design styles
│   ├── index.html                   # Entry HTML with Leaflet CSS & JS
│   └── package.json                 # React dependencies
└── README.md
```

---

## ⚡ How to Run

### Step 1: Start the FastAPI Backend
Open a terminal in the `backend` folder:
```bash
cd c:\Users\Ganesh\Downloads\Roamify\backend
pip install -r requirements.txt
python run.py
```
> **Backend runs at:** `http://127.0.0.1:8000`
> **Interactive Swagger Docs:** `http://127.0.0.1:8000/docs`

### Step 2: Start the React Frontend
Open another terminal in the `frontend` folder:
```bash
cd c:\Users\Ganesh\Downloads\Roamify\frontend
npm run dev
```
> **Frontend runs at:** `http://localhost:5173`

---

## 🗺️ How OpenRouteServices (ORS) is Integrated

1. **Geocoding (`/geocode/search`)**: Converts start & destination names (e.g., *Bengaluru* & *Mysuru*) to geographic coordinates `[lon, lat]`.
2. **Direct Route (`/v2/directions/driving-car/geojson`)**: Calculates the baseline direct route distance, duration, and GeoJSON geometry.
3. **Corridor Scenic Discovery**: Scans a spatial corridor along the route for high-rated points of interest (Nature, Heritage, Food, Panoramas, Sacred Sites).
4. **Scenic Detour Route (`/v2/directions/...`)**: Inserts discovered scenic waypoints into the path to calculate an enriched detour route geometry, extra distance (+km), and added journey time (+min).
5. **Interactive Re-routing**: Users can toggle any stop on or off; the app calls `/api/recalculate-route` to recompute the scenic polyline in real-time.
6. **Zero-Configuration Fallback**: If an ORS API key is not yet configured, the system automatically uses OSRM and Overpass routing, ensuring the application always works smoothly for demonstrations.