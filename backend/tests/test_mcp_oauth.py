"""שרת ההרשאות (OAuth) של חיבור ה-AI: הרשמת אפליקציה, אישור בעמוד /connect,
החלפת קוד בטוקנים, refresh, ביטול, ובידוד בין משתמשות."""

import base64
import hashlib
import secrets
from urllib.parse import parse_qs, urlparse

from .conftest import register_and_login
from .test_mcp import make_token, rpc

CLAUDE_REDIRECT = "https://claude.ai/api/mcp/auth_callback"
RESOURCE = "http://localhost:8000/mcp"


def register_client(client, redirect_uri=CLAUDE_REDIRECT, name="Claude") -> dict:
    r = client.post(
        "/register",
        json={
            "client_name": name,
            "redirect_uris": [redirect_uri],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "token_endpoint_auth_method": "none",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def start_authorize(client, app: dict, challenge: str, scope="opuli.read opuli.write", redirect_uri=CLAUDE_REDIRECT) -> str:
    """שולח את /authorize ומחזיר את מזהה הבקשה מהפניית /connect."""
    r = client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": app["client_id"],
            "redirect_uri": redirect_uri,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "xyz",
            "scope": scope,
            "resource": RESOURCE,
        },
        follow_redirects=False,
    )
    assert r.status_code == 302, r.text
    location = urlparse(r.headers["location"])
    assert f"{location.scheme}://{location.netloc}{location.path}" == "http://localhost:5173/connect"
    return parse_qs(location.query)["request"][0]


def approve(client, user: dict, request_id: str, scopes=("opuli.read", "opuli.write")) -> str:
    r = client.post(
        f"/oauth/requests/{request_id}/decision",
        json={"approve": True, "scopes": list(scopes)},
        headers=user["headers"],
    )
    assert r.status_code == 200, r.text
    query = parse_qs(urlparse(r.json()["redirect_to"]).query)
    assert query["state"] == ["xyz"]
    return query["code"][0]


def exchange(client, app: dict, code: str, verifier: str):
    return client.post(
        "/token",
        data={
            "grant_type": "authorization_code",
            "client_id": app["client_id"],
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": CLAUDE_REDIRECT,
            "resource": RESOURCE,
        },
    )


def refresh(client, app: dict, refresh_token: str):
    return client.post(
        "/token",
        data={"grant_type": "refresh_token", "client_id": app["client_id"], "refresh_token": refresh_token},
    )


def connect(client, user: dict, scopes=("opuli.read", "opuli.write")) -> tuple[dict, dict]:
    """תהליך חיבור מלא; מחזיר (האפליקציה, הטוקנים)."""
    app = register_client(client)
    verifier, challenge = pkce()
    request_id = start_authorize(client, app, challenge)
    code = approve(client, user, request_id, scopes)
    r = exchange(client, app, code, verifier)
    assert r.status_code == 200, r.text
    return app, r.json()


def tool_names(client, token: str) -> set[str]:
    r = rpc(client, token, "tools/list")
    assert r.status_code == 200, r.text
    return {t["name"] for t in r.json()["result"]["tools"]}


def test_authorization_server_metadata(client):
    meta = client.get("/.well-known/oauth-authorization-server").json()
    assert meta["issuer"].rstrip("/") == "http://localhost:8000"
    assert meta["authorization_endpoint"] == "http://localhost:8000/authorize"
    assert meta["token_endpoint"] == "http://localhost:8000/token"
    assert meta["registration_endpoint"] == "http://localhost:8000/register"
    assert set(meta["scopes_supported"]) == {"opuli.read", "opuli.write"}
    assert meta["code_challenge_methods_supported"] == ["S256"]
    resource = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert [u.rstrip("/") for u in resource["authorization_servers"]] == ["http://localhost:8000"]
    # Claude מבקש את ההרשאות שמופיעות כאן - חייבות להיות שתיהן, אחרת מקבלים קריאה בלבד
    assert set(resource["scopes_supported"]) == {"opuli.read", "opuli.write"}


def test_full_connect_flow(client):
    user = register_and_login(client, "oauth@example.com")
    app = register_client(client)
    verifier, challenge = pkce()
    request_id = start_authorize(client, app, challenge)

    # עמוד /connect: רק למחוברות, ומציג את האפליקציה לפי הדומיין
    assert client.get(f"/oauth/requests/{request_id}").status_code == 401
    info = client.get(f"/oauth/requests/{request_id}", headers=user["headers"]).json()
    assert info["known_app"] == "Claude"
    assert info["redirect_host"] == "claude.ai"
    assert info["scopes"] == ["opuli.read", "opuli.write"]

    code = approve(client, user, request_id)
    tokens = exchange(client, app, code, verifier).json()
    assert tokens["token_type"].lower() == "bearer"
    assert tokens["expires_in"] == 3600
    assert set(tokens["scope"].split()) == {"opuli.read", "opuli.write"}
    assert "add_reminder" in tool_names(client, tokens["access_token"])

    # הבקשה כבר נוצלה - אי אפשר לאשר אותה שוב
    assert client.get(f"/oauth/requests/{request_id}", headers=user["headers"]).status_code == 404

    # מופיע ברשימת החיבורים, לא ברשימת הטוקנים האישיים
    connections = client.get("/me/ai-connections", headers=user["headers"]).json()
    assert [c["name"] for c in connections] == ["Claude"]
    assert client.get("/me/ai-tokens", headers=user["headers"]).json() == []


def test_user_can_grant_read_only(client):
    user = register_and_login(client, "readonly@example.com")
    _, tokens = connect(client, user, scopes=("opuli.read",))
    assert tokens["scope"] == "opuli.read"
    names = tool_names(client, tokens["access_token"])
    assert "list_courses" in names and "add_reminder" not in names


def test_cannot_grant_more_than_requested(client):
    user = register_and_login(client, "more@example.com")
    app = register_client(client)
    verifier, challenge = pkce()
    request_id = start_authorize(client, app, challenge, scope="opuli.read")
    code = approve(client, user, request_id, scopes=("opuli.read", "opuli.write"))
    # write לא התבקש ולכן לא ניתן - החיבור נשאר לקריאה בלבד
    assert exchange(client, app, code, verifier).json()["scope"] == "opuli.read"


def test_deny_redirects_with_access_denied(client):
    user = register_and_login(client, "deny@example.com")
    app = register_client(client)
    _, challenge = pkce()
    request_id = start_authorize(client, app, challenge)
    r = client.post(f"/oauth/requests/{request_id}/decision", json={"approve": False}, headers=user["headers"])
    query = parse_qs(urlparse(r.json()["redirect_to"]).query)
    assert query["error"] == ["access_denied"] and query["state"] == ["xyz"]
    assert "code" not in query


def test_code_is_single_use_and_needs_pkce(client):
    user = register_and_login(client, "code@example.com")
    app = register_client(client)
    verifier, challenge = pkce()
    code = approve(client, user, start_authorize(client, app, challenge))

    assert exchange(client, app, code, "wrong-verifier-" + "x" * 40).json()["error"] == "invalid_grant"
    other_app = register_client(client, name="Other")
    assert exchange(client, other_app, code, verifier).json()["error"] == "invalid_grant"
    assert exchange(client, app, code, verifier).status_code == 200
    assert exchange(client, app, code, verifier).json()["error"] == "invalid_grant"


def test_unregistered_redirect_uri_rejected(client):
    app = register_client(client)
    _, challenge = pkce()
    r = client.get(
        "/authorize",
        params={
            "response_type": "code",
            "client_id": app["client_id"],
            "redirect_uri": "https://evil.example.com/cb",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert r.status_code == 400


def test_unknown_app_is_flagged(client):
    user = register_and_login(client, "unknown@example.com")
    app = register_client(client, redirect_uri="https://some-tool.example.com/cb", name="Claude")
    _, challenge = pkce()
    request_id = start_authorize(client, app, challenge, redirect_uri="https://some-tool.example.com/cb")
    info = client.get(f"/oauth/requests/{request_id}", headers=user["headers"]).json()
    # השם "Claude" נבחר ע"י האפליקציה עצמה - אבל הדומיין לא של Claude
    assert info["known_app"] is None
    assert info["redirect_host"] == "some-tool.example.com"


def test_refresh_rotates_and_detects_reuse(client):
    user = register_and_login(client, "refresh@example.com")
    app, first = connect(client, user)

    r = refresh(client, app, first["refresh_token"])
    assert r.status_code == 200, r.text
    second = r.json()
    assert second["refresh_token"] != first["refresh_token"]
    # הטוקנים הישנים בוטלו, החדשים עובדים
    assert rpc(client, first["access_token"], "tools/list").status_code == 401
    assert rpc(client, second["access_token"], "tools/list").status_code == 200

    # שימוש חוזר ב-refresh הישן = דליפה: כל החיבור מתבטל
    assert refresh(client, app, first["refresh_token"]).status_code == 400
    assert rpc(client, second["access_token"], "tools/list").status_code == 401
    assert refresh(client, app, second["refresh_token"]).status_code == 400
    assert client.get("/me/ai-connections", headers=user["headers"]).json() == []


def test_refresh_token_is_not_a_bearer(client):
    user = register_and_login(client, "bearer@example.com")
    _, tokens = connect(client, user)
    assert rpc(client, tokens["refresh_token"], "tools/list").status_code == 401


def test_disconnect_from_profile(client):
    user = register_and_login(client, "disconnect@example.com")
    app, tokens = connect(client, user)
    connection = client.get("/me/ai-connections", headers=user["headers"]).json()[0]

    other = register_and_login(client, "other@example.com")
    assert client.delete(f"/me/ai-connections/{connection['id']}", headers=other["headers"]).status_code == 404

    assert client.delete(f"/me/ai-connections/{connection['id']}", headers=user["headers"]).status_code == 204
    assert rpc(client, tokens["access_token"], "tools/list").status_code == 401
    assert refresh(client, app, tokens["refresh_token"]).status_code == 400


def test_revoke_endpoint_revokes_whole_connection(client):
    user = register_and_login(client, "revoke@example.com")
    app, tokens = connect(client, user)
    r = client.post("/revoke", data={"client_id": app["client_id"], "client_secret": "", "token": tokens["refresh_token"]})
    assert r.status_code == 200, r.text
    assert rpc(client, tokens["access_token"], "tools/list").status_code == 401


def test_personal_tokens_still_work(client):
    user = register_and_login(client, "personal@example.com")
    token = make_token(client, user)
    assert rpc(client, token, "tools/list").status_code == 200
    # טוקן אישי לא מופיע ברשימת החיבורים, ואי אפשר לבטל דרכה חיבור OAuth
    assert client.get("/me/ai-connections", headers=user["headers"]).json() == []
