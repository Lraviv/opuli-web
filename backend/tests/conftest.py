import os

# חייב לקרות *לפני* ה-import של app.* - כי Settings() נטען פעם אחת בזמן ה-import
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_smoke.db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("INTERNAL_SECRET", "test-internal-secret")
os.environ.setdefault("DISABLE_SCHEDULER", "1")
os.environ.setdefault("MCP_ENABLED", "1")
os.environ.setdefault("API_PUBLIC_URL", "http://localhost:8000")
os.environ.setdefault("WEB_URL", "http://localhost:5173")

import pytest
from fastapi.testclient import TestClient

from app.db import engine
from app.main import app

DB_FILE = "test_smoke.db"


def _reset_db_file():
    # משחררים חיבורים פתוחים לפני מחיקת קובץ ה-DB, אחרת sqlite עלול להישאר
    # עם handle "תקוע" לקובץ שנמחק ולזרוק "attempt to write a readonly database"
    engine.dispose()
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)


@pytest.fixture()
def client():
    _reset_db_file()
    with TestClient(app) as c:
        yield c
    _reset_db_file()


def register_and_login(client: TestClient, email: str, password: str = "supersecret1") -> dict:
    """נרשמת ומחזירה dict עם access_token/refresh_token + headers מוכנים לשימוש."""
    r = client.post(
        "/auth/register",
        json={"email": email, "password": password, "display_name": email.split("@")[0]},
    )
    assert r.status_code == 201, r.text
    tokens = r.json()
    tokens["headers"] = {"Authorization": f"Bearer {tokens['access_token']}"}
    return tokens
