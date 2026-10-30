"""עמוד האישור /connect באתר וניהול החיבורים מהפרופיל.

עמוד /connect מקבל מזהה בקשה (נוצר ב-app/mcp_server/oauth.py כשאפליקציה
שולחת את המשתמשת ל-/authorize), מציג מי מבקש גישה, ושולח את ההחלטה לכאן.
אחרי אישור מוחזרת כתובת ההפניה חזרה לאפליקציה עם קוד חד-פעמי.
"""

import secrets
from datetime import datetime, timedelta
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from mcp.server.auth.provider import AuthorizationParams, construct_redirect_uri
from sqlmodel import Session, col, select

from ..ai_tokens import KIND_ACCESS, KIND_REFRESH, hash_token, normalize_scopes, revoke_grant
from ..db import get_session
from ..deps import get_current_user
from ..models import AiToken, OAuthAuthorization, OAuthClient, User
from ..schemas import AiConnectionRead, OAuthDecision, OAuthDecisionResult, OAuthRequestRead

router = APIRouter(tags=["oauth"])

# אפליקציות מוכרות לפי כתובת ההפניה. שם שאפליקציה נותנת לעצמה בהרשמה אפשר
# לזייף, את הדומיין שאליו הקוד נשלח - לא. לכן עמוד האישור מציג את הדומיין,
# ומזהיר כשהוא לא מוכר.
KNOWN_APPS = {
    "claude.ai": "Claude",
    "claude.com": "Claude",
    "chatgpt.com": "ChatGPT",
    "chat.openai.com": "ChatGPT",
}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "[::1]", "::1"}

MAX_ACTIVE_CONNECTIONS = 20
# כמה זמן יש לאפליקציה להחליף את הקוד בטוקנים אחרי האישור
CODE_TTL = timedelta(minutes=5)


def _app_label(redirect_uri: str) -> tuple[str, str | None]:
    """(הדומיין, שם האפליקציה המוכרת או None)."""
    host = (urlparse(redirect_uri).hostname or "").lower()
    if host in LOCAL_HOSTS:
        return host, "אפליקציה במחשב שלך (למשל Claude Code)"
    for domain, name in KNOWN_APPS.items():
        if host == domain or host.endswith("." + domain):
            return host, name
    return host, None


def _pending(request_id: str, session: Session) -> tuple[OAuthAuthorization, AuthorizationParams]:
    row = session.get(OAuthAuthorization, request_id)
    if row is None or row.decided_at is not None or row.expires_at <= datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="בקשת החיבור לא נמצאה או שפג תוקפה - נסי להתחבר שוב מהאפליקציה")
    return row, AuthorizationParams.model_validate_json(row.params)


@router.get("/oauth/requests/{request_id}", response_model=OAuthRequestRead)
def get_request(
    request_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row, params = _pending(request_id, session)
    client = session.get(OAuthClient, row.client_id)
    host, known = _app_label(str(params.redirect_uri))
    return OAuthRequestRead(
        client_name=(client.client_name if client else None) or host,
        redirect_host=host,
        known_app=known,
        scopes=params.scopes or [],
        expires_at=row.expires_at,
    )


def _active_grants(user_id: int, session: Session) -> dict[str, list[AiToken]]:
    now = datetime.utcnow()
    rows = session.exec(
        select(AiToken).where(
            AiToken.user_id == user_id,
            col(AiToken.grant_id).is_not(None),
            col(AiToken.revoked_at).is_(None),
        )
    ).all()
    grants: dict[str, list[AiToken]] = {}
    for r in rows:
        grants.setdefault(r.grant_id, []).append(r)
    # חיבור פעיל = יש לו טוקן refresh בתוקף (ה-access מתחלף כל שעה)
    return {
        g: tokens
        for g, tokens in grants.items()
        if any(t.kind == KIND_REFRESH and (t.expires_at is None or t.expires_at > now) for t in tokens)
    }


@router.post("/oauth/requests/{request_id}/decision", response_model=OAuthDecisionResult)
def decide(
    request_id: str,
    payload: OAuthDecision,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    row, params = _pending(request_id, session)
    redirect_uri = str(params.redirect_uri)
    now = datetime.utcnow()
    row.decided_at = now
    row.user_id = current_user.id

    if not payload.approve:
        session.add(row)
        session.commit()
        return OAuthDecisionResult(
            redirect_to=construct_redirect_uri(
                redirect_uri, error="access_denied", error_description="the user denied access", state=params.state
            )
        )

    requested = set(params.scopes or [])
    # אפשר לאשר פחות ממה שהתבקש (למשל קריאה בלבד), לא יותר
    granted = normalize_scopes([s for s in payload.scopes if s in requested])
    if not granted:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="צריך לבחור הרשאה")
    if len(_active_grants(current_user.id, session)) >= MAX_ACTIVE_CONNECTIONS:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="יש יותר מדי חיבורים פעילים - נתקי חיבור ישן בפרופיל קודם")

    code = secrets.token_urlsafe(32)
    row.code_hash = hash_token(code)
    row.granted_scopes = " ".join(granted)
    # מכאן הבקשה מחזיקה קוד, ותוקף הקוד קצר יותר מתוקף הבקשה
    row.expires_at = now + CODE_TTL
    session.add(row)
    session.commit()
    return OAuthDecisionResult(redirect_to=construct_redirect_uri(redirect_uri, code=code, state=params.state))


@router.get("/me/ai-connections", response_model=list[AiConnectionRead])
def list_connections(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    result = []
    for grant_id, tokens in _active_grants(current_user.id, session).items():
        first = min(tokens, key=lambda t: t.created_at)
        client = session.get(OAuthClient, first.client_id) if first.client_id else None
        used = [t.last_used_at for t in tokens if t.kind == KIND_ACCESS and t.last_used_at]
        # מועד החיבור המקורי: הטוקן הוותיק ביותר בחיבור (כולל כאלה שהתחלפו)
        connected_at = session.exec(
            select(AiToken.created_at).where(AiToken.grant_id == grant_id).order_by(AiToken.created_at)
        ).first()
        result.append(
            AiConnectionRead(
                id=grant_id,
                name=(client.client_name if client else None) or first.name,
                scopes=first.scopes.split(),
                connected_at=connected_at or first.created_at,
                last_used_at=max(used) if used else None,
            )
        )
    return sorted(result, key=lambda c: c.connected_at, reverse=True)


@router.delete("/me/ai-connections/{grant_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_connection(
    grant_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    owner = session.exec(select(AiToken.user_id).where(AiToken.grant_id == grant_id)).first()
    if owner is None or owner != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="חיבור לא נמצא")
    revoke_grant(session, grant_id)
