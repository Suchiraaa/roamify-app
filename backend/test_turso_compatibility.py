import os
import pytest
from sqlalchemy.orm import sessionmaker

from database import parse_database_configuration, build_engine, Base
from db_models import User, UserPreference, SavedTrip, SavedPlace


def test_parse_database_configuration_local(monkeypatch):
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.setenv("DATABASE_URL", "sqlite:///test_local.db")

    cfg = parse_database_configuration()
    assert not cfg["is_turso"]
    assert cfg["database_url"] == "sqlite:///test_local.db"


def test_parse_database_configuration_turso(monkeypatch):
    # Test with separate TURSO env vars
    monkeypatch.setenv("TURSO_DATABASE_URL", "libsql://roamify-test-db.turso.io")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "test-token-xyz")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    cfg = parse_database_configuration()
    assert cfg["is_turso"]
    assert cfg["turso_url"] == "libsql://roamify-test-db.turso.io"
    assert cfg["turso_token"] == "test-token-xyz"


def test_parse_database_configuration_query_param(monkeypatch):
    # Test parsing authToken from single DATABASE_URL string
    monkeypatch.delenv("TURSO_DATABASE_URL", raising=False)
    monkeypatch.delenv("TURSO_AUTH_TOKEN", raising=False)
    monkeypatch.setenv(
        "DATABASE_URL",
        "libsql://roamify-test-db.turso.io?authToken=query-param-token-123"
    )

    cfg = parse_database_configuration()
    assert cfg["is_turso"]
    assert "authToken" not in cfg["turso_url"]
    assert cfg["turso_token"] == "query-param-token-123"


def test_libsql_inmemory_engine_and_schema():
    # Build a simulated Turso/libSQL engine using in-memory libsql database
    cfg = {
        "is_turso": True,
        "turso_url": ":memory:",
        "turso_token": "",
        "database_url": "",
    }
    libsql_engine = build_engine(cfg)
    Base.metadata.create_all(bind=libsql_engine)

    Session = sessionmaker(bind=libsql_engine)
    session = Session()

    # 1. Create User
    user = User(
        email="turso_tester@example.com",
        username="TursoUser",
        hashed_password="secure_argon2id_hash_string"
    )
    session.add(user)
    session.flush()

    # 2. Create UserPreference
    pref = UserPreference(
        user_id=user.id,
        interests=["Nature", "Culture"],
        budget="Premium",
        duration="Full day",
        profile="driving-car",
        scenic_factor="high"
    )
    session.add(pref)

    # 3. Create SavedTrip with rich JSON data
    trip = SavedTrip(
        user_id=user.id,
        title="San Francisco to Big Sur Coastal Highway",
        start_location={"name": "San Francisco", "lat": 37.77, "lon": -122.41},
        destination={"name": "Big Sur", "lat": 36.27, "lon": -121.80},
        trip_data={
            "distance_km": 235.4,
            "duration_min": 210.0,
            "stops": [
                {"name": "Bixby Creek Bridge", "category": "Viewpoints"},
                {"name": "McWay Falls", "category": "Nature"}
            ],
            "interests": ["Nature", "Viewpoints"]
        }
    )
    session.add(trip)

    # 4. Create SavedPlace (Bookmark)
    place = SavedPlace(
        user_id=user.id,
        place_id="osm-node-889977",
        name="Bixby Creek Bridge Viewpoint",
        category="Viewpoints",
        lat=36.371,
        lon=-121.901,
        address="Highway 1, Monterey County, CA",
        description="Iconic concrete arch bridge overlooking Pacific waves"
    )
    session.add(place)
    session.commit()

    # 5. Query and verify relations & JSON serialization
    fetched_user = session.query(User).filter_by(email="turso_tester@example.com").first()
    assert fetched_user is not None
    assert fetched_user.username == "TursoUser"
    assert fetched_user.preferences.budget == "Premium"
    assert fetched_user.preferences.scenic_factor == "high"
    assert len(fetched_user.trips) == 1
    assert fetched_user.trips[0].trip_data["distance_km"] == 235.4
    assert len(fetched_user.trips[0].trip_data["stops"]) == 2
    assert len(fetched_user.saved_places) == 1
    assert fetched_user.saved_places[0].name == "Bixby Creek Bridge Viewpoint"

    # 6. Verify cascading deletion: deleting user removes owned trips, places, preferences
    user_id = user.id
    session.delete(fetched_user)
    session.commit()

    assert session.query(UserPreference).filter_by(user_id=user_id).first() is None
    assert session.query(SavedTrip).filter_by(user_id=user_id).first() is None
    assert session.query(SavedPlace).filter_by(user_id=user_id).first() is None

    session.close()
    Base.metadata.drop_all(bind=libsql_engine)
