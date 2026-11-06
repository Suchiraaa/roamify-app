import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Float,
    DateTime,
    ForeignKey,
    Text,
    JSON,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Cascading relationships: deleting a user purges their owned data
    preferences = relationship("UserPreference", back_populates="user", uselist=False, cascade="all, delete-orphan")
    trips = relationship("SavedTrip", back_populates="user", cascade="all, delete-orphan")
    saved_places = relationship("SavedPlace", back_populates="user", cascade="all, delete-orphan")


class UserPreference(Base):
    __tablename__ = "user_preferences"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    interests = Column(JSON, default=list, nullable=False)  # e.g. ["Nature", "Food"]
    budget = Column(String(50), default="Moderate", nullable=False)
    duration = Column(String(50), default="3 hours", nullable=False)
    profile = Column(String(50), default="driving-car", nullable=False)
    scenic_factor = Column(String(50), default="balanced", nullable=False)
    default_start = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="preferences")


class SavedTrip(Base):
    __tablename__ = "saved_trips"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    title = Column(String(255), nullable=False)
    start_location = Column(JSON, nullable=False)  # {name, lon, lat, ...}
    destination = Column(JSON, nullable=False)     # {name, lon, lat, ...}
    trip_data = Column(JSON, nullable=False)       # full route geometry, scenic stops, waypoints, metrics
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    user = relationship("User", back_populates="trips")


class SavedPlace(Base):
    __tablename__ = "saved_places"

    # 'id' is the internal database record UUID (PK)
    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    # 'place_id' is the external map provider or coordinate identifier
    place_id = Column(String(255), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    category = Column(String(100), default="Scenic Vista", nullable=False)
    address = Column(Text, nullable=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    description = Column(Text, nullable=True)
    source = Column(String(50), default="scenic_stop", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    user = relationship("User", back_populates="saved_places")

    # Enforce that a user cannot bookmark the exact same physical place twice
    __table_args__ = (
        UniqueConstraint("user_id", "place_id", name="uq_user_saved_place"),
    )
