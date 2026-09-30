"""התחברות עם Google: הטוקנים נחתמים כאן במפתח RSA אמיתי, כך שבדיקת החתימה,
ה-audience והתוקף רצה במלואה - רק הורדת המפתחות הציבוריים של Google מוחלפת."""

import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app import google_auth
from app.config import settings

CLIENT_ID = "test-client.apps.googleusercontent.com"
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture(autouse=True)
def google_configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(
        google_auth._jwk_client,
        "get_signing_key_from_jwt",
        lambda token: SimpleNamespace(key=_KEY.public_key()),
    )


def google_token(key=_KEY, **overrides) -> str:
    now = int(time.time())
    claims = {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": "google-user-123",
        "email": "lihi@gmail.com",
        "email_verified": True,
        "given_name": "ליהי",
        "iat": now,
        "exp": now + 3600,
        **overrides,
    }
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test"})


def test_new_user_signs_up_with_google(client):
    r = client.post("/auth/google", json={"credential": google_token()})
    assert r.status_code == 200, r.text
    me = client.get("/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["email"] == "lihi@gmail.com"
    assert me["display_name"] == "ליהי"

    # התחברות חוזרת - אותו חשבון, לא חשבון חדש
    r2 = client.post("/auth/google", json={"credential": google_token()})
    me2 = client.get("/me", headers={"Authorization": f"Bearer {r2.json()['access_token']}"}).json()
    assert me2["id"] == me["id"]


def test_existing_password_account_is_linked_case_insensitively(client):
    r = client.post("/auth/register", json={"email": "Lihi@Gmail.com", "password": "supersecret1"})
    user_id = client.get("/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["id"]

    r = client.post("/auth/google", json={"credential": google_token()})
    assert r.status_code == 200
    me = client.get("/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()
    assert me["id"] == user_id
    # הסיסמה הקיימת ממשיכה לעבוד
    assert client.post("/auth/login", json={"email": "Lihi@Gmail.com", "password": "supersecret1"}).status_code == 200


def test_google_only_account_cannot_log_in_with_a_password(client):
    client.post("/auth/google", json={"credential": google_token()})
    for pw in ["!google-only", "", "anything"]:
        assert client.post("/auth/login", json={"email": "lihi@gmail.com", "password": pw}).status_code == 401


@pytest.mark.parametrize(
    "credential",
    [
        pytest.param(lambda: google_token(aud="someone-elses-app"), id="wrong audience"),
        pytest.param(lambda: google_token(iss="https://evil.example"), id="wrong issuer"),
        pytest.param(lambda: google_token(exp=int(time.time()) - 60), id="expired"),
        pytest.param(lambda: google_token(email_verified=False), id="unverified email"),
        pytest.param(lambda: google_token(key=_OTHER_KEY), id="not signed by google"),
        pytest.param(lambda: "not-a-jwt", id="garbage"),
    ],
)
def test_invalid_google_tokens_are_rejected(client, credential):
    r = client.post("/auth/google", json={"credential": credential()})
    assert r.status_code == 401
    assert client.post("/auth/login", json={"email": "lihi@gmail.com", "password": "x"}).status_code == 401


def test_google_login_disabled_without_client_id(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    assert client.post("/auth/google", json={"credential": google_token()}).status_code == 401
