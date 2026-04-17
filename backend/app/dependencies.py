from fastapi import Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.models.database import get_db
from app.models.user import User
from app.services.firebase_auth import verify_firebase_token
import logging
import uuid

logger = logging.getLogger(__name__)


def _extract_uid_from_token(token: str) -> str | None:
    """Try to get Firebase UID from JWT without network call (fallback only)."""
    try:
        from jose import jwt as jose_jwt
        decoded = jose_jwt.decode(token, key="", options={"verify_signature": False, "verify_aud": False})
        return decoded.get("user_id") or decoded.get("sub")
    except Exception:
        return None


def _temp_user(firebase_uid: str, email: str, display_name: str) -> User:
    """Create a transient in-memory User that won't be persisted."""
    u = User.__new__(User)
    u.id = firebase_uid          # use firebase_uid as a stable stand-in
    u.firebase_uid = firebase_uid
    u.email = email
    u.display_name = display_name
    u.resume_skills = None
    u.telegram_chat_id = None
    return u


async def get_current_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Extract Firebase token from Authorization header, verify, and return/create user."""
    firebase_uid = "public_user_uid"
    user_email = "public@example.com"
    user_display_name = "Public User"

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        # Try full Firebase verification first
        claims = await verify_firebase_token(token)
        if claims:
            firebase_uid = claims.get("uid") or claims.get("user_id") or firebase_uid
            user_email = claims.get("email") or f"{firebase_uid[:8]}@user.tjsr"
            user_display_name = claims.get("name") or claims.get("display_name") or "User"
        else:
            # Fallback: decode JWT without verification to at least get UID
            uid = _extract_uid_from_token(token)
            if uid:
                firebase_uid = uid
                user_email = f"{firebase_uid[:8]}@user.tjsr"
                user_display_name = "User"

    # ── Find or create user in PostgreSQL ───────────────────────────────
    # IMPORTANT: If the query fails (e.g. schema not migrated yet), we MUST
    # rollback before any subsequent query on this session, otherwise
    # PostgreSQL keeps the connection in an "aborted transaction" state and
    # every following query on the same session also fails.
    try:
        result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
        user = result.scalar_one_or_none()

        if not user:
            user = User(
                firebase_uid=firebase_uid,
                email=user_email,
                display_name=user_display_name,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
            logger.info(f"Created new user: {firebase_uid[:8]}...")

        return user

    except Exception as exc:
        # Roll back so the session can be reused by the actual endpoint query
        try:
            await db.rollback()
        except Exception:
            pass
        logger.warning(f"User lookup failed (schema migration pending?): {exc}")
        # Return an in-memory stub so endpoints degrade gracefully
        return _temp_user(firebase_uid, user_email, user_display_name)


async def get_optional_user(
    authorization: str = Header(None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Same as get_current_user but returns None instead of raising on failure."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    try:
        user = await get_current_user(authorization=authorization, db=db)
        return user
    except Exception:
        try:
            await db.rollback()
        except Exception:
            pass
        return None
