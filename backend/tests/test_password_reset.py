from unittest.mock import MagicMock, patch

from app.config import settings
from app.routers import auth as auth_router
from tests.conftest import register_and_login


def _request_reset(client, monkeypatch, email):
    """מבקש איפוס ומחזיר את הקישור שנשלח במייל (או None אם לא נשלח)."""
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    auth_router._last_reset_sent.clear()
    with patch("app.mailer.httpx.post", return_value=MagicMock(status_code=200)) as post:
        r = client.post("/auth/forgot-password", json={"email": email})
    assert r.status_code == 202, r.text
    if not post.called:
        return None
    html_body = post.call_args.kwargs["json"]["html"]
    start = html_body.index("href='") + len("href='")
    return html_body[start : html_body.index("'", start)]


def _token(link):
    from urllib.parse import parse_qs, urlparse
    import html

    return parse_qs(urlparse(html.unescape(link)).query)["token"][0]


def test_forgot_password_full_flow(client, monkeypatch):
    register_and_login(client, "reset1@example.com", password="oldpassword1")
    link = _request_reset(client, monkeypatch, "Reset1@Example.com")  # לא תלוי רישיות
    assert link and "/reset-password?token=" in link

    r = client.post("/auth/reset-password", json={"token": _token(link), "password": "newpassword1"})
    assert r.status_code == 200 and "access_token" in r.json()

    assert client.post("/auth/login", json={"email": "reset1@example.com", "password": "oldpassword1"}).status_code == 401
    assert client.post("/auth/login", json={"email": "reset1@example.com", "password": "newpassword1"}).status_code == 200

    # הקישור חד-פעמי: אחרי שהסיסמה השתנתה הוא כבר לא תקף
    again = client.post("/auth/reset-password", json={"token": _token(link), "password": "another12"})
    assert again.status_code == 400


def test_forgot_password_unknown_email_same_response(client, monkeypatch):
    register_and_login(client, "reset2@example.com")
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    auth_router._last_reset_sent.clear()
    with patch("app.mailer.httpx.post", return_value=MagicMock(status_code=200)) as post:
        known = client.post("/auth/forgot-password", json={"email": "reset2@example.com"})
        auth_router._last_reset_sent.clear()
        unknown = client.post("/auth/forgot-password", json={"email": "nobody@example.com"})
    assert known.status_code == unknown.status_code == 202
    assert known.json() == unknown.json()
    assert post.call_count == 1  # נשלח רק לכתובת הרשומה


def test_forgot_password_cooldown(client, monkeypatch):
    register_and_login(client, "reset3@example.com")
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    auth_router._last_reset_sent.clear()
    with patch("app.mailer.httpx.post", return_value=MagicMock(status_code=200)) as post:
        client.post("/auth/forgot-password", json={"email": "reset3@example.com"})
        client.post("/auth/forgot-password", json={"email": "reset3@example.com"})
    assert post.call_count == 1


def test_forgot_password_disabled_without_mail(client, monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "")
    assert client.post("/auth/forgot-password", json={"email": "a@example.com"}).status_code == 503


def test_reset_password_rejects_bad_tokens(client):
    tokens = register_and_login(client, "reset4@example.com")
    for bad in ["not-a-token-at-all", tokens["access_token"], tokens["refresh_token"]]:
        r = client.post("/auth/reset-password", json={"token": bad, "password": "newpassword1"})
        assert r.status_code == 400, bad


def test_reset_password_validates_length(client, monkeypatch):
    register_and_login(client, "reset5@example.com")
    link = _request_reset(client, monkeypatch, "reset5@example.com")
    assert client.post("/auth/reset-password", json={"token": _token(link), "password": "short"}).status_code == 422


def test_intro_seen_flag(client):
    h = register_and_login(client, "intro@example.com")["headers"]
    assert client.get("/me", headers=h).json()["intro_seen"] is False
    assert client.patch("/me", json={"intro_seen": True}, headers=h).json()["intro_seen"] is True
    assert client.patch("/me", json={"intro_seen": None}, headers=h).json()["intro_seen"] is True
