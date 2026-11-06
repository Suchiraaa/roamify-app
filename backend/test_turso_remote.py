"""
Real remote Turso connection test.

Loads TURSO_DATABASE_URL and TURSO_AUTH_TOKEN from backend/.env.
Never prints, logs, or exposes the URL or token.
Creates temporary test data, verifies persistence, then cleans up.
"""

import os
import sys
import uuid
import json
from pathlib import Path

import pytest
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ── Load .env WITHOUT printing any values ────────────────────────────────────
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH, override=False)

TURSO_URL   = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()

# ── Skip entire module if credentials are absent ─────────────────────────────
pytestmark = pytest.mark.skipif(
    not TURSO_URL or not TURSO_TOKEN,
    reason="TURSO_DATABASE_URL or TURSO_AUTH_TOKEN not set — skipping remote tests",
)

# ── Module-level state dict ───────────────────────────────────────────────────
_state: dict = {}


# ── Engine helper ─────────────────────────────────────────────────────────────

def _make_engine():
    """Return a fresh SQLAlchemy engine connected to the real Turso database."""
    import libsql
    if not hasattr(libsql.Connection, "create_function"):
        libsql.Connection.create_function = lambda self, *args, **kwargs: None

    def _creator():
        return libsql.connect(database=TURSO_URL, auth_token=TURSO_TOKEN)

    return create_engine(
        "sqlite://",
        creator=_creator,
        pool_pre_ping=True,
        pool_recycle=300,
        echo=False,
    )


@pytest.fixture(scope="module")
def remote_engine():
    eng = _make_engine()
    yield eng
    eng.dispose()


@pytest.fixture(scope="module")
def remote_tables(remote_engine):
    """Ensure all ORM tables exist in the remote DB."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import db_models  # noqa: F401
    from database import Base
    Base.metadata.create_all(bind=remote_engine)
    yield remote_engine


@pytest.fixture(scope="module")
def remote_session(remote_tables):
    Session = sessionmaker(bind=remote_tables)
    session = Session()
    yield session
    session.close()


def _test_email() -> str:
    return f"turso_test_{uuid.uuid4().hex[:8]}@roamify-test.invalid"


# libsql wraps UNIQUE violations as ValueError instead of sqlalchemy.exc.IntegrityError
_INTEGRITY_ERRORS = (Exception,)
try:
    import sqlalchemy.exc as _sa_exc
    _INTEGRITY_ERRORS = (_sa_exc.IntegrityError, ValueError)
except ImportError:
    pass


# ═════════════════════════════════════════════════════════════════════════════
# TEST 1 — basic connectivity
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_connection_alive(remote_engine):
    """Engine executes a trivial query against the real Turso DB."""
    with remote_engine.connect() as conn:
        row = conn.execute(text("SELECT 1 AS probe")).fetchone()
    assert row is not None and row[0] == 1


def test_remote_sqlite_version(remote_engine):
    """Remote DB reports a recognisable SQLite/libSQL version (>= 3.x)."""
    with remote_engine.connect() as conn:
        row = conn.execute(text("SELECT sqlite_version()")).fetchone()
    version = row[0]
    assert version and int(version.split(".")[0]) >= 3


# ═════════════════════════════════════════════════════════════════════════════
# TEST 2 — schema
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_tables_exist(remote_tables):
    """All four ORM tables exist in the remote Turso database."""
    expected = {"users", "user_preferences", "saved_trips", "saved_places"}
    with remote_tables.connect() as conn:
        rows = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()
    found = {r[0] for r in rows}
    assert not (expected - found), f"Missing tables: {expected - found}"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 3 — user registration
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_user_registration(remote_session):
    """Can insert a User row and read it back from Turso."""
    from db_models import User
    from auth import hash_password

    email  = _test_email()
    hashed = hash_password("RemoteTest@123!")
    uid    = str(uuid.uuid4())

    user = User(id=uid, email=email, username="TursoTester", hashed_password=hashed)
    remote_session.add(user)
    remote_session.commit()

    fetched = remote_session.query(User).filter_by(email=email).first()
    assert fetched is not None
    assert fetched.username == "TursoTester"

    _state["user_id"]    = fetched.id
    _state["user_email"] = email


def test_remote_duplicate_email_rejected(remote_session):
    """
    Inserting a second User with the same email is rejected by Turso.
    libsql wraps UNIQUE violations as ValueError (Hrana stream error),
    not sqlalchemy.exc.IntegrityError — we catch both.
    """
    from db_models import User
    from auth import hash_password

    dup = User(
        id=str(uuid.uuid4()),
        email=_state["user_email"],
        username="DupTester",
        hashed_password=hash_password("Other@456!"),
    )
    remote_session.add(dup)
    with pytest.raises(_INTEGRITY_ERRORS):
        remote_session.flush()
    remote_session.rollback()  # mandatory after any exception during flush


# ═════════════════════════════════════════════════════════════════════════════
# TEST 4 — password verification (Argon2id)
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_password_verification(remote_session):
    """Argon2id hash stored in Turso verifies correctly."""
    from db_models import User
    from auth import verify_password

    user = remote_session.query(User).filter_by(email=_state["user_email"]).first()
    assert user is not None
    assert verify_password("RemoteTest@123!", user.hashed_password) is True
    assert verify_password("WrongPassword!", user.hashed_password) is False


# ═════════════════════════════════════════════════════════════════════════════
# TEST 5 — user preferences
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_preferences_save_and_retrieve(remote_session):
    """UserPreference row is persisted and retrieved correctly."""
    from db_models import UserPreference

    pref = UserPreference(
        user_id=_state["user_id"],  # PK is user_id (no separate id column)
        interests=["history", "food"],
        budget="Moderate",
        duration="3 hours",
        profile="driving-car",
        scenic_factor="high",
    )
    remote_session.add(pref)
    remote_session.commit()

    fetched = remote_session.query(UserPreference).filter_by(
        user_id=_state["user_id"]
    ).first()
    assert fetched is not None
    assert fetched.scenic_factor == "high"


# ═════════════════════════════════════════════════════════════════════════════
# TEST 6 — saved trips
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_saved_trip_insert_and_retrieve(remote_session):
    """SavedTrip row is written to and read back from Turso correctly."""
    from db_models import SavedTrip

    trip_id = str(uuid.uuid4())
    payload = {
        "title": "Remote Test Trip",
        "origin": "Dublin",
        "destination_name": "Galway",
        "interests": ["history", "nature"],
    }

    trip = SavedTrip(
        id=trip_id,
        user_id=_state["user_id"],
        title="Remote Test Trip",
        start_location={"name": "Dublin", "lon": -6.2603, "lat": 53.3498},
        destination={"name": "Galway", "lon": -9.0568, "lat": 53.2707},
        trip_data=payload,
    )
    remote_session.add(trip)
    remote_session.commit()

    fetched = remote_session.query(SavedTrip).filter_by(id=trip_id).first()
    assert fetched is not None
    assert fetched.title == "Remote Test Trip"
    assert fetched.trip_data["origin"] == "Dublin"

    _state["trip_id"] = trip_id


def test_remote_trip_delete(remote_session):
    """Deleting a SavedTrip removes it from Turso."""
    from db_models import SavedTrip

    trip = remote_session.query(SavedTrip).filter_by(id=_state["trip_id"]).first()
    assert trip is not None
    remote_session.delete(trip)
    remote_session.commit()

    gone = remote_session.query(SavedTrip).filter_by(id=_state["trip_id"]).first()
    assert gone is None


# ═════════════════════════════════════════════════════════════════════════════
# TEST 7 — saved places
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_saved_place_insert_and_retrieve(remote_session):
    """SavedPlace row written and read back correctly (using actual column names)."""
    from db_models import SavedPlace

    sp_id    = str(uuid.uuid4())
    ext_id   = str(uuid.uuid4())

    place = SavedPlace(
        id=sp_id,
        user_id=_state["user_id"],
        place_id=ext_id,
        name="Cliffs of Moher",
        address="Co. Clare, Ireland",
        lat=52.9715,          # actual column name
        lon=-9.4309,          # actual column name
        category="nature",
        description="Stunning Atlantic views",
        source="scenic_stop",
    )
    remote_session.add(place)
    remote_session.commit()

    fetched = remote_session.query(SavedPlace).filter_by(id=sp_id).first()
    assert fetched is not None
    assert fetched.name == "Cliffs of Moher"
    assert abs(fetched.lat - 52.9715) < 0.001

    _state["place_id"] = sp_id
    _state["ext_id"]   = ext_id


def test_remote_duplicate_place_rejected(remote_session):
    """Saving the same place_id twice for the same user is rejected."""
    from db_models import SavedPlace

    dup = SavedPlace(
        id=str(uuid.uuid4()),
        user_id=_state["user_id"],
        place_id=_state["ext_id"],  # same external place_id
        name="Cliffs (dup)",
        lat=52.9715,
        lon=-9.4309,
    )
    remote_session.add(dup)
    with pytest.raises(_INTEGRITY_ERRORS):
        remote_session.flush()
    remote_session.rollback()


def test_remote_saved_place_delete(remote_session):
    """Deleting a SavedPlace removes it from Turso."""
    from db_models import SavedPlace

    place = remote_session.query(SavedPlace).filter_by(id=_state["place_id"]).first()
    assert place is not None
    remote_session.delete(place)
    remote_session.commit()

    gone = remote_session.query(SavedPlace).filter_by(id=_state["place_id"]).first()
    assert gone is None


# ═════════════════════════════════════════════════════════════════════════════
# TEST 8 — persistence across reconnect
# ═════════════════════════════════════════════════════════════════════════════

def test_remote_persistence_across_reconnect():
    """
    Data committed in one engine is visible from an entirely new engine instance.
    Confirms writes reach the Turso cloud, not just an in-process cache.
    """
    from db_models import User

    engine2 = _make_engine()
    Session2 = sessionmaker(bind=engine2)
    session2 = Session2()

    try:
        users = session2.query(User).filter(
            User.email.like("%@roamify-test.invalid")
        ).all()
    finally:
        session2.close()
        engine2.dispose()

    assert len(users) >= 1, (
        "No test user found via second connection — data was not persisted remotely"
    )


# ═════════════════════════════════════════════════════════════════════════════
# TEST 9 — cleanup (always runs last)
# ═════════════════════════════════════════════════════════════════════════════

def test_cleanup_test_data(remote_session):
    """
    Delete all rows inserted by this test run.
    Cascade ON DELETE removes preferences, trips, and places automatically.
    """
    from db_models import User

    # Ensure no pending failed transaction before querying
    try:
        remote_session.rollback()
    except Exception:
        pass

    test_users = remote_session.query(User).filter(
        User.email.like("%@roamify-test.invalid")
    ).all()

    for u in test_users:
        remote_session.delete(u)
    remote_session.commit()

    remaining = remote_session.query(User).filter(
        User.email.like("%@roamify-test.invalid")
    ).all()
    assert len(remaining) == 0, "Cleanup failed — test users still present"
