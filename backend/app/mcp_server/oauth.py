"""שרת ההרשאות (OAuth 2.1) של OpuLi - כך Claude / ChatGPT מתחברים בלי להעתיק טוקן.

התהליך:
1. האפליקציה נרשמת לבד ב-/register (Dynamic Client Registration) ושולחת את
   המשתמשת ל-/authorize. ה-SDK של MCP מאמת את הפרמטרים (redirect_uri רשום,
   PKCE, scopes) וקורא ל-authorize() כאן.
2. authorize() שומר בקשה ממתינה ומפנה לעמוד /connect באתר. שם המשתמשת מחוברת
   כרגיל, רואה מי מבקש גישה ולאיזו הרשאה, ומאשרת או דוחה
   (app/routers/oauth.py).
3. אחרי אישור נוצר קוד חד-פעמי (5 דקות, CODE_TTL שם), והאפליקציה מחליפה אותו ב-/token
   בטוקן access (שעה) + refresh (90 יום, מתחלף בכל שימוש).

כל הטוקנים נשמרים כ-hash בטבלת ai_tokens, מקובצים לפי grant_id (חיבור אחד).
"""

import secrets
from datetime import datetime, timedelta

import anyio.to_thread
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    RefreshToken,
    TokenError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlmodel import Session, col, select, update

from ..ai_tokens import (
    ALL_SCOPES,
    KIND_ACCESS,
    KIND_REFRESH,
    find_active_token,
    find_token,
    hash_token,
    issue_token,
    normalize_scopes,
    revoke_grant,
    utc_timestamp,
)
from ..config import settings
from ..db import engine
from ..models import AiToken, OAuthAuthorization, OAuthClient

PENDING_TTL = timedelta(minutes=10)
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=90)

# לא כותבים last_used_at בכל קריאה - מספיק לדעת בערך מתי הטוקן היה בשימוש
_LAST_USED_RESOLUTION = timedelta(minutes=5)


def connect_url(request_id: str) -> str:
    return f"{settings.web_url.rstrip('/')}/connect?request={request_id}"


def _same_resource(a: str, b: str) -> bool:
    return a.rstrip("/") == b.rstrip("/")


class OpuliOAuthProvider:
    """מימוש OAuthAuthorizationServerProvider של ה-SDK מול המסד של OpuLi."""

    def __init__(self, resource_url: str):
        self.resource_url = resource_url

    # --- לקוחות ---

    def _get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        with Session(engine) as session:
            row = session.get(OAuthClient, client_id)
            if row is None:
                return None
            return OAuthClientInformationFull.model_validate_json(row.client_info)

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return await anyio.to_thread.run_sync(self._get_client, client_id)

    def _register_client(self, client_info: OAuthClientInformationFull) -> None:
        with Session(engine) as session:
            session.add(
                OAuthClient(
                    client_id=client_info.client_id,
                    client_name=(client_info.client_name or "")[:100] or None,
                    client_info=client_info.model_dump_json(),
                )
            )
            session.commit()

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        await anyio.to_thread.run_sync(self._register_client, client_info)

    # --- בקשת חיבור ---

    def _authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if params.resource and not _same_resource(params.resource, self.resource_url):
            raise AuthorizeError(error="invalid_request", error_description="unknown resource")
        scopes = normalize_scopes(params.scopes or (client.scope or "").split() or list(ALL_SCOPES))
        if not scopes:
            raise AuthorizeError(error="invalid_scope", error_description="no supported scope requested")
        params = params.model_copy(update={"scopes": scopes})
        request_id = secrets.token_urlsafe(24)
        now = datetime.utcnow()
        with Session(engine) as session:
            session.add(
                OAuthAuthorization(
                    id=request_id,
                    client_id=client.client_id,
                    params=params.model_dump_json(),
                    created_at=now,
                    expires_at=now + PENDING_TTL,
                )
            )
            session.commit()
        return connect_url(request_id)

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        return await anyio.to_thread.run_sync(self._authorize, client, params)

    # --- קוד -> טוקנים ---

    def _load_authorization_code(self, client: OAuthClientInformationFull, code: str) -> AuthorizationCode | None:
        with Session(engine) as session:
            row = session.exec(
                select(OAuthAuthorization).where(OAuthAuthorization.code_hash == hash_token(code))
            ).first()
            if row is None or row.client_id != client.client_id or row.consumed_at is not None:
                return None
            if row.user_id is None or row.granted_scopes is None:
                return None
            params = AuthorizationParams.model_validate_json(row.params)
            return AuthorizationCode(
                code=code,
                scopes=row.granted_scopes.split(),
                expires_at=utc_timestamp(row.expires_at),
                client_id=row.client_id,
                code_challenge=params.code_challenge,
                redirect_uri=params.redirect_uri,
                redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
                resource=self.resource_url,
                subject=str(row.user_id),
            )

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        return await anyio.to_thread.run_sync(self._load_authorization_code, client, authorization_code)

    def _issue_pair(
        self, session: Session, *, user_id: int, client: OAuthClientInformationFull, scopes: list[str], grant_id: str
    ) -> OAuthToken:
        name = (client.client_name or "אפליקציית AI")[:60]
        common = dict(user_id=user_id, name=name, scopes=scopes, client_id=client.client_id, grant_id=grant_id)
        _, access = issue_token(session, kind=KIND_ACCESS, expires_in=ACCESS_TTL, commit=False, **common)
        _, refresh = issue_token(session, kind=KIND_REFRESH, expires_in=REFRESH_TTL, commit=False, **common)
        session.commit()
        return OAuthToken(
            access_token=access,
            token_type="Bearer",
            expires_in=int(ACCESS_TTL.total_seconds()),
            scope=" ".join(normalize_scopes(scopes)),
            refresh_token=refresh,
        )

    def _exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        with Session(engine) as session:
            # סימון "נוצל" אטומי: אם שתי בקשות מגיעות עם אותו קוד, רק אחת מצליחה
            result = session.exec(
                update(OAuthAuthorization)
                .where(
                    OAuthAuthorization.code_hash == hash_token(authorization_code.code),
                    col(OAuthAuthorization.consumed_at).is_(None),
                )
                .values(consumed_at=datetime.utcnow())
            )
            if result.rowcount != 1:
                session.rollback()
                raise TokenError(error="invalid_grant", error_description="authorization code already used")
            return self._issue_pair(
                session,
                user_id=int(authorization_code.subject),
                client=client,
                scopes=authorization_code.scopes,
                grant_id=secrets.token_urlsafe(16),
            )

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        return await anyio.to_thread.run_sync(self._exchange_authorization_code, client, authorization_code)

    # --- refresh ---

    def _load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        with Session(engine) as session:
            row = find_token(session, refresh_token)
            if row is None or row.kind != KIND_REFRESH or row.client_id != client.client_id:
                return None
            if row.revoked_at is not None:
                # טוקן refresh שכבר הוחלף נשלח שוב - סימן שהוא דלף. מבטלים את כל החיבור.
                if row.grant_id:
                    revoke_grant(session, row.grant_id)
                return None
            if row.expires_at is not None and row.expires_at <= datetime.utcnow():
                return None
            return RefreshToken(
                token=refresh_token,
                client_id=row.client_id,
                scopes=row.scopes.split(),
                expires_at=utc_timestamp(row.expires_at) if row.expires_at else None,
                resource=self.resource_url,
                subject=str(row.user_id),
            )

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        return await anyio.to_thread.run_sync(self._load_refresh_token, client, refresh_token)

    def _exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        with Session(engine) as session:
            row = find_active_token(session, refresh_token.token, kinds=(KIND_REFRESH,))
            if row is None or row.grant_id is None:
                raise TokenError(error="invalid_grant", error_description="refresh token is no longer valid")
            # מחליפים את כל הטוקנים של החיבור: הישנים מתבטלים, החדשים באותו grant_id
            now = datetime.utcnow()
            old = session.exec(
                select(AiToken).where(AiToken.grant_id == row.grant_id, col(AiToken.revoked_at).is_(None))
            ).all()
            for token in old:
                token.revoked_at = now
                session.add(token)
            return self._issue_pair(
                session, user_id=row.user_id, client=client, scopes=scopes, grant_id=row.grant_id
            )

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        return await anyio.to_thread.run_sync(self._exchange_refresh_token, client, refresh_token, scopes)

    # --- אימות בקשות MCP ---

    def _load_access_token(self, token: str) -> AccessToken | None:
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
                expires_at=utc_timestamp(row.expires_at) if row.expires_at else None,
                resource=self.resource_url,
                subject=str(row.user_id),
            )

    async def load_access_token(self, token: str) -> AccessToken | None:
        return await anyio.to_thread.run_sync(self._load_access_token, token)

    # --- ביטול ---

    def _revoke_token(self, token: AccessToken | RefreshToken) -> None:
        with Session(engine) as session:
            row = find_token(session, token.token)
            if row is None:
                return
            if row.grant_id:
                revoke_grant(session, row.grant_id)
            elif row.revoked_at is None:
                row.revoked_at = datetime.utcnow()
                session.add(row)
                session.commit()

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        await anyio.to_thread.run_sync(self._revoke_token, token)
