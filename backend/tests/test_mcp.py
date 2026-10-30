"""שרת ה-MCP (חיבור AI): טוקנים אישיים, אימות, בידוד בין משתמשות וכלי הקריאה."""

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlmodel import Session

from app.db import engine
from app.models import AiToken

from .conftest import register_and_login

ACCEPT = "application/json, text/event-stream"


def make_token(client, user: dict, scopes=("opuli.read",), **extra) -> str:
    r = client.post("/me/ai-tokens", json={"name": "Claude", "scopes": list(scopes), **extra}, headers=user["headers"])
    assert r.status_code == 201, r.text
    return r.json()["token"]


def rpc(client, token: str | None, method: str, params: dict | None = None):
    headers = {"Accept": ACCEPT}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = {"jsonrpc": "2.0", "id": 1, "method": method}
    if params is not None:
        body["params"] = params
    return client.post("/mcp", json=body, headers=headers)


def call(client, token: str, tool: str, **arguments) -> dict:
    """מריץ כלי ומחזיר את ה-result (structuredContent / isError / content)."""
    r = rpc(client, token, "tools/call", {"name": tool, "arguments": arguments})
    assert r.status_code == 200, r.text
    return r.json()["result"]


def data(result: dict):
    assert not result.get("isError"), result
    structured = result["structuredContent"]
    # רשימות מוחזרות עטופות ב-{"result": [...]}
    return structured.get("result", structured) if set(structured) == {"result"} else structured


def error_text(result: dict) -> str:
    assert result.get("isError"), result
    return result["content"][0]["text"]


def local(dt_utc: datetime) -> str:
    return dt_utc.replace(tzinfo=timezone.utc).astimezone(ZoneInfo("Asia/Jerusalem")).strftime("%Y-%m-%dT%H:%M")


# ---------------------------------------------------------------- טוקנים


def test_ai_token_lifecycle(client):
    user = register_and_login(client, "tokens@example.com")
    created = client.post(
        "/me/ai-tokens", json={"name": "Claude Code", "scopes": ["opuli.write"]}, headers=user["headers"]
    ).json()
    assert created["token"].startswith("opl_")
    # write כולל read
    assert created["scopes"] == ["opuli.read", "opuli.write"]

    listed = client.get("/me/ai-tokens", headers=user["headers"]).json()
    assert [t["id"] for t in listed] == [created["id"]]
    assert "token" not in listed[0]

    # הטוקן הגלוי לא נשמר במסד
    with Session(engine) as session:
        row = session.get(AiToken, created["id"])
        assert created["token"] not in (row.token_hash, row.token_prefix)

    assert client.delete(f"/me/ai-tokens/{created['id']}", headers=user["headers"]).status_code == 204
    assert client.get("/me/ai-tokens", headers=user["headers"]).json() == []
    assert rpc(client, created["token"], "tools/list").status_code == 401


def test_cannot_revoke_someone_elses_token(client):
    alice = register_and_login(client, "alice-t@example.com")
    bob = register_and_login(client, "bob-t@example.com")
    token_id = client.post("/me/ai-tokens", json={"name": "x"}, headers=alice["headers"]).json()["id"]
    assert client.delete(f"/me/ai-tokens/{token_id}", headers=bob["headers"]).status_code == 404


def test_unknown_scope_rejected(client):
    user = register_and_login(client, "scope@example.com")
    r = client.post("/me/ai-tokens", json={"name": "x", "scopes": ["admin"]}, headers=user["headers"])
    assert r.status_code == 422


# ---------------------------------------------------------------- אימות


def test_mcp_requires_valid_ai_token(client):
    user = register_and_login(client, "auth@example.com")

    r = rpc(client, None, "tools/list")
    assert r.status_code == 401
    assert "oauth-protected-resource/mcp" in r.headers["www-authenticate"]

    # טוקן ההתחברות של האתר (JWT) לא פותח את ה-MCP
    assert rpc(client, user["access_token"], "tools/list").status_code == 401
    assert rpc(client, "opl_not-a-real-token", "tools/list").status_code == 401

    token = make_token(client, user)
    assert rpc(client, token, "tools/list").status_code == 200


def test_expired_token_rejected(client):
    user = register_and_login(client, "expired@example.com")
    created = client.post("/me/ai-tokens", json={"name": "x"}, headers=user["headers"]).json()
    with Session(engine) as session:
        row = session.get(AiToken, created["id"])
        row.expires_at = datetime.utcnow() - timedelta(minutes=1)
        session.add(row)
        session.commit()
    assert rpc(client, created["token"], "tools/list").status_code == 401


def test_protected_resource_metadata(client):
    meta = client.get("/.well-known/oauth-protected-resource/mcp").json()
    assert meta["resource"] == "http://testserver/mcp"
    assert "opuli.read" in meta["scopes_supported"]


def test_lists_read_tools(client):
    token = make_token(client, register_and_login(client, "list@example.com"))
    tools = rpc(client, token, "tools/list").json()["result"]["tools"]
    names = {t["name"] for t in tools}
    assert names == {"get_overview", "list_courses", "get_course", "list_upcoming", "list_reminders", "get_schedule"}
    assert all(t["annotations"]["readOnlyHint"] for t in tools)


# ---------------------------------------------------------------- בידוד


def test_tools_only_see_own_data(client):
    alice = register_and_login(client, "alice@example.com")
    bob = register_and_login(client, "bob@example.com")
    course = client.post("/courses", json={"name": "בדידה", "credits": 6, "status": "current"}, headers=alice["headers"]).json()
    client.post("/reminders/", json={"title": "סוד של אליס"}, headers=alice["headers"])

    bob_token = make_token(client, bob)
    assert data(call(client, bob_token, "list_courses")) == []
    assert data(call(client, bob_token, "list_reminders")) == []
    assert "אין לך עדיין קורסים" in error_text(call(client, bob_token, "get_course", course=str(course["id"])))
    # גם כשלבוב יש קורסים משלו, מזהה של אליס לא נמצא
    client.post("/courses", json={"name": "אינפי", "credits": 6}, headers=bob["headers"])
    assert "לא נמצא" in error_text(call(client, bob_token, "get_course", course=str(course["id"])))
    assert "לא נמצא" in error_text(call(client, bob_token, "get_course", course="בדידה"))


# ---------------------------------------------------------------- כלי קריאה


def test_overview_average_and_credits(client):
    user = register_and_login(client, "overview@example.com")
    h = user["headers"]
    degree = client.post("/degrees", json={"name": "מדעי המחשב", "target_credits": 120}, headers=h).json()
    for name, credits, status, grade in [
        ("בדידה", 6, "done", 90),
        ("אינפי", 4, "done", 80),
        ("לינארית", 6, "done", 50),  # נכשל - לא נספר
        ("מבני נתונים", 6, "current", None),
    ]:
        client.post(
            "/courses",
            json={"name": name, "credits": credits, "status": status, "grade": grade, "degree_id": degree["id"]},
            headers=h,
        )

    overview = data(call(client, make_token(client, user), "get_overview"))
    d = overview["degrees"][0]
    assert d["credits_completed"] == 10
    assert d["average"] == round((90 * 6 + 80 * 4) / 10, 2)
    assert {c["name"] for c in overview["courses"]} == {"בדידה", "אינפי", "לינארית", "מבני נתונים"}
    assert overview["timezone"] == "Asia/Jerusalem"


def test_course_resolution_by_partial_name_and_ambiguity(client):
    user = register_and_login(client, "resolve@example.com")
    h = user["headers"]
    for name in ("אלגברה לינארית 1", "אלגברה לינארית 2", "מתמטיקה בדידה"):
        client.post("/courses", json={"name": name, "credits": 6}, headers=h)
    token = make_token(client, user)

    assert data(call(client, token, "get_course", course="בדידה"))["name"] == "מתמטיקה בדידה"
    assert data(call(client, token, "get_course", course="אלגברה לינארית 2"))["name"] == "אלגברה לינארית 2"
    message = error_text(call(client, token, "get_course", course="לינארית"))
    assert "אלגברה לינארית 1" in message and "אלגברה לינארית 2" in message


def test_get_course_details(client):
    user = register_and_login(client, "course@example.com")
    h = user["headers"]
    course = client.post("/courses", json={"name": "בדידה", "credits": 6, "status": "current"}, headers=h).json()
    due = datetime(2027, 1, 10, 20, 0)
    client.post(
        f"/courses/{course['id']}/items",
        json={"type": "assignment", "title": "ממ\"ן 11", "due_date": due.isoformat() + "Z", "weight_percent": 5, "grade": 92},
        headers=h,
    )
    client.post(f"/courses/{course['id']}/items", json={"type": "lesson", "title": "הרצאה 1"}, headers=h)
    exam_at = datetime(2027, 2, 14, 7, 0)
    client.post(f"/courses/{course['id']}/exams", json={"date_time": exam_at.isoformat() + "Z", "term": "a"}, headers=h)

    details = data(call(client, make_token(client, user), "get_course", course="בדידה"))
    assert details["url"].endswith(f"/courses/{course['id']}")
    assert details["assignments"][0]["due"] == local(due)
    assert details["assignments"][0]["grade"] == 92
    assert details["lessons"]["total"] == 1
    assert details["exams"][0]["when"] == local(exam_at) == "2027-02-14T09:00"
    assert details["exams"][0]["when_display"] == "יום ראשון 14.2.2027 09:00"
    assert details["exams"][0]["term"] == "א"


def test_list_upcoming(client):
    user = register_and_login(client, "upcoming@example.com")
    h = user["headers"]
    course = client.post("/courses", json={"name": "בדידה", "credits": 6, "status": "current"}, headers=h).json()
    now = datetime.now(timezone.utc).replace(tzinfo=None, second=0, microsecond=0)
    soon, later, past = now + timedelta(days=3), now + timedelta(days=40), now - timedelta(days=2)

    client.post(f"/courses/{course['id']}/items", json={"type": "assignment", "title": "ממ\"ן 12", "due_date": soon.isoformat() + "Z"}, headers=h)
    client.post(f"/courses/{course['id']}/items", json={"type": "assignment", "title": "ממ\"ן 13", "due_date": later.isoformat() + "Z"}, headers=h)
    client.post(f"/courses/{course['id']}/items", json={"type": "assignment", "title": "ממ\"ן 11", "due_date": past.isoformat() + "Z"}, headers=h)
    client.post(f"/courses/{course['id']}/exams", json={"date_time": (now + timedelta(days=5)).isoformat() + "Z"}, headers=h)
    client.post("/reminders/", json={"title": "לשלוח מייל למנחה", "due_date": (now + timedelta(days=1)).isoformat() + "Z"}, headers=h)

    items = data(call(client, make_token(client, user), "list_upcoming"))["items"]
    assert [(i["type"], i["title"]) for i in items] == [
        ("assignment", 'ממ"ן 11'),
        ("reminder", "לשלוח מייל למנחה"),
        ("assignment", 'ממ"ן 12'),
        ("exam", "מבחן בדידה"),
    ]
    assert items[0]["overdue"] is True and items[1]["overdue"] is False
    assert items[2]["when"] == local(soon)


def test_get_schedule(client):
    user = register_and_login(client, "schedule@example.com")
    h = user["headers"]
    course = client.post("/courses", json={"name": "בדידה", "credits": 6}, headers=h).json()
    client.post(
        f"/courses/{course['id']}/sessions",
        json={"weekday": 0, "start_time": "18:00", "end_time": "20:00", "location": "רעננה"},
        headers=h,
    )
    days = data(call(client, make_token(client, user), "get_schedule"))["days"]
    assert days[0]["weekday"] == "ראשון"
    assert days[0]["sessions"][0]["start"] == "18:00"
    assert days[0]["sessions"][0]["course"] == "בדידה"
