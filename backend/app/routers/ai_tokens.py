"""ניהול טוקנים אישיים לאפליקציות AI מהפרופיל: יצירה, רשימה וביטול."""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..ai_tokens import KIND_PERSONAL, issue_token, normalize_scopes
from ..db import get_session
from ..deps import get_current_user
from ..models import AiToken, User
from ..schemas import AiTokenCreate, AiTokenCreated, AiTokenRead

router = APIRouter(tags=["ai-tokens"])

# כמה טוקנים פעילים מותר לחשבון אחד - מונע הצטברות טוקנים שנשכחו
MAX_ACTIVE_TOKENS = 20


def _read(row: AiToken) -> AiTokenRead:
    return AiTokenRead(
        id=row.id,
        name=row.name,
        kind=row.kind,
        token_prefix=row.token_prefix,
        scopes=row.scopes.split(),
        created_at=row.created_at,
        expires_at=row.expires_at,
        last_used_at=row.last_used_at,
    )


def _active_tokens(user_id: int, session: Session) -> list[AiToken]:
    now = datetime.utcnow()
    rows = session.exec(
        select(AiToken)
        .where(AiToken.user_id == user_id, AiToken.kind == KIND_PERSONAL, AiToken.revoked_at.is_(None))
        .order_by(AiToken.created_at.desc())
    ).all()
    return [r for r in rows if r.expires_at is None or r.expires_at > now]


@router.get("/me/ai-tokens", response_model=list[AiTokenRead])
def list_ai_tokens(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return [_read(r) for r in _active_tokens(current_user.id, session)]


@router.post("/me/ai-tokens", response_model=AiTokenCreated, status_code=status.HTTP_201_CREATED)
def create_ai_token(
    payload: AiTokenCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    scopes = normalize_scopes(payload.scopes)
    if not scopes:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="הרשאה לא מוכרת")
    if len(_active_tokens(current_user.id, session)) >= MAX_ACTIVE_TOKENS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="יש יותר מדי טוקנים פעילים - בטלי טוקן ישן קודם")
    row, plain = issue_token(
        session,
        user_id=current_user.id,
        name=payload.name.strip(),
        scopes=scopes,
        expires_in=timedelta(days=payload.expires_in_days) if payload.expires_in_days else None,
    )
    return AiTokenCreated(**_read(row).model_dump(), token=plain)


@router.delete("/me/ai-tokens/{token_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_ai_token(
    token_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row = session.get(AiToken, token_id)
    if row is None or row.user_id != current_user.id or row.kind != KIND_PERSONAL or row.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="טוקן לא נמצא")
    row.revoked_at = datetime.utcnow()
    session.add(row)
    session.commit()
