"""אימות ID token של "Sign in with Google" (Google Identity Services).

הדפדפן מקבל מ-Google טוקן JWT חתום (RS256). כאן מוודאים שהחתימה של Google,
שהוא הונפק לאפליקציה שלנו (aud = GOOGLE_CLIENT_ID), שלא פג תוקפו, ושהאימייל
אומת אצל Google - ורק אז סומכים על הזהות שבו.
"""

import jwt
from jwt import PyJWKClient

from .config import settings

GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_ISSUERS = ("accounts.google.com", "https://accounts.google.com")

# המפתחות הציבוריים של Google נשמרים ב-cache ומתעדכנים לבד כשמגיע kid חדש
_jwk_client = PyJWKClient(GOOGLE_CERTS_URL, cache_keys=True)


class GoogleAuthError(Exception):
    pass


def verify_google_id_token(credential: str) -> dict:
    """מחזיר את ה-claims של הטוקן אחרי אימות מלא, או זורק GoogleAuthError."""
    if not settings.google_client_id:
        raise GoogleAuthError("התחברות עם Google לא מוגדרת בשרת")
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.google_client_id,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise GoogleAuthError(f"טוקן Google לא תקין: {exc}") from exc

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise GoogleAuthError("טוקן שלא הונפק ע\"י Google")
    if not claims.get("email") or claims.get("email_verified") is not True:
        raise GoogleAuthError("כתובת האימייל בחשבון Google לא מאומתת")
    return claims
