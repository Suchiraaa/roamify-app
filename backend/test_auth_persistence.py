import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app

# Setup in-memory SQLite database for test isolation
TEST_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    yield
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_registration_and_cookies(client):
    response = client.post(
        "/api/auth/register",
        json={"email": "alice@example.com", "password": "supersecurepassword123", "name": "Alice"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["user"]["email"] == "alice@example.com"
    assert data["user"]["name"] == "Alice"
    assert "csrf_token" in data

    # Verify session cookie is set with HttpOnly, Expires, Max-Age, and SameSite
    assert "roamify_session" in response.cookies
    assert "roamify_csrf" in response.cookies
    raw_cookies = response.headers.get_list("set-cookie")
    session_cookie_hdr = [c for c in raw_cookies if c.startswith("roamify_session=")][0]
    assert "httponly" in session_cookie_hdr.lower()
    assert "expires=" in session_cookie_hdr.lower()
    assert "max-age=" in session_cookie_hdr.lower()
    assert "samesite=lax" in session_cookie_hdr.lower()

    csrf_cookie_hdr = [c for c in raw_cookies if c.startswith("roamify_csrf=")][0]
    assert "httponly" not in csrf_cookie_hdr.lower()
    assert "expires=" in csrf_cookie_hdr.lower()
    assert "max-age=" in csrf_cookie_hdr.lower()



def test_duplicate_registration_fails(client):
    client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "securepassword123"}
    )
    response = client.post(
        "/api/auth/register",
        json={"email": "bob@example.com", "password": "anotherpassword"}
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"].lower()


def test_login_success_and_invalid_credentials(client):
    client.post(
        "/api/auth/register",
        json={"email": "carol@example.com", "password": "correctpassword", "name": "Carol"}
    )

    # Valid login
    res = client.post(
        "/api/auth/login",
        json={"email": "carol@example.com", "password": "correctpassword"}
    )
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "carol@example.com"
    assert "roamify_session" in res.cookies

    # Invalid password
    res_wrong = client.post(
        "/api/auth/login",
        json={"email": "carol@example.com", "password": "wrongpassword"}
    )
    assert res_wrong.status_code == 401

    # Nonexistent email
    res_unknown = client.post(
        "/api/auth/login",
        json={"email": "unknown@example.com", "password": "password"}
    )
    assert res_unknown.status_code == 401


def test_auth_me_endpoint(client):
    # Unauthenticated
    res_unauth = client.get("/api/auth/me")
    assert res_unauth.status_code == 401

    # Register & automatically authenticated via cookie
    reg = client.post(
        "/api/auth/register",
        json={"email": "dave@example.com", "password": "password123", "name": "Dave"}
    )
    assert reg.status_code == 201

    res_auth = client.get("/api/auth/me")
    assert res_auth.status_code == 200
    assert res_auth.json()["user"]["email"] == "dave@example.com"


def test_logout_clears_cookies(client):
    client.post(
        "/api/auth/register",
        json={"email": "eve@example.com", "password": "password123"}
    )
    logout_res = client.post("/api/auth/logout")
    assert logout_res.status_code == 200
    # Cookie should be unset/expired
    val = logout_res.cookies.get("roamify_session")
    assert val is None or val == '""' or val == ""


def test_user_preferences_persistence(client):
    reg = client.post(
        "/api/auth/register",
        json={"email": "frank@example.com", "password": "password123"}
    )
    csrf_token = reg.json()["csrf_token"]

    # Initial default preferences
    get_res = client.get("/api/user/preferences")
    assert get_res.status_code == 200
    assert get_res.json()["default_budget"] == "Moderate"

    # Update preferences
    update_res = client.put(
        "/api/user/preferences",
        headers={"X-CSRF-Token": csrf_token},
        json={
            "default_interests": ["Nature", "Food"],
            "default_budget": "Premium",
            "default_duration": "Full day",
            "preferred_transport_mode": "driving-car",
            "scenic_factor": "high"
        }
    )
    assert update_res.status_code == 200
    assert update_res.json()["default_budget"] == "Premium"
    assert update_res.json()["default_interests"] == ["Nature", "Food"]

    # Verify persistence on re-fetch
    verify_res = client.get("/api/user/preferences")
    assert verify_res.status_code == 200
    assert verify_res.json()["default_budget"] == "Premium"
    assert verify_res.json()["scenic_factor"] == "high"


def test_user_saved_trips_crud_and_isolation(client):
    # Register User A
    user_a_reg = client.post(
        "/api/auth/register",
        json={"email": "usera@example.com", "password": "password123", "name": "User A"}
    )
    user_a_csrf = user_a_reg.json()["csrf_token"]

    # User A saves a trip
    trip_data = {
        "title": "Bengaluru to Ooty Vista",
        "start_location": "Bengaluru",
        "destination": "Ooty",
        "interests": ["Nature", "Viewpoints"],
        "budget": "Moderate",
        "duration": "Full day",
        "distance_km": 280.5,
        "duration_min": 360.0,
        "stops": [{"name": "Mysore Palace", "category": "Culture"}],
    }
    save_res = client.post(
        "/api/user/trips",
        headers={"X-CSRF-Token": user_a_csrf},
        json=trip_data
    )
    assert save_res.status_code == 201
    created_trip = save_res.json()
    trip_id = created_trip["id"]
    assert created_trip["title"] == "Bengaluru to Ooty Vista"

    # User A fetches trips
    trips_res = client.get("/api/user/trips")
    assert trips_res.status_code == 200
    assert len(trips_res.json()) == 1
    assert trips_res.json()[0]["id"] == trip_id

    # Register User B (new isolated session)
    client.post("/api/auth/logout")
    user_b_reg = client.post(
        "/api/auth/register",
        json={"email": "userb@example.com", "password": "password123", "name": "User B"}
    )
    user_b_csrf = user_b_reg.json()["csrf_token"]

    # User B fetches trips -> Must be empty!
    b_trips = client.get("/api/user/trips")
    assert b_trips.status_code == 200
    assert len(b_trips.json()) == 0

    # User B attempts to DELETE User A's trip -> Must be rejected with 404!
    b_del = client.delete(
        f"/api/user/trips/{trip_id}",
        headers={"X-CSRF-Token": user_b_csrf}
    )
    assert b_del.status_code == 404

    # Log back in as User A
    client.post("/api/auth/logout")
    login_a = client.post(
        "/api/auth/login",
        json={"email": "usera@example.com", "password": "password123"}
    )
    csrf_a_fresh = login_a.json()["csrf_token"]

    # User A deletes their own trip
    del_res = client.delete(
        f"/api/user/trips/{trip_id}",
        headers={"X-CSRF-Token": csrf_a_fresh}
    )
    assert del_res.status_code == 200

    # Verify trip list is now empty
    empty_res = client.get("/api/user/trips")
    assert empty_res.status_code == 200
    assert len(empty_res.json()) == 0


def test_user_saved_places_crud_and_isolation(client):
    # Register User 1
    u1_reg = client.post(
        "/api/auth/register",
        json={"email": "u1@example.com", "password": "password123"}
    )
    u1_csrf = u1_reg.json()["csrf_token"]

    place_data = {
        "place_id": "osm-node-998877",
        "name": "Tiger Point Viewpoint",
        "category": "Viewpoints",
        "lat": 18.75,
        "lon": 73.41,
        "address": "Lonavala, Maharashtra",
        "description": "Dramatic cliff drop panoramic viewpoint"
    }

    # User 1 bookmarks place
    p1_res = client.post(
        "/api/user/places",
        headers={"X-CSRF-Token": u1_csrf},
        json=place_data
    )
    assert p1_res.status_code == 201
    saved_p1 = p1_res.json()
    place_db_id = saved_p1["id"]
    assert saved_p1["place_id"] == "osm-node-998877"

    # User 1 bookmarks same place again -> Returns existing without duplicate error
    p1_dup = client.post(
        "/api/user/places",
        headers={"X-CSRF-Token": u1_csrf},
        json=place_data
    )
    assert p1_dup.status_code == 200
    assert p1_dup.json()["id"] == place_db_id

    # User 1 fetches places
    u1_places = client.get("/api/user/places")
    assert len(u1_places.json()) == 1

    # User 2 session
    client.post("/api/auth/logout")
    u2_reg = client.post(
        "/api/auth/register",
        json={"email": "u2@example.com", "password": "password123"}
    )
    u2_csrf = u2_reg.json()["csrf_token"]

    # User 2 sees 0 saved places
    assert len(client.get("/api/user/places").json()) == 0

    # User 2 cannot delete User 1's place
    u2_del = client.delete(
        f"/api/user/places/{place_db_id}",
        headers={"X-CSRF-Token": u2_csrf}
    )
    assert u2_del.status_code == 404

    # Log back into User 1 and delete by place_id
    client.post("/api/auth/logout")
    u1_login = client.post(
        "/api/auth/login",
        json={"email": "u1@example.com", "password": "password123"}
    )
    u1_csrf_new = u1_login.json()["csrf_token"]

    del_by_place_id = client.delete(
        "/api/user/places/by-place-id/osm-node-998877",
        headers={"X-CSRF-Token": u1_csrf_new}
    )
    assert del_by_place_id.status_code == 200

    # User 1 list is now empty
    assert len(client.get("/api/user/places").json()) == 0


def test_csrf_token_validation(client):
    reg = client.post(
        "/api/auth/register",
        json={"email": "csrf_test@example.com", "password": "password123"}
    )
    assert reg.status_code == 201

    # POST without CSRF token while authenticated via cookie -> Must be 403 Forbidden!
    bad_req = client.post(
        "/api/user/trips",
        json={"title": "Unauthorized Trip", "start_location": "A", "destination": "B"}
    )
    assert bad_req.status_code == 403
    assert "csrf" in bad_req.json()["detail"].lower()


def test_csrf_endpoint_cookie_attributes(client):
    res = client.get("/api/auth/csrf")
    assert res.status_code == 200
    assert "csrf_token" in res.json()
    raw_cookies = res.headers.get_list("set-cookie")
    csrf_cookie_hdr = [c for c in raw_cookies if c.startswith("roamify_csrf=")][0]
    assert "httponly" not in csrf_cookie_hdr.lower()
    assert "expires=" in csrf_cookie_hdr.lower()
    assert "max-age=" in csrf_cookie_hdr.lower()


def test_session_survives_browser_restart_simulation(client):
    # 1. Login in Client
    reg = client.post(
        "/api/auth/register",
        json={"email": "persistent_user@example.com", "password": "password123", "name": "Persistent"}
    )
    assert reg.status_code == 201
    saved_session_cookie = client.cookies.get("roamify_session")
    saved_csrf_cookie = client.cookies.get("roamify_csrf")

    # 2. Simulate closing browser and reopening by creating a fresh client with the persisted cookies
    new_browser = TestClient(app)
    # Set cookies explicitly on testserver.local domain so cookie jar handles persistence and deletion
    new_browser.cookies.set("roamify_session", saved_session_cookie, domain="testserver.local", path="/")
    new_browser.cookies.set("roamify_csrf", saved_csrf_cookie, domain="testserver.local", path="/")

    # 3. Reopen browser and visit site -> /api/auth/me should succeed and return the user
    me_res = new_browser.get("/api/auth/me")
    assert me_res.status_code == 200
    data = me_res.json()
    assert data["user"]["email"] == "persistent_user@example.com"
    assert data["user"]["name"] == "Persistent"

    # 4. Multiple page refreshes in reopened browser
    for _ in range(5):
        refresh_res = new_browser.get("/api/auth/me")
        assert refresh_res.status_code == 200
        assert refresh_res.json()["user"]["email"] == "persistent_user@example.com"

    # 5. Logout properly ends the session
    logout_res = new_browser.post("/api/auth/logout")
    assert logout_res.status_code == 200

    # 6. Subsequent requests fail as unauthenticated
    after_logout = new_browser.get("/api/auth/me")
    assert after_logout.status_code == 401


def test_guest_endpoints_unaffected(client):
    # Ensure guest users can access public endpoints freely
    assert client.get("/").status_code == 200
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/presets").status_code == 200
