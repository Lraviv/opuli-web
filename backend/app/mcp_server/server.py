from contextlib import asynccontextmanager

from mcp.server.auth.middleware.auth_context import get_access_token
from mcp.server.auth.routes import create_protected_resource_routes
from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions, RevocationOptions
from mcp.server.mcpserver import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from starlette.applications import Starlette

from ..ai_tokens import ALL_SCOPES, SCOPE_READ, SCOPE_WRITE
from ..config import settings
from .oauth import OpuliOAuthProvider

INSTRUCTIONS = """\
OpuLi is a degree organizer for university students (mostly Israeli, mostly the Open University).
Call get_overview first: it returns today's date, the student's degrees, semesters and courses with ids.
Courses can be referenced by id, course code or (part of) the name; if a name is ambiguous the tool
returns the candidates - ask the student which one they meant.
All dates and times are Israel local time (Asia/Jerusalem), ISO format without offset.
Before adding or changing several items at once, show the student what you are about to write.
Answer the student in their language (usually Hebrew).
"""


async def hide_write_tools_without_scope(ctx, call_next):
    """חיבור עם הרשאת קריאה בלבד לא רואה את כלי הכתיבה ב-tools/list, כדי שה-AI
    לא ינסה להשתמש בהם. (הכלים עצמם בודקים את ההרשאה בכל מקרה - require_write.)"""
    result = await call_next(ctx)
    if ctx.method != "tools/list":
        return result
    token = get_access_token()
    if token is not None and SCOPE_WRITE in token.scopes:
        return result
    # התשובה כבר בצורת JSON (dict) בשלב הזה
    result["tools"] = [t for t in result["tools"] if (t.get("annotations") or {}).get("readOnlyHint")]
    return result

RESOURCE_URL = f"{settings.api_public_url.rstrip('/')}/mcp"

_auth = AuthSettings(
    # שרת ההרשאות (OAuth) הוא ה-API עצמו - ראו oauth.py
    issuer_url=settings.api_public_url.rstrip("/"),
    service_documentation_url=f"{settings.web_url.rstrip('/')}/ai",
    resource_server_url=RESOURCE_URL,
    validate_token_resource=True,
    required_scopes=[SCOPE_READ],
    client_registration_options=ClientRegistrationOptions(
        enabled=True, valid_scopes=list(ALL_SCOPES), default_scopes=list(ALL_SCOPES)
    ),
    revocation_options=RevocationOptions(enabled=True),
)

mcp_server = MCPServer(
    name="opuli",
    title="OpuLi",
    instructions=INSTRUCTIONS,
    website_url=settings.web_url,
    # ה-SDK מוסיף את /authorize, /token, /register, /revoke ואת ה-metadata,
    # ומאמת את ה-Bearer של /mcp דרך provider.load_access_token
    auth_server_provider=OpuliOAuthProvider(RESOURCE_URL),
    auth=_auth,
    middleware=[hide_write_tools_without_scope],
)


from . import tools, write_tools  # noqa: E402,F401  (רושם את הכלים על mcp_server)


def _advertise_all_scopes(app: Starlette) -> Starlette:
    """ה-SDK מפרסם ב-metadata של המשאב (/.well-known/oauth-protected-resource/mcp)
    רק את required_scopes, כלומר opuli.read. Claude מבקש בדיוק את מה שמופיע שם,
    ולכן קיבל הרשאת קריאה בלבד. מחליפים את הנתיב בגרסה שמפרסמת את שתי ההרשאות;
    הדרישה המינימלית לגישה נשארת opuli.read."""
    routes = create_protected_resource_routes(
        resource_url=_auth.resource_server_url,
        authorization_servers=[_auth.issuer_url],
        scopes_supported=list(ALL_SCOPES),
        resource_name="OpuLi",
        resource_documentation=_auth.service_documentation_url,
    )
    replacement = {r.path: r for r in routes}
    app.router.routes = [replacement.get(getattr(r, "path", None), r) for r in app.router.routes]
    return app


def _streamable_app() -> Starlette:
    return _advertise_all_scopes(mcp_server.streamable_http_app(
        streamable_http_path="/mcp",
        stateless_http=True,
        json_response=True,
        # הגנת DNS rebinding רלוונטית לשרתים מקומיים עם עוגיות; כאן כל בקשה
        # מאומתת ב-Bearer, וה-Host בייצור הוא הדומיין של Cloud Run
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False),
    ))


class McpApp:
    """אפליקציית ASGI שמורכבת ב-main.py. session manager של ה-SDK רץ פעם אחת
    בלבד, אז בכל lifespan (בייצור פעם אחת; בבדיקות - לכל TestClient) בונים
    אפליקציה חדשה ומריצים אותה."""

    def __init__(self) -> None:
        self._app: Starlette | None = None

    @asynccontextmanager
    async def lifespan(self):
        self._app = _streamable_app()
        async with mcp_server.session_manager.run():
            yield
        self._app = None

    async def __call__(self, scope, receive, send) -> None:
        if self._app is None:
            raise RuntimeError("MCP app used outside the application lifespan")
        await self._app(scope, receive, send)


def build_mcp_app() -> McpApp:
    return McpApp()
