import os
import urllib.parse
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

# Default SQLite database path (inside backend directory for local development)
BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_DB_FILE = BACKEND_DIR / "roamify.db"


def parse_database_configuration():
    """
    Parses environment variables to configure either:
    1. Remote Turso / libSQL cloud SQLite database (for Render persistence)
    2. Local SQLite database file (for local development)
    """
    turso_url = os.getenv("TURSO_DATABASE_URL", "").strip()
    turso_token = os.getenv("TURSO_AUTH_TOKEN", "").strip()
    raw_db_url = os.getenv("DATABASE_URL", "").strip()

    # If DATABASE_URL starts with libsql:// or contains turso.io
    if raw_db_url and ("libsql://" in raw_db_url or "turso.io" in raw_db_url or raw_db_url.startswith("sqlite+libsql://")):
        parsed = urllib.parse.urlparse(raw_db_url)
        query_params = urllib.parse.parse_qs(parsed.query)

        # Extract authToken query param if present
        if not turso_token and "authToken" in query_params:
            turso_token = query_params["authToken"][0]

        # Reconstruct base URL without the token query param
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
        turso_url = clean_url.replace("sqlite+libsql://", "libsql://")

    is_turso = bool(turso_url)

    if not is_turso and not raw_db_url:
        sqlite_path = os.getenv("SQLITE_DB_PATH", str(DEFAULT_DB_FILE))
        raw_db_url = f"sqlite:///{sqlite_path}"

    return {
        "is_turso": is_turso,
        "turso_url": turso_url,
        "turso_token": turso_token,
        "database_url": raw_db_url,
    }


def build_engine(config=None):
    """
    Builds a SQLAlchemy Engine supporting both standard SQLite and Turso/libSQL.
    """
    cfg = config or parse_database_configuration()

    if cfg["is_turso"]:
        import libsql

        # Compatibility patch: SQLAlchemy's sqlite dialect expects create_function
        # on dbapi_connection for regexp registration. libsql.Connection does not have it.
        if not hasattr(libsql.Connection, "create_function"):
            libsql.Connection.create_function = lambda self, *args, **kwargs: None

        turso_url = cfg["turso_url"]
        turso_token = cfg["turso_token"]

        def libsql_creator():
            return libsql.connect(database=turso_url, auth_token=turso_token)

        engine_instance = create_engine(
            "sqlite://",
            creator=libsql_creator,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
        )
    else:
        db_url = cfg["database_url"]

        # Ensure parent directory exists for local files
        if db_url.startswith("sqlite:///"):
            raw_path = db_url.replace("sqlite:///", "", 1)
            if raw_path and raw_path != ":memory:":
                db_file_path = Path(raw_path)
                if db_file_path.parent:
                    os.makedirs(db_file_path.parent, exist_ok=True)

        engine_instance = create_engine(
            db_url,
            connect_args={"check_same_thread": False},
            echo=False,
        )

    # Enable foreign key constraints in SQLite engine
    @event.listens_for(engine_instance, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        except Exception:
            pass

    return engine_instance


db_config = parse_database_configuration()
engine = build_engine(db_config)

# Session factory and Declarative Base
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """
    FastAPI dependency yielding an independent database session per request.
    Closes the session cleanly upon request completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db(target_engine=None):
    """
    Creates all defined tables if they do not already exist.
    Can be passed a custom engine (e.g., in automated test isolation).
    """
    import db_models  # noqa: F401
    active_engine = target_engine or engine
    Base.metadata.create_all(bind=active_engine)


def get_database_status():
    """Returns database telemetry for API health check."""
    return {
        "provider": "Turso (libSQL Cloud SQLite)" if db_config["is_turso"] else "Local SQLite Engine",
        "persistent": bool(db_config["is_turso"] or not db_config["database_url"].endswith(":memory:")),
        "dialect": "SQLite / libSQL",
    }
