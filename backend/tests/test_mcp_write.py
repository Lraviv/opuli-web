"""כלי הכתיבה של שרת ה-MCP: מה שנכתב דרך ה-AI מופיע באתר בדיוק כמו הוספה מהאתר."""

from datetime import datetime
from zoneinfo import ZoneInfo

from .conftest import register_and_login
from .test_mcp import call, data, error_text, make_token, rpc

IL = ZoneInfo("Asia/Jerusalem")
WRITE = ("opuli.write",)


def utc_of(local: str) -> str:
    """"2027-02-14T09:00" בשעון ישראל -> ה-ISO ב-UTC שה-API מחזיר."""
    dt = datetime.fromisoformat(local).replace(tzinfo=IL).astimezone(ZoneInfo("UTC"))
    return dt.replace(tzinfo=None).isoformat()


def setup_user(client, email="writer@example.com"):
    user = register_and_login(client, email)
    return user, make_token(client, user, scopes=WRITE)


def new_course(client, user, name="מתמטיקה בדידה", **extra):
    r = client.post("/courses", json={"name": name, "credits": 6, "status": "current", **extra}, headers=user["headers"])
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------- הרשאות


def test_read_only_token_cannot_write(client):
    user = register_and_login(client, "readonly@example.com")
    token = make_token(client, user)
    names = {t["name"] for t in rpc(client, token, "tools/list").json()["result"]["tools"]}
    assert "add_reminder" not in names and "get_overview" in names
    assert "הרשאת קריאה בלבד" in error_text(call(client, token, "add_reminder", title="x"))
    assert client.get("/reminders/", headers=user["headers"]).json() == []


def test_write_token_lists_write_tools(client):
    _, token = setup_user(client)
    names = {t["name"] for t in rpc(client, token, "tools/list").json()["result"]["tools"]}
    assert {
        "add_reminder", "update_reminder", "add_assignments", "update_assignment", "add_exam", "update_exam",
        "add_course", "update_course", "set_grade", "add_class_sessions", "update_class_session",
        "add_lessons", "mark_lessons_watched",
    } <= names


def test_cannot_touch_other_users_rows(client):
    alice, _ = setup_user(client, "alice-w@example.com")
    _, bob_token = setup_user(client, "bob-w@example.com")
    course = new_course(client, alice)
    exam = client.post(f"/courses/{course['id']}/exams", json={"date_time": "2027-02-14T07:00:00Z"}, headers=alice["headers"]).json()
    item = client.post(f"/courses/{course['id']}/items", json={"type": "assignment", "title": "ממ\"ן 11"}, headers=alice["headers"]).json()
    reminder = client.post("/reminders/", json={"title": "x"}, headers=alice["headers"]).json()
    sess = client.post(f"/courses/{course['id']}/sessions", json={"weekday": 0, "start_time": "18:00", "end_time": "20:00"}, headers=alice["headers"]).json()

    assert "לא נמצא" in error_text(call(client, bob_token, "update_exam", exam_id=exam["id"], location="x"))
    assert "לא נמצא" in error_text(call(client, bob_token, "update_assignment", assignment_id=item["id"], grade=100))
    assert "לא נמצא" in error_text(call(client, bob_token, "update_reminder", reminder_id=reminder["id"], done=True))
    assert "לא נמצא" in error_text(call(client, bob_token, "update_class_session", session_id=sess["id"], start="08:00"))
    assert client.get(f"/courses/{course['id']}/items", headers=alice["headers"]).json()[0]["grade"] is None


# ---------------------------------------------------------------- תזכורות


def test_reminders(client):
    user, token = setup_user(client)
    created = data(call(client, token, "add_reminder", title="לשלוח מייל למנחה", due="2027-01-03T10:00"))
    assert created["created"] is True
    assert created["reminder"]["due_display"] == "יום ראשון 3.1.2027 10:00"
    # כפילות לא נוצרת פעמיים
    assert data(call(client, token, "add_reminder", title="לשלוח מייל למנחה", due="2027-01-03T10:00"))["created"] is False

    site = client.get("/reminders/", headers=user["headers"]).json()
    assert len(site) == 1 and site[0]["due_date"].startswith(utc_of("2027-01-03T10:00"))

    done = data(call(client, token, "update_reminder", reminder_id=site[0]["id"], done=True))
    assert done["done"] is True
    assert client.get("/reminders/", headers=user["headers"]).json()[0]["completed_at"] is not None


def test_bad_date_is_a_tool_error(client):
    _, token = setup_user(client)
    assert "תאריך לא תקין" in error_text(call(client, token, "add_reminder", title="x", due="יום ראשון"))


# ---------------------------------------------------------------- מטלות וציונים


def test_add_assignments_batch_and_grades(client):
    user, token = setup_user(client)
    course = new_course(client, user)
    result = data(call(client, token, "add_assignments", course="בדידה", assignments=[
        {"title": 'ממ"ן 11', "due": "2026-11-20", "weight_percent": 5},
        {"title": 'ממ"ן 12', "due": "2026-12-11T23:59", "weight_percent": 5, "mandatory": True},
        {"title": "ממ״ח 01"},
    ]))
    assert [a["title"] for a in result["created"]] == ['ממ"ן 11', 'ממ"ן 12', "ממ״ח 01"]
    assert [a["kind"] for a in result["created"]] == ["mmn", "mmn", "mmh"]
    # תאריך בלי שעה = סוף היום
    assert result["created"][0]["due"] == "2026-11-20T23:59"

    again = data(call(client, token, "add_assignments", course="בדידה", assignments=[{"title": 'ממ"ן 11'}, {"title": 'ממ"ן 13'}]))
    assert again["skipped_existing"] == ['ממ"ן 11'] and [a["title"] for a in again["created"]] == ['ממ"ן 13']

    site = {i["title"]: i for i in client.get(f"/courses/{course['id']}/items", headers=user["headers"]).json()}
    assert site['ממ"ן 12']["due_date"].startswith(utc_of("2026-12-11T23:59"))
    assert site['ממ"ן 12']["is_mandatory"] is True and site['ממ"ן 12']["order"] == 12

    graded = data(call(client, token, "set_grade", course="בדידה", assignment="12", grade=88))
    assert graded["assignment"]["grade"] == 88 and graded["assignment"]["submitted"] is True

    updated = data(call(client, token, "update_assignment", assignment_id=site['ממ"ן 11']["id"], grade=95, weight_percent=10))
    assert (updated["grade"], updated["weight_percent"]) == (95, 10)
    assert "בין 0 ל-100" in error_text(call(client, token, "update_assignment", assignment_id=site['ממ"ן 11']["id"], grade=120))

    final = data(call(client, token, "set_grade", course="בדידה", grade=91))
    assert final["course"]["grade"] == 91 and final["course"]["status"] == "done"
    assert client.get("/courses", headers=user["headers"]).json()[0]["status"] == "done"


def test_ambiguous_assignment_number(client):
    user, token = setup_user(client)
    course = new_course(client, user)
    for title in ('ממ"ן 12', 'ממ"ח 12'):
        client.post(f"/courses/{course['id']}/items", json={"type": "assignment", "title": title}, headers=user["headers"])
    message = error_text(call(client, token, "set_grade", course="בדידה", assignment="12", grade=80))
    assert 'ממ"ן 12' in message and 'ממ"ח 12' in message


# ---------------------------------------------------------------- מבחנים


def test_exams(client):
    user, token = setup_user(client)
    new_course(client, user)
    exam = data(call(client, token, "add_exam", course="בדידה", when="2027-02-14T09:00", term="ב", location="רעננה"))
    assert exam["created"] is True
    assert exam["exam"]["term"] == "ב" and exam["exam"]["when_display"] == "יום ראשון 14.2.2027 09:00"
    assert data(call(client, token, "add_exam", course="בדידה", when="2027-02-14T09:00"))["created"] is False

    site = client.get("/exams", headers=user["headers"]).json()
    assert len(site) == 1
    assert site[0]["term"] == "b" and site[0]["date_time"].startswith(utc_of("2027-02-14T09:00"))
    # אותן תזכורות ברירת מחדל כמו מהאתר: יום ושעתיים לפני
    assert sorted(r["offset_minutes"] for r in site[0]["reminders"]) == [120, 1440]

    moved = data(call(client, token, "update_exam", exam_id=site[0]["id"], when="2027-02-21T13:30"))
    assert moved["when"] == "2027-02-21T13:30" and moved["location"] == "רעננה"
    assert "מועד" in error_text(call(client, token, "update_exam", exam_id=site[0]["id"], term="ג"))


# ---------------------------------------------------------------- קורסים


def test_add_course_from_catalog_and_manual(client):
    user, token = setup_user(client)
    h = user["headers"]
    degree = client.post("/degrees", json={"name": "מדעי המחשב", "template": "cs_open_university"}, headers=h).json()
    client.post(f"/degrees/{degree['id']}/semesters", json={"name": "2027א"}, headers=h)
    catalog_course = client.get(f"/degrees/{degree['id']}/catalog", headers=h).json()[0]

    added = data(call(client, token, "add_course", name=catalog_course["name"], status="current", semester="2027א"))
    assert added["from_catalog"] is True
    assert added["course"]["credits"] == catalog_course["credits"] and added["course"]["semester_id"] is not None
    assert data(call(client, token, "add_course", name=catalog_course["name"]))["created"] is False

    assert "credits" in error_text(call(client, token, "add_course", name="קורס בחירה מהטכניון"))
    manual = data(call(client, token, "add_course", name="קורס בחירה מהטכניון", credits=3, status="done", grade=85))
    assert manual["from_catalog"] is False and manual["course"]["grade"] == 85
    assert "2027א" in error_text(call(client, token, "add_course", name="משהו", credits=2, semester="2031ג"))

    site = {c["name"]: c for c in client.get("/courses", headers=h).json()}
    assert site["קורס בחירה מהטכניון"]["degree_id"] == degree["id"]

    moved = data(call(client, token, "update_course", course="קורס בחירה מהטכניון", status="current", grade=None))
    assert moved["status"] == "current"


# ---------------------------------------------------------------- מערכת שעות ושיעורים


def test_class_sessions(client):
    user, token = setup_user(client)
    new_course(client, user)
    result = data(call(client, token, "add_class_sessions", course="בדידה", sessions=[
        {"weekday": "ראשון", "start": "18:00", "end": "20:00", "location": "רעננה"},
        {"weekday": "Tuesday", "start": "17:00", "end": "19:00", "every_weeks": 2, "from_date": "2026-11-03"},
    ]))
    assert [s["weekday"] for s in result["created"]] == ["ראשון", "שלישי"]
    again = data(call(client, token, "add_class_sessions", course="בדידה", sessions=[{"weekday": "יום ראשון", "start": "18:00", "end": "20:00"}]))
    assert again["created"] == [] and len(again["skipped_existing"]) == 1

    # כל שבועיים בלי תאריך התחלה - אותה בדיקה כמו באתר
    assert error_text(call(client, token, "add_class_sessions", course="בדידה", sessions=[{"weekday": "רביעי", "start": "10:00", "end": "12:00", "every_weeks": 2}]))
    assert "שעת הסיום" in error_text(call(client, token, "update_class_session", session_id=result["created"][0]["id"], end="17:00"))

    moved = data(call(client, token, "update_class_session", session_id=result["created"][0]["id"], start="18:30", end="20:30"))
    assert (moved["start"], moved["end"]) == ("18:30", "20:30")
    assert len(client.get("/sessions", headers=user["headers"]).json()) == 2


def test_lessons(client):
    user, token = setup_user(client)
    course = new_course(client, user)
    created = data(call(client, token, "add_lessons", course="בדידה", count=4))["created"]
    assert [l["title"] for l in created] == ["שיעור 01", "שיעור 02", "שיעור 03", "שיעור 04"]
    extra = data(call(client, token, "add_lessons", course="בדידה", titles=["שיעור 04", "חזרה למבחן"]))
    assert [l["title"] for l in extra["created"]] == ["חזרה למבחן"] and extra["skipped_existing"] == ["שיעור 04"]

    watched = data(call(client, token, "mark_lessons_watched", course="בדידה", lessons=["2-3", "חזרה"]))
    assert sorted(l["title"] for l in watched["updated"]) == ["חזרה למבחן", "שיעור 02", "שיעור 03"]
    site = {i["title"]: i for i in client.get(f"/courses/{course['id']}/items", headers=user["headers"]).json()}
    assert site["שיעור 02"]["is_done"] and site["שיעור 02"]["watched_at"] is not None
    assert not site["שיעור 01"]["is_done"]
