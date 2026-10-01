from unittest.mock import MagicMock, patch

from app.config import settings
from tests.conftest import register_and_login


def test_feedback_requires_auth(client):
    r = client.post("/feedback", json={"category": "bug", "message": "something broke"})
    assert r.status_code == 401


def test_feedback_not_configured_returns_503(client, monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "")
    tokens = register_and_login(client, "fb1@example.com")
    r = client.post("/feedback", json={"category": "bug", "message": "something broke"}, headers=tokens["headers"])
    assert r.status_code == 503


def test_feedback_sends_email(client, monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    tokens = register_and_login(client, "fb2@example.com")
    fake = MagicMock(status_code=200)
    with patch("app.routers.feedback.httpx.post", return_value=fake) as post:
        r = client.post(
            "/feedback",
            json={"category": "idea", "message": "<b>dark mode</b> please", "page": "/profile"},
            headers=tokens["headers"],
        )
    assert r.status_code == 202, r.text
    payload = post.call_args.kwargs["json"]
    assert payload["to"] == ["lihirweb@gmail.com"]
    assert payload["reply_to"] == "fb2@example.com"
    assert "&lt;b&gt;dark mode" in payload["html"]  # user input is escaped


def test_feedback_validates_message(client, monkeypatch):
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    tokens = register_and_login(client, "fb3@example.com")
    r = client.post("/feedback", json={"category": "bug", "message": ""}, headers=tokens["headers"])
    assert r.status_code == 422
