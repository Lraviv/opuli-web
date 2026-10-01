import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from typing import Literal

import jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# סיסמה "לא שמישה" לחשבונות שנוצרו דרך Google בלבד - אף סיסמה לא תתאים לה
UNUSABLE_PASSWORD = "!google-only"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except ValueError:
        # hash שלא מזוהה (למשל UNUSABLE_PASSWORD) = אין התאמה
        return False


def _create_token(subject: str, expires_delta: timedelta, token_type: Literal["access", "refresh"]) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(user_id: int) -> str:
    return _create_token(
        str(user_id),
        timedelta(minutes=settings.access_token_expire_minutes),
        "access",
    )


def create_refresh_token(user_id: int) -> str:
    return _create_token(
        str(user_id),
        timedelta(days=settings.refresh_token_expire_days),
        "refresh",
    )


class InvalidTokenError(Exception):
    pass


def _password_fingerprint(password_hash: str) -> str:
    # טביעה של ה-hash הנוכחי: אחרי שהסיסמה משתנה הטוקן הישן כבר לא תקף (שימוש חד-פעמי)
    return hashlib.sha256(f"{settings.jwt_secret}:{password_hash}".encode()).hexdigest()[:24]


def create_password_reset_token(user_id: int, password_hash: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "type": "reset",
        "pwd": _password_fingerprint(password_hash),
        "iat": now,
        "exp": now + timedelta(minutes=settings.password_reset_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def read_password_reset_token(token: str) -> tuple[int, str]:
    """מחזיר (user_id, טביעת הסיסמה). זורק InvalidTokenError אם לא תקין/פג תוקף."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    if payload.get("type") != "reset" or not payload.get("pwd"):
        raise InvalidTokenError("Unexpected token type")
    try:
        return int(payload["sub"]), payload["pwd"]
    except (KeyError, ValueError) as exc:
        raise InvalidTokenError("Malformed subject") from exc


def password_fingerprint_matches(password_hash: str, fingerprint: str) -> bool:
    return hmac.compare_digest(_password_fingerprint(password_hash), fingerprint)


def decode_token(token: str, expected_type: Literal["access", "refresh"]) -> int:
    """מפענח טוקן ומחזיר את user_id. זורק InvalidTokenError אם לא תקין."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc

    if payload.get("type") != expected_type:
        raise InvalidTokenError("Unexpected token type")

    try:
        return int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise InvalidTokenError("Malformed subject") from exc
