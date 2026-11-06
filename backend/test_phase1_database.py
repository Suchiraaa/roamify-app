import os
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from database import Base
from db_models import User, UserPreference, SavedTrip, SavedPlace


@pytest.fixture(scope="function")
def db_session():
    """
    Creates an isolated in-memory SQLite database with foreign keys enabled
    for each test function, ensuring complete isolation and no leftover files.
    """
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False}
    )

    @event.listens_for(test_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=test_engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=test_engine)


def test_tables_created(db_session):
    """Verify all 4 core tables exist in metadata and database."""
    table_names = Base.metadata.tables.keys()
    assert "users" in table_names
    assert "user_preferences" in table_names
    assert "saved_trips" in table_names
    assert "saved_places" in table_names


def test_user_creation(db_session):
    """Verify creating a user record with email, username, and Argon2 hash."""
    user = User(
        email="traveler@roamify.dev",
        username="RoamExplorer",
        hashed_password="$argon2id$v=19$m=65536,t=3,p=4$dummyhash"
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert user.id is not None
    assert len(user.id) == 36  # UUID v4 string
    assert user.email == "traveler@roamify.dev"
    assert user.created_at is not None
    assert user.updated_at is not None


def test_user_unique_email(db_session):
    """Verify duplicate email raises IntegrityError."""
    user1 = User(
        email="duplicate@roamify.dev",
        username="UserOne",
        hashed_password="hash1"
    )
    user2 = User(
        email="duplicate@roamify.dev",
        username="UserTwo",
        hashed_password="hash2"
    )
    db_session.add(user1)
    db_session.commit()

    db_session.add(user2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_user_preferences_link(db_session):
    """Verify UserPreference stores JSON interests, budget, duration, and profile."""
    user = User(email="pref@roamify.dev", username="PrefUser", hashed_password="hash")
    db_session.add(user)
    db_session.commit()

    prefs = UserPreference(
        user_id=user.id,
        interests=["Nature", "Culture", "Food"],
        budget="Premium",
        duration="Full day",
        profile="driving-car",
        default_start="Bengaluru, Karnataka"
    )
    db_session.add(prefs)
    db_session.commit()
    db_session.refresh(user)

    assert user.preferences is not None
    assert user.preferences.interests == ["Nature", "Culture", "Food"]
    assert user.preferences.budget == "Premium"
    assert user.preferences.duration == "Full day"
    assert user.preferences.profile == "driving-car"


def test_saved_trip_persistence(db_session):
    """Verify SavedTrip stores full structured JSON data linked to user ID."""
    user = User(email="trips@roamify.dev", username="TripUser", hashed_password="hash")
    db_session.add(user)
    db_session.commit()

    trip = SavedTrip(
        user_id=user.id,
        title="Bengaluru to Mysuru Scenic Detour",
        start_location={"name": "Bengaluru", "lon": 77.5946, "lat": 12.9716},
        destination={"name": "Mysuru", "lon": 76.6394, "lat": 12.2958},
        trip_data={
            "direct_distance_km": 145.2,
            "scenic_distance_km": 168.4,
            "detour_added_km": 23.2,
            "detour_added_min": 35.0,
            "scenic_stops_count": 3
        }
    )
    db_session.add(trip)
    db_session.commit()
    db_session.refresh(user)

    assert len(user.trips) == 1
    saved = user.trips[0]
    assert saved.title == "Bengaluru to Mysuru Scenic Detour"
    assert saved.start_location["name"] == "Bengaluru"
    assert saved.trip_data["detour_added_km"] == 23.2


def test_saved_place_persistence_and_disambiguation(db_session):
    """
    Verify SavedPlace distinguishes between database UUID ('id')
    and external map provider identifier ('place_id').
    """
    user = User(email="places@roamify.dev", username="PlaceUser", hashed_password="hash")
    db_session.add(user)
    db_session.commit()

    saved_place = SavedPlace(
        user_id=user.id,
        place_id="mapbox-poi-shivasamudram-waterfalls-9988",
        name="Shivanasamudra Falls",
        category="Nature",
        address="Malavalli, Mandya, Karnataka",
        lat=12.2950,
        lon=77.1706,
        description="Twin segmented waterfalls along the Kaveri river.",
        source="scenic_stop"
    )
    db_session.add(saved_place)
    db_session.commit()
    db_session.refresh(saved_place)

    # 1. Database UUID 'id' is unique and generated
    assert saved_place.id is not None
    assert len(saved_place.id) == 36
    # 2. External map provider 'place_id' is preserved
    assert saved_place.place_id == "mapbox-poi-shivasamudram-waterfalls-9988"
    assert saved_place.name == "Shivanasamudra Falls"
    assert saved_place.lat == 12.2950
    assert saved_place.lon == 77.1706


def test_saved_place_unique_per_user(db_session):
    """Verify that a user cannot bookmark the same external place_id twice."""
    user = User(email="unique_place@roamify.dev", username="UniquePlaceUser", hashed_password="hash")
    db_session.add(user)
    db_session.commit()

    place1 = SavedPlace(
        user_id=user.id,
        place_id="poi-12345",
        name="Vista Point",
        category="Viewpoints",
        lat=12.0,
        lon=77.0
    )
    place2 = SavedPlace(
        user_id=user.id,
        place_id="poi-12345",
        name="Vista Point Duplicate",
        category="Viewpoints",
        lat=12.0,
        lon=77.0
    )
    db_session.add(place1)
    db_session.commit()

    db_session.add(place2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_foreign_key_enforcement(db_session):
    """Verify that saving data referencing a non-existent user_id is blocked."""
    invalid_trip = SavedTrip(
        user_id="non-existent-user-uuid",
        title="Ghost Trip",
        start_location={"name": "A"},
        destination={"name": "B"},
        trip_data={}
    )
    db_session.add(invalid_trip)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_cascading_deletion(db_session):
    """Verify that deleting a user automatically cascades and deletes their preferences, trips, and saved places."""
    user = User(email="cascade@roamify.dev", username="CascadeUser", hashed_password="hash")
    db_session.add(user)
    db_session.commit()

    prefs = UserPreference(user_id=user.id, interests=["Nature"], budget="Moderate", duration="3 hours", profile="driving-car")
    trip = SavedTrip(user_id=user.id, title="Trip To Delete", start_location={}, destination={}, trip_data={})
    place = SavedPlace(user_id=user.id, place_id="place-to-delete", name="Spot", category="Nature", lat=1.0, lon=1.0)

    db_session.add_all([prefs, trip, place])
    db_session.commit()

    # Confirm created
    assert db_session.query(UserPreference).filter_by(user_id=user.id).count() == 1
    assert db_session.query(SavedTrip).filter_by(user_id=user.id).count() == 1
    assert db_session.query(SavedPlace).filter_by(user_id=user.id).count() == 1

    # Delete user
    db_session.delete(user)
    db_session.commit()

    # Confirm all orphaned records were cascaded and deleted
    assert db_session.query(UserPreference).filter_by(user_id=user.id).count() == 0
    assert db_session.query(SavedTrip).filter_by(user_id=user.id).count() == 0
    assert db_session.query(SavedPlace).filter_by(user_id=user.id).count() == 0
