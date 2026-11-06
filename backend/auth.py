import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any

import argon2
from argon2.exceptions import VerifyMismatchError, InvalidHashError
import jwt
from fastapi import Request, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from database import get_db
from db_models import User

# Configuration from environment variables
SECRET_KEY = os.getenv("SECRET_KEY", "roamify-development-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))  # 7 days

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in ("true", "1", "yes")
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()

AUTH_COOKIE_NAME = "roamify_session"
CSRF_COOKIE_NAME = "roamify_csrf"

# Argon2id password hasher configuration (OWASP recommended parameters)
pwd_hasher = argon2.PasswordHasher(
    time_cost=2,
    memory_cost=65536,
    parallelism=1,
    hash_len=32,
    type=argon2.Type.ID
)


def hash_password(password: str) -> str:
    """Hash password securely using Argon2id."""
    return pwd_hasher.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """Verify raw password against stored Argon2id hash."""
    try:
        return pwd_hasher.verify(hashed_password, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def create_access_token(user_id: str, email: str, expires_delta: Optional[timedelta] = None) -> str:
    """Generate signed JWT access token."""
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decode and validate signed JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None


def generate_csrf_token() -> str:
    """Generate cryptographically secure CSRF token."""
    return secrets.token_hex(32)


def set_csrf_cookie(response: Response, csrf_token: str):
    """Attach readable CSRF cookie to response with matching Max-Age and Expires."""
    max_age_seconds = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=max_age_seconds,
        expires=max_age_seconds,
        httponly=False,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )


def set_auth_cookies(response: Response, token: str, csrf_token: Optional[str] = None):
    """
    Attach authentication and CSRF cookies to the HTTP response.
    - Auth cookie: HttpOnly, SameSite=Lax (or config), Secure in production, Max-Age + Expires
    - CSRF cookie: Accessible to JavaScript (HttpOnly=False) to allow double-submit validation
    """
    max_age_seconds = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age_seconds,
        expires=max_age_seconds,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    if csrf_token:
        set_csrf_cookie(response, csrf_token)


def clear_auth_cookies(response: Response):
    """Clear session and CSRF cookies on logout."""
    response.delete_cookie(
        key=AUTH_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        httponly=True,
    )
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        path="/",
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        httponly=False,
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db)
) -> User:
    """
    Dependency that extracts and validates the authenticated User from:
    1. HttpOnly cookie ('roamify_session')
    2. Fallback 'Authorization: Bearer <token>' header
    """
    token = request.cookies.get(AUTH_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload["sub"]
    try:
        user = db.query(User).filter(User.id == user_id).first()
    except Exception as exc:
        from database import is_transient_turso_error
        if is_transient_turso_error(exc):
            try:
                db.rollback()
            except Exception:
                pass
            user = db.query(User).filter(User.id == user_id).first()
        else:
            raise
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account no longer exists.",
        )
    return user


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Dependency that returns User if authenticated, or None for guest requests."""
    try:
        return get_current_user(request, db)
    except HTTPException:
        return None


def verify_csrf(request: Request):
    """
    Verify CSRF token for state-changing requests when authenticated via cookie.
    Validates X-CSRF-Token header against roamify_csrf cookie using constant-time comparison.
    """
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return

    # CSRF check applies if session cookie is present
    if AUTH_COOKIE_NAME in request.cookies:
        cookie_csrf = request.cookies.get(CSRF_COOKIE_NAME)
        header_csrf = request.headers.get("X-CSRF-Token")
        if not cookie_csrf or not header_csrf or not secrets.compare_digest(cookie_csrf, header_csrf):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CSRF token validation failed. Please refresh and try again.",
            )
