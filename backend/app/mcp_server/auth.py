"""אימות הבקשות לשרת ה-MCP: Bearer עם טוקן מטבלת ai_tokens."""

from datetime import datetime, timedelta

import anyio.to_thread
from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.provider import AccessToken
from mcp.server.mcpserver.exceptions import ToolError
from sqlmodel import Session

from ..ai_tokens import SCOPE_WRITE, find_active_token
from ..db import engine

# לא כותבים last_used_at בכל קריאה - מספיק לדעת בערך מתי הטוקן היה בשימוש
_LAST_USED_RESOLUTION = timedelta(minutes=5)


class OpuliTokenVerifier:
    def __init__(self, resource_url: str):
        self.resource_url = resource_url

    def _verify(self, token: str) -> AccessToken | None:
        with Session(engine) as session:
            row = find_active_token(session, token)
            if row is None:
                return None
            now = datetime.utcnow()
            if row.last_used_at is None or now - row.last_used_at > _LAST_USED_RESOLUTION:
                row.last_used_at = now
                session.add(row)
                session.commit()
                session.refresh(row)
            return AccessToken(
                token=token,
                client_id=row.client_id or f"personal-{row.id}",
                scopes=row.scopes.split(),
                expires_at=int(row.expires_at.timestamp()) if row.expires_at else None,
                resource=self.resource_url,
                subject=str(row.user_id),
            )

    async def verify_token(self, token: str) -> AccessToken | None:
        return await anyio.to_thread.run_sync(self._verify, token)


def current_user_id() -> int:
    """המשתמשת שהטוקן של הבקשה הנוכחית שייך לה - המקור היחיד לזהות בכלים."""
    token = get_access_token()
    if token is None or token.subject is None:
        raise ToolError("לא מחוברת")
    return int(token.subject)


def require_write() -> None:
    token = get_access_token()
    if token is None or SCOPE_WRITE not in token.scopes:
        raise ToolError("לחיבור הזה יש הרשאת קריאה בלבד. אפשר ליצור חיבור עם הרשאת כתיבה בפרופיל באתר.")
