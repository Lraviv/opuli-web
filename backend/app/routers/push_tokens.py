from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..models import PushToken, User
from ..schemas import PushTokenCreate, PushTokenRead

router = APIRouter(tags=["push-tokens"])


@router.post("/push-tokens", response_model=PushTokenRead, status_code=status.HTTP_201_CREATED)
def register_push_token(
    payload: PushTokenCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # אם הטוקן הזה כבר רשום למשתמש (למשל נרשם שוב מאותו מכשיר) - לא כופלים
    existing = session.exec(
        select(PushToken).where(
            PushToken.user_id == current_user.id,
            PushToken.expo_push_token == payload.expo_push_token,
        )
    ).first()
    if existing is not None:
        return existing

    token = PushToken(user_id=current_user.id, **payload.model_dump())
    session.add(token)
    session.commit()
    session.refresh(token)
    return token


@router.delete("/push-tokens/{token}", status_code=status.HTTP_204_NO_CONTENT)
def delete_push_token(
    token: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(
        select(PushToken).where(
            PushToken.user_id == current_user.id,
            PushToken.expo_push_token == token,
        )
    ).first()
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="טוקן לא נמצא")
    session.delete(existing)
    session.commit()
