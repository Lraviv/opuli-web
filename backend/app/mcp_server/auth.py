"""זהות והרשאות בתוך כלי ה-MCP. אימות ה-Bearer עצמו נעשה ב-oauth.py (load_access_token)."""

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.mcpserver.exceptions import ToolError

from ..ai_tokens import SCOPE_WRITE


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
