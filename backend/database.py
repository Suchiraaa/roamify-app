import logging
import os
import sqlite3
import time
import urllib.parse
from pathlib import Path
from typing import Any, Callable, Optional, Sequence

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

# Setup logging
logger = logging.getLogger("roamify.database")

# Ensure environment variables are loaded regardless of import order
BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv()

DEFAULT_DB_FILE = BACKEND_DIR / "roamify.db"

TRANSIENT_ERROR_PATTERNS = (
    "hrana",
    "connection closed",
    "broken pipe",
    "reset by peer",
    "http error",
    "stream closed",
    "timed out",
    "timeout",
    "connection reset",
    "failed to send",
    "network error",
    "connection aborted",
    "connection refused",
    "eof",
)


def is_transient_turso_error(exc: BaseException) -> bool:
    """Detect whether an exception is a transient Turso / Hrana network connection drop."""
    msg = str(exc).lower()
    return any(pattern in msg for pattern in TRANSIENT_ERROR_PATTERNS)


class ResilientLibsqlCursor:
    """
    Wraps a libsql cursor to automatically catch transient network/HTTP connection drops,
    reconnect the underlying database session, and retry execution seamlessly.
    """

    def __init__(self, parent_conn: "ResilientLibsqlConnection", raw_cursor: Any):
        self._parent = parent_conn
        self._cursor = raw_cursor

    def execute(self, statement: str, parameters: Optional[Sequence[Any]] = None):
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                if parameters is not None:
                    return self._cursor.execute(statement, parameters)
                return self._cursor.execute(statement)
            except Exception as exc:
                if attempt < max_retries and is_transient_turso_error(exc):
                    backoff = 0.1 * (2 ** attempt)
                    logger.warning(
                        "Transient Turso error on attempt %d: %s. Reconnecting and retrying in %.2fs...",
                        attempt + 1,
                        exc,
                        backoff,
                    )
                    time.sleep(backoff)
                    self._parent.reconnect()
                    self._cursor = self._parent._raw_conn.cursor()
                    continue

                if is_transient_turso_error(exc) and not isinstance(exc, sqlite3.Error):
                    # Raise as standard DBAPI OperationalError so SQLAlchemy's dialect
                    # recognizes it properly
                    raise sqlite3.OperationalError(str(exc)) from exc
                raise

    def executemany(self, statement: str, seq_of_parameters: Sequence[Sequence[Any]]):
        max_retries = 2
        for attempt in range(max_retries + 1):
            try:
                return self._cursor.executemany(statement, seq_of_parameters)
            except Exception as exc:
                if attempt < max_retries and is_transient_turso_error(exc):
                    backoff = 0.1 * (2 ** attempt)
                    logger.warning(
                        "Transient Turso error during executemany on attempt %d: %s. Retrying...",
                        attempt + 1,
                        exc,
                    )
                    time.sleep(backoff)
                    self._parent.reconnect()
                    self._cursor = self._parent._raw_conn.cursor()
                    continue

                if is_transient_turso_error(exc) and not isinstance(exc, sqlite3.Error):
                    raise sqlite3.OperationalError(str(exc)) from exc
                raise

    def __getattr__(self, name: str) -> Any:
        return getattr(self._cursor, name)


class ResilientLibsqlConnection:
    """
    Wraps a libsql DBAPI connection to provide automatic reconnection,
    safe pool disposal, and resilient cursor creation.
    """

    def __init__(self, connect_fn: Callable[[], Any]):
        self._connect_fn = connect_fn
        self._raw_conn = self._init_raw_connection()

    def _init_raw_connection(self) -> Any:
        conn = self._connect_fn()
        try:
            cur = conn.cursor()
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
        except Exception:
            pass
        return conn

    def reconnect(self) -> None:
        """Safely close previous socket and re-establish a fresh connection."""
        try:
            self._raw_conn.close()
        except Exception:
            pass
        self._raw_conn = self._init_raw_connection()

    def cursor(self) -> ResilientLibsqlCursor:
        return ResilientLibsqlCursor(self, self._raw_conn.cursor())

    def create_function(self, *args, **kwargs) -> None:
        """Compatibility no-op for regexp registration."""
        pass

    def rollback(self) -> None:
        try:
            return self._raw_conn.rollback()
        except Exception as exc:
            if is_transient_turso_error(exc):
                logger.debug("Transient error ignored during rollback: %s", exc)
                return None
            raise

    def commit(self) -> None:
        return self._raw_conn.commit()

    def close(self) -> None:
        try:
            return self._raw_conn.close()
        except Exception as exc:
            if is_transient_turso_error(exc):
                return None
            raise

    def __getattr__(self, name: str) -> Any:
        return getattr(self._raw_conn, name)


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
            return ResilientLibsqlConnection(
                lambda: libsql.connect(database=turso_url, auth_token=turso_token)
            )

        # In-memory libSQL test databases need StaticPool; remote Turso needs NullPool
        # to avoid holding idle HTTP/WebSocket connections that timeout.
        if turso_url == ":memory:":
            pool_class = StaticPool
        else:
            pool_class = NullPool

        engine_instance = create_engine(
            "sqlite://",
            creator=libsql_creator,
            poolclass=pool_class,
            echo=False,
        )

        # Patch dialect disconnection and ping safety
        engine_instance.dialect.is_disconnect = lambda e, conn, cur: is_transient_turso_error(e)

        def safe_do_ping(dbapi_connection):
            try:
                cursor = dbapi_connection.cursor()
                try:
                    cursor.execute("SELECT 1")
                finally:
                    cursor.close()
                return True
            except Exception as err:
                logger.warning("Turso pool ping check failed: %s; recycling connection.", err)
                return False

        engine_instance.dialect.do_ping = safe_do_ping

        # Event listener to invalidate connection on transient network failures
        @event.listens_for(engine_instance, "handle_error")
        def handle_turso_engine_error(context):
            orig = context.original_exception
            if is_transient_turso_error(orig):
                context.is_disconnect = True
                context.invalidate_pool_on_disconnect = True
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
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            db.close()
        except Exception:
            pass


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
