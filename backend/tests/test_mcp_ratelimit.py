"""הגבלת קצב על נתיבי חיבור ה-AI."""

from app.mcp_server import ratelimit
from app.mcp_server.ratelimit import Limit, SlidingWindow

from .conftest import register_and_login
from .test_mcp import make_token, rpc
from .test_mcp_oauth import register_client


def test_sliding_window():
    w = SlidingWindow()
    limit = Limit(2, 60)
    assert w.hit("k", limit, now=0) == 0
    assert w.hit("k", limit, now=1) == 0
    assert w.hit("k", limit, now=2) > 0
    # מפתח אחר לא מושפע
    assert w.hit("other", limit, now=2) == 0
    # אחרי שהחלון עובר - שוב מותר
    assert w.hit("k", limit, now=61) == 0


def test_register_is_limited_per_ip(client, monkeypatch):
    monkeypatch.setitem(ratelimit.IP_LIMITS, "/register", Limit(2, 3600))
    register_client(client)
    register_client(client)
    r = client.post("/register", json={"redirect_uris": ["https://claude.ai/cb"], "token_endpoint_auth_method": "none"})
    assert r.status_code == 429
    assert int(r.headers["retry-after"]) > 0
    # כתובת אחרת (X-Forwarded-For האחרון הוא זה ש-Cloud Run מוסיף) - לא חסומה
    r = client.post(
        "/register",
        json={"redirect_uris": ["https://claude.ai/cb"], "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"]},
        headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8"},
    )
    assert r.status_code == 201, r.text


def test_mcp_is_limited_per_token(client, monkeypatch):
    monkeypatch.setattr(ratelimit, "TOKEN_LIMIT", Limit(3, 60))
    user = register_and_login(client, "busy@example.com")
    token, other = make_token(client, user), make_token(client, user)
    for _ in range(3):
        assert rpc(client, token, "tools/list").status_code == 200
    assert rpc(client, token, "tools/list").status_code == 429
    # טוקן אחר ממשיך לעבוד, וגם שאר האתר
    assert rpc(client, other, "tools/list").status_code == 200
    assert client.get("/me", headers=user["headers"]).status_code == 200


def test_client_ip_uses_last_forwarded_entry():
    scope = {"headers": [(b"x-forwarded-for", b"6.6.6.6, 9.9.9.9")], "client": ("10.0.0.1", 1)}
    assert ratelimit.client_ip(scope) == "9.9.9.9"
    assert ratelimit.client_ip({"headers": [], "client": ("10.0.0.1", 1)}) == "10.0.0.1"
