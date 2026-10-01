import html
import time
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..google_auth import GoogleAuthError, verify_google_id_token
from ..config import settings
from ..mailer import mail_enabled, send_email
from ..schemas import (
    ForgotPasswordRequest,
    GoogleLoginRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserRead,
    UserUpdate,
)
from ..security import (
    InvalidTokenError,
    create_access_token,
    create_password_reset_token,
    create_refresh_token,
    decode_token,
    password_fingerprint_matches,
    read_password_reset_token,
    UNUSABLE_PASSWORD,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="כתובת האימייל כבר רשומה")

    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="אימייל או סיסמה שגויים")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


# ---------------------------------------------------------------------------
# שכחתי סיסמה
# ---------------------------------------------------------------------------

# הגבלה פשוטה: מייל איפוס אחד לכתובת בדקה. בזיכרון התהליך - מספיק כי השרת רץ
# עם worker יחיד (ראו Dockerfile).
RESET_COOLDOWN_SECONDS = 60
_last_reset_sent: dict[str, float] = {}

FORGOT_RESPONSE = {"status": "ok", "detail": "אם יש חשבון עם הכתובת הזו, שלחנו אליה קישור לאיפוס הסיסמה"}


def _reset_email_html(name: str, link: str) -> str:
    esc = html.escape
    minutes = settings.password_reset_expire_minutes
    return (
        "<div dir='rtl' style='font-family:sans-serif;font-size:15px;line-height:1.6'>"
        f"<p>היי {esc(name)},</p>"
        "<p>ביקשת לאפס את הסיסמה ב-OpuLi. אפשר לבחור סיסמה חדשה בקישור הזה:</p>"
        f"<p><a href='{esc(link)}' style='display:inline-block;padding:10px 18px;border-radius:10px;"
        "background:#3C87F7;color:#fff;text-decoration:none;font-weight:600'>בחירת סיסמה חדשה</a></p>"
        f"<p style='color:#666;font-size:13px'>הקישור תקף ל-{minutes} דקות ולשימוש אחד. "
        "אם לא ביקשת לאפס סיסמה, אפשר להתעלם מהמייל הזה.</p>"
        "</div>"
    )


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(payload: ForgotPasswordRequest, session: Session = Depends(get_session)):
    """שולח קישור לאיפוס סיסמה. התשובה זהה תמיד - כדי לא לחשוף אילו כתובות רשומות."""
    if not mail_enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "איפוס סיסמה לא זמין כרגע")

    email = payload.email.strip().lower()
    now = time.monotonic()
    if now - _last_reset_sent.get(email, -RESET_COOLDOWN_SECONDS) < RESET_COOLDOWN_SECONDS:
        return FORGOT_RESPONSE
    _last_reset_sent[email] = now

    user = session.exec(select(User).where(func.lower(User.email) == email)).first()
    if user is not None:
        token = create_password_reset_token(user.id, user.password_hash)
        link = f"{settings.app_url}/reset-password?token={quote(token)}"
        send_email(user.email, "איפוס סיסמה ב-OpuLi", _reset_email_html(user.display_name or user.email, link))
    return FORGOT_RESPONSE


@router.post("/reset-password", response_model=TokenResponse)
def reset_password(payload: ResetPasswordRequest, session: Session = Depends(get_session)):
    """קובע סיסמה חדשה לפי הטוקן מהמייל, ומחבר את המשתמש/ת מיד."""
    invalid = HTTPException(status.HTTP_400_BAD_REQUEST, "הקישור לא תקין או שפג תוקפו. אפשר לבקש קישור חדש.")
    try:
        user_id, fingerprint = read_password_reset_token(payload.token)
    except InvalidTokenError:
        raise invalid
    user = session.get(User, user_id)
    if user is None or not password_fingerprint_matches(user.password_hash, fingerprint):
        raise invalid

    user.password_hash = hash_password(payload.password)
    session.add(user)
    session.commit()
    _last_reset_sent.pop(user.email.lower(), None)
    return TokenResponse(access_token=create_access_token(user.id), refresh_token=create_refresh_token(user.id))


@router.post("/google", response_model=TokenResponse)
def login_with_google(payload: GoogleLoginRequest, session: Session = Depends(get_session)):
    """התחברות/הרשמה עם Google: מאמתים את ה-ID token ומחזירים את הטוקנים שלנו.

    סדר החיפוש: לפי מזהה Google (sub) -> לפי אימייל (חשבון קיים עם סיסמה
    מקושר ל-Google, כי Google אימתה שהאימייל שייך למשתמש/ת) -> חשבון חדש.
    """
    try:
        claims = verify_google_id_token(payload.credential)
    except GoogleAuthError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    google_sub = claims["sub"]
    email = claims["email"].lower()

    user = session.exec(select(User).where(User.google_sub == google_sub)).first()
    if user is None:
        # השוואה בלי תלות באותיות גדולות/קטנות - Google מחזירה אימייל באותיות קטנות
        user = session.exec(select(User).where(func.lower(User.email) == email)).first()
        if user is not None:
            user.google_sub = google_sub
        else:
            user = User(
                email=email,
                password_hash=UNUSABLE_PASSWORD,
                google_sub=google_sub,
                display_name=claims.get("given_name") or claims.get("name"),
            )
        session.add(user)
        session.commit()
        session.refresh(user)

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, session: Session = Depends(get_session)):
    try:
        user_id = decode_token(payload.refresh_token, expected_type="refresh")
    except InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="refresh token לא תקין")

    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="משתמש לא נמצא")

    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
    )


me_router = APIRouter(tags=["auth"])


@me_router.get("/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)):
    return current_user


@me_router.patch("/me", response_model=UserRead)
def update_me(
    payload: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """עדכון הגדרות המשתמש/ת (שם תצוגה / צבע ראשי / מצב תצוגה) - ראו מסך הפרופיל."""
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "intro_seen" and value is None:
            continue  # עמודה לא-nullable
        setattr(current_user, field, value)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user
