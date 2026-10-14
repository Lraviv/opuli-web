from datetime import datetime, timedelta, timezone

import pytest

from app import email_reminders
from app.config import settings
from tests.conftest import register_and_login

SECRET = {"X-Internal-Secret": "test-internal-secret"}


@pytest.fixture()
def outbox(monkeypatch):
    sent: list[dict] = []
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_user", "bot@example.com")
    monkeypatch.setattr(settings, "smtp_password", "x")

    def fake_send(to, subject, html, text):
        sent.append({"to": to, "subject": subject, "text": text})
        return True

    monkeypatch.setattr(email_reminders, "send_email", fake_send)
    return sent


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


def _course(client, headers) -> int:
    r = client.post("/courses", json={"name": "אלגברה", "credits": 6}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_sends_one_email_per_user_and_only_once(client, outbox):
    me = register_and_login(client, "student@example.com")
    h = me["headers"]
    course_id = _course(client, h)
    client.post(f"/courses/{course_id}/items", json={"type": "assignment", "title": "ממ״ן 11", "due_date": _iso(timedelta(hours=10))}, headers=h)
    client.post(f"/courses/{course_id}/items", json={"type": "assignment", "title": "ממ״ן 12", "due_date": _iso(timedelta(days=5))}, headers=h)
    client.post(f"/courses/{course_id}/exams", json={"date_time": _iso(timedelta(hours=20))}, headers=h)
    client.post("/reminders/", json={"title": "לשלם שכר לימוד", "due_date": _iso(timedelta(minutes=2))}, headers=h)
    client.post("/reminders/", json={"title": "בעוד שבוע", "due_date": _iso(timedelta(days=7))}, headers=h)

    r = client.post("/internal/check-reminders", headers=SECRET)
    assert r.json()["email"] == {"configured": True, "emails_sent": 1, "emails_failed": 0}
    assert len(outbox) == 1
    text = outbox[0]["text"]
    assert outbox[0]["to"] == "student@example.com"
    assert "ממ״ן 11" in text and "מבחן" in text and "לשלם שכר לימוד" in text
    assert "ממ״ן 12" not in text and "בעוד שבוע" not in text

    client.post("/internal/check-reminders", headers=SECRET)
    assert len(outbox) == 1


def test_switches_turn_each_type_off(client, outbox):
    me = register_and_login(client, "quiet@example.com")
    h = me["headers"]
    r = client.patch("/me", json={"email_notify_assignments": False, "email_notify_reminders": False}, headers=h)
    assert r.json()["email_notify_assignments"] is False
    assert r.json()["email_notify_exams"] is True

    course_id = _course(client, h)
    client.post(f"/courses/{course_id}/items", json={"type": "assignment", "title": "ממ״ן 11", "due_date": _iso(timedelta(hours=3))}, headers=h)
    client.post("/reminders/", json={"title": "תזכורת", "due_date": _iso(timedelta(minutes=1))}, headers=h)
    client.post("/internal/check-reminders", headers=SECRET)
    assert outbox == []

    client.post(f"/courses/{course_id}/exams", json={"date_time": _iso(timedelta(hours=3))}, headers=h)
    client.post("/internal/check-reminders", headers=SECRET)
    assert len(outbox) == 1 and "מבחן" in outbox[0]["text"]


def test_not_configured_sends_nothing(client):
    r = client.post("/internal/check-reminders", headers=SECRET)
    assert r.json()["email"]["configured"] is False
