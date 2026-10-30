"""טוקנים לאפליקציות AI שמתחברות לשרת ה-MCP (ראו app/mcp_server).

טוקן = מחרוזת אקראית עם קידומת opl_. במסד נשמר רק ה-SHA-256 שלו, ולכן
אי אפשר לשחזר טוקן קיים - רק לבטל אותו וליצור חדש.
"""

import hashlib
import secrets
from datetime import datetime, timedelta

from sqlmodel import Session, select

from .models import AiToken

TOKEN_PREFIX = "opl_"
SCOPE_READ = "opuli.read"
SCOPE_WRITE = "opuli.write"
ALL_SCOPES = (SCOPE_READ, SCOPE_WRITE)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def normalize_scopes(scopes: list[str]) -> list[str]:
    """write כולל read: מי שיכולה לכתוב תמיד יכולה גם לקרוא."""
    result = {s for s in scopes if s in ALL_SCOPES}
    if SCOPE_WRITE in result:
        result.add(SCOPE_READ)
    return sorted(result)


def issue_token(
    session: Session,
    *,
    user_id: int,
    name: str,
    scopes: list[str],
    kind: str = "personal",
    client_id: str | None = None,
    expires_in: timedelta | None = None,
) -> tuple[AiToken, str]:
    """יוצר טוקן ומחזיר (הרשומה, הטוקן הגלוי). את הגלוי מציגים פעם אחת בלבד."""
    plain = TOKEN_PREFIX + secrets.token_urlsafe(32)
    now = datetime.utcnow()
    row = AiToken(
        user_id=user_id,
        token_hash=hash_token(plain),
        token_prefix=plain[:12],
        kind=kind,
        name=name,
        client_id=client_id,
        scopes=" ".join(normalize_scopes(scopes)),
        created_at=now,
        expires_at=now + expires_in if expires_in else None,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row, plain


def find_active_token(session: Session, plain: str) -> AiToken | None:
    """הטוקן התקף שתואם למחרוזת, או None (לא קיים / בוטל / פג תוקף)."""
    if not plain.startswith(TOKEN_PREFIX):
        return None
    row = session.exec(select(AiToken).where(AiToken.token_hash == hash_token(plain))).first()
    if row is None or row.revoked_at is not None:
        return None
    if row.expires_at is not None and row.expires_at <= datetime.utcnow():
        return None
    return row
