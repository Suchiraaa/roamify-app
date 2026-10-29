# Roamify Backend - Trip Planner & Scenic Routing API

This is the Python FastAPI backend for **Roamify**, handling intelligent route planning, corridor POI discovery, and scenic waypoint routing powered by **OpenRouteServices (ORS)**.

---

##  Quick Start

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure OpenRouteServices API Key (Optional but Recommended)
Create or edit `.env`:
```ini
ORS_API_KEY=your_openrouteservice_api_key_here
PORT=8000
HOST=127.0.0.1
```
> **Note**: If `ORS_API_KEY` is not provided, the backend seamlessly falls back to public OSRM and Overpass routing, meaning it is **100% operational** immediately without configuration!

### 3. Run the Backend Server
```bash
python run.py
# or
uvicorn main:app --reload --port 8000
```

The API will be live at:
- **API Base**: `http://127.0.0.1:8000`
- **Interactive Swagger Docs**: `http://127.0.0.1:8000/docs`

---

## 📡 Key Endpoints

- `GET /api/health` — Checks service status and whether live OpenRouteServices key is configured.
- `GET /api/presets` — Curated scenic trip templates for 1-click exploration.
- `POST /api/plan-trip` — Takes start location, destination, budget, interest & time. Geocodes points, calculates direct route, finds corridor scenic stops, and builds the optimal scenic detour route using OpenRouteServices.
- `POST /api/recalculate-route` — Recalculates route dynamically when users toggle scenic stops on or off.
