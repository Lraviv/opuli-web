from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from ..db import get_session
from ..deps import get_current_user
from ..models import User
from ..google_auth import GoogleAuthError, verify_google_id_token
from ..schemas import GoogleLoginRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserRead, UserUpdate
from ..security import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
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
        setattr(current_user, field, value)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user
