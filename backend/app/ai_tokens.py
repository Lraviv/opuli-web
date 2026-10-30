"""טוקנים לאפליקציות AI שמתחברות לשרת ה-MCP (ראו app/mcp_server).

טוקן = מחרוזת אקראית עם קידומת opl_. במסד נשמר רק ה-SHA-256 שלו, ולכן
אי אפשר לשחזר טוקן קיים - רק לבטל אותו וליצור חדש.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, col, select

from .models import AiToken

TOKEN_PREFIX = "opl_"
SCOPE_READ = "opuli.read"
SCOPE_WRITE = "opuli.write"
ALL_SCOPES = (SCOPE_READ, SCOPE_WRITE)

KIND_PERSONAL = "personal"
KIND_ACCESS = "access"
KIND_REFRESH = "refresh"
# טוקנים שמותר לשלוח כ-Bearer לשרת ה-MCP. טוקן refresh משמש רק להחלפה ב-/token.
BEARER_KINDS = (KIND_PERSONAL, KIND_ACCESS)


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
    kind: str = KIND_PERSONAL,
    client_id: str | None = None,
    grant_id: str | None = None,
    expires_in: timedelta | None = None,
    commit: bool = True,
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
        grant_id=grant_id,
        scopes=" ".join(normalize_scopes(scopes)),
        created_at=now,
        expires_at=now + expires_in if expires_in else None,
    )
    session.add(row)
    if commit:
        session.commit()
        session.refresh(row)
    return row, plain


def find_token(session: Session, plain: str) -> AiToken | None:
    """הרשומה שתואמת למחרוזת - גם אם בוטלה או פג תוקפה."""
    if not plain.startswith(TOKEN_PREFIX):
        return None
    return session.exec(select(AiToken).where(AiToken.token_hash == hash_token(plain))).first()


def is_active(row: AiToken) -> bool:
    if row.revoked_at is not None:
        return False
    return row.expires_at is None or row.expires_at > datetime.utcnow()


def find_active_token(session: Session, plain: str, kinds: tuple[str, ...] = BEARER_KINDS) -> AiToken | None:
    """הטוקן התקף שתואם למחרוזת, או None (לא קיים / בוטל / פג תוקף / סוג אחר)."""
    row = find_token(session, plain)
    if row is None or row.kind not in kinds or not is_active(row):
        return None
    return row


def revoke_grant(session: Session, grant_id: str) -> int:
    """מבטל את כל הטוקנים של חיבור OAuth אחד. מחזיר כמה בוטלו."""
    now = datetime.utcnow()
    rows = session.exec(
        select(AiToken).where(AiToken.grant_id == grant_id, col(AiToken.revoked_at).is_(None))
    ).all()
    for row in rows:
        row.revoked_at = now
        session.add(row)
    session.commit()
    return len(rows)


def utc_timestamp(value: datetime) -> int:
    """datetime נאיבי ב-UTC (כמו שנשמר במסד) -> unix timestamp."""
    return int(value.replace(tzinfo=timezone.utc).timestamp())
