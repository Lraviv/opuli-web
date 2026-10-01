from datetime import date

from app.ical import fold_line, first_occurrence
from app.schemas import normalize_url
from tests.conftest import register_and_login


def _course(client, h, name="מבני נתונים", credits=6, **extra):
    r = client.post("/courses", json={"name": name, "credits": credits, **extra}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


# ---------------------------------------------------------------------------
# כללי ציון + סוג מטלה
# ---------------------------------------------------------------------------


def test_course_grading_rules_roundtrip(client):
    h = register_and_login(client, "rules@example.com")["headers"]
    course = _course(client, h)
    assert course["assignments_shield"] is False and course["exam_weight"] is None

    r = client.put(
        f"/courses/{course['id']}",
        json={"exam_weight": 80, "min_exam_grade": 60, "min_assignments_count": 3, "min_assignments_weight": 15, "assignments_shield": True},
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["exam_weight"] == 80 and body["min_assignments_count"] == 3 and body["assignments_shield"] is True

    # null מפורש מנקה שדה אופציונלי, אבל לא את המתג הלא-nullable
    r = client.put(f"/courses/{course['id']}", json={"exam_weight": None, "assignments_shield": None}, headers=h)
    assert r.status_code == 200
    assert r.json()["exam_weight"] is None and r.json()["assignments_shield"] is True

    assert client.put(f"/courses/{course['id']}", json={"exam_weight": 120}, headers=h).status_code == 422


def test_assignment_kind_and_batch(client):
    h = register_and_login(client, "batch@example.com")["headers"]
    cid = _course(client, h)["id"]

    r = client.post(
        f"/courses/{cid}/items",
        json={"type": "assignment", "title": 'ממ"ן 11', "kind": "mmn", "is_mandatory": True, "weight_percent": 5},
        headers=h,
    )
    assert r.status_code == 201
    item = r.json()
    assert item["kind"] == "mmn" and item["is_mandatory"] is True

    r = client.put(f"/items/{item['id']}", json={"is_mandatory": False, "kind": "mmh"}, headers=h)
    assert r.json()["is_mandatory"] is False and r.json()["kind"] == "mmh"

    r = client.post(
        f"/courses/{cid}/items/batch-assignments",
        json={"kind": "mmn", "count": 3, "weight_percent": 4, "is_mandatory": True},
        headers=h,
    )
    assert r.status_code == 201, r.text
    assert [i["title"] for i in r.json()] == ['ממ"ן 11', 'ממ"ן 12', 'ממ"ן 13']
    assert all(i["weight_percent"] == 4 and i["is_mandatory"] and i["kind"] == "mmn" for i in r.json())

    r = client.post(f"/courses/{cid}/items/batch-assignments", json={"kind": "mmh", "count": 2}, headers=h)
    assert [i["title"] for i in r.json()] == ['ממ"ח 01', 'ממ"ח 02']

    assert client.post(f"/courses/{cid}/items/batch-assignments", json={"kind": "mmn", "count": 0}, headers=h).status_code == 422

    other = register_and_login(client, "batch2@example.com")["headers"]
    assert client.post(f"/courses/{cid}/items/batch-assignments", json={"kind": "mmn", "count": 1}, headers=other).status_code == 404


# ---------------------------------------------------------------------------
# דרישות תואר
# ---------------------------------------------------------------------------


def test_degree_requirements_replace(client):
    h = register_and_login(client, "req@example.com")["headers"]
    did = client.post("/degrees", json={"name": "מדמ\"ח"}, headers=h).json()["id"]
    assert client.get(f"/degrees/{did}/requirements", headers=h).json() == []

    payload = {"requirements": [{"category": " חובה ", "min_credits": 42}, {"category": "בחירה", "min_credits": None}]}
    r = client.put(f"/degrees/{did}/requirements", json=payload, headers=h)
    assert r.status_code == 200, r.text
    assert [(x["category"], x["min_credits"], x["sort_order"]) for x in r.json()] == [("חובה", 42, 0), ("בחירה", None, 1)]

    # החלפה מלאה
    r = client.put(f"/degrees/{did}/requirements", json={"requirements": [{"category": "סמינר", "min_credits": 3}]}, headers=h)
    assert [x["category"] for x in r.json()] == ["סמינר"]

    dup = {"requirements": [{"category": "א", "min_credits": 1}, {"category": "א", "min_credits": 2}]}
    assert client.put(f"/degrees/{did}/requirements", json=dup, headers=h).status_code == 422

    other = register_and_login(client, "req2@example.com")["headers"]
    assert client.get(f"/degrees/{did}/requirements", headers=other).status_code == 404

    assert client.delete(f"/degrees/{did}", headers=h).status_code == 204


# ---------------------------------------------------------------------------
# קישורים
# ---------------------------------------------------------------------------


def test_normalize_url():
    assert normalize_url("opal.openu.ac.il") == "https://opal.openu.ac.il"
    assert normalize_url(" https://x.co/a?b=1 ") == "https://x.co/a?b=1"
    assert normalize_url("localhost:3000/x") == "https://localhost:3000/x"
    assert normalize_url("//cdn.example.com") == "https://cdn.example.com"
    for bad in ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,hi", "mailto:a@b.c", "https://", "https://a b"]:
        try:
            normalize_url(bad)
        except ValueError:
            continue
        raise AssertionError(f"should reject {bad}")


def test_links_crud_scopes_and_privacy(client):
    h = register_and_login(client, "links@example.com")["headers"]
    cid = _course(client, h)["id"]

    r = client.post("/links", json={"title": "שאילתא", "url": "sheilta.apps.openu.ac.il"}, headers=h)
    assert r.status_code == 201, r.text
    global_link = r.json()
    assert global_link["url"] == "https://sheilta.apps.openu.ac.il" and global_link["course_id"] is None

    r = client.post("/links", json={"title": "הקלטות", "url": "https://example.com/rec", "course_id": cid}, headers=h)
    course_link = r.json()
    client.post("/links", json={"title": "מאגר מבחנים", "url": "https://example.com/ex", "course_id": cid}, headers=h)

    assert [l["title"] for l in client.get("/links?scope=global", headers=h).json()] == ["שאילתא"]
    course_links = client.get(f"/links?course_id={cid}", headers=h).json()
    assert [l["title"] for l in course_links] == ["הקלטות", "מאגר מבחנים"]
    assert [l["sort_order"] for l in course_links] == [0, 1]
    assert len(client.get("/links", headers=h).json()) == 3

    assert client.post("/links", json={"title": "x", "url": "javascript:alert(1)"}, headers=h).status_code == 422

    r = client.put(f"/links/{course_link['id']}", json={"title": "הקלטות מפגשים", "url": "example.org"}, headers=h)
    assert r.json()["title"] == "הקלטות מפגשים" and r.json()["url"] == "https://example.org"
    assert client.put(f"/links/{course_link['id']}", json={"url": "javascript:x"}, headers=h).status_code == 422

    other = register_and_login(client, "links2@example.com")["headers"]
    assert client.get(f"/links?course_id={cid}", headers=other).status_code == 404
    assert client.post("/links", json={"title": "x", "url": "a.com", "course_id": cid}, headers=other).status_code == 404
    assert client.put(f"/links/{global_link['id']}", json={"title": "x"}, headers=other).status_code == 404
    assert client.delete(f"/links/{global_link['id']}", headers=other).status_code == 404
    assert client.get("/links", headers=other).json() == []

    assert client.delete(f"/links/{global_link['id']}", headers=h).status_code == 204
    # מחיקת קורס מוחקת את הקישורים שלו
    assert client.delete(f"/courses/{cid}", headers=h).status_code == 204
    assert client.get("/links", headers=h).json() == []


# ---------------------------------------------------------------------------
# מפגשים קבועים
# ---------------------------------------------------------------------------


def test_class_sessions_crud_and_validation(client):
    h = register_and_login(client, "sessions@example.com")["headers"]
    cid = _course(client, h)["id"]

    base = {"weekday": 2, "start_time": "18:00", "end_time": "20:00", "title": "מפגש הנחיה"}
    r = client.post(f"/courses/{cid}/sessions", json=base, headers=h)
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert r.json()["interval_weeks"] == 1

    bad_cases = [
        {**base, "end_time": "17:00"},
        {**base, "start_time": "25:00"},
        {**base, "weekday": 7},
        {**base, "interval_weeks": 2},  # כל שבועיים בלי תאריך עוגן
        {**base, "start_date": "2026-10-20", "end_date": "2026-10-01"},
        {**base, "start_date": "not-a-date"},
    ]
    for bad in bad_cases:
        assert client.post(f"/courses/{cid}/sessions", json=bad, headers=h).status_code == 422, bad

    r = client.post(
        f"/courses/{cid}/sessions",
        json={**base, "weekday": 4, "interval_weeks": 2, "start_date": "2026-10-22", "end_date": "2027-01-28"},
        headers=h,
    )
    assert r.status_code == 201

    assert [s["weekday"] for s in client.get("/sessions", headers=h).json()] == [2, 4]
    assert len(client.get(f"/courses/{cid}/sessions", headers=h).json()) == 2

    r = client.put(f"/sessions/{sid}", json={"location": "רעננה", "start_time": "17:30"}, headers=h)
    assert r.status_code == 200 and r.json()["location"] == "רעננה" and r.json()["start_time"] == "17:30"
    # עדכון שמשאיר צירוף לא חוקי נדחה
    assert client.put(f"/sessions/{sid}", json={"end_time": "17:00"}, headers=h).status_code == 422
    assert client.put(f"/sessions/{sid}", json={"interval_weeks": 2}, headers=h).status_code == 422

    other = register_and_login(client, "sessions2@example.com")["headers"]
    assert client.get(f"/courses/{cid}/sessions", headers=other).status_code == 404
    assert client.put(f"/sessions/{sid}", json={"location": "x"}, headers=other).status_code == 404
    assert client.delete(f"/sessions/{sid}", headers=other).status_code == 404
    assert client.get("/sessions", headers=other).json() == []

    assert client.delete(f"/sessions/{sid}", headers=h).status_code == 204
    assert client.delete(f"/courses/{cid}", headers=h).status_code == 204
    assert client.get("/sessions", headers=h).json() == []


# ---------------------------------------------------------------------------
# ייצוא ליומן
# ---------------------------------------------------------------------------


def test_ical_helpers():
    # 2026-10-04 הוא יום ראשון
    assert first_occurrence(0, date(2026, 10, 4)) == date(2026, 10, 4)
    assert first_occurrence(2, date(2026, 10, 4)) == date(2026, 10, 6)
    assert first_occurrence(0, date(2026, 10, 5)) == date(2026, 10, 11)
    folded = fold_line("SUMMARY:" + "א" * 100)
    assert all(len(part.encode("utf-8")) <= 75 for part in folded.split("\r\n"))
    assert folded.replace("\r\n ", "") == "SUMMARY:" + "א" * 100


def test_calendar_export_and_feed(client):
    h = register_and_login(client, "cal@example.com")["headers"]
    cid = _course(client, h, name="אלגברה, לינארית 1")["id"]
    client.post(f"/courses/{cid}/exams", json={"date_time": "2027-02-01T07:00:00", "location": "תל אביב"}, headers=h)
    client.post(
        f"/courses/{cid}/items",
        json={"type": "assignment", "title": 'ממ"ן 11', "due_date": "2026-11-05T22:30:00", "is_mandatory": True},
        headers=h,
    )
    done = client.post(f"/courses/{cid}/items", json={"type": "assignment", "title": "הוגשה", "due_date": "2026-11-01T00:00:00"}, headers=h).json()
    client.put(f"/items/{done['id']}", json={"is_done": True}, headers=h)
    client.post(
        f"/courses/{cid}/sessions",
        json={"weekday": 1, "start_time": "18:00", "end_time": "20:00", "interval_weeks": 2, "start_date": "2026-10-20", "end_date": "2027-01-31"},
        headers=h,
    )
    client.post("/reminders/", json={"title": "לקנות ספר", "due_date": "2026-10-10T09:00:00"}, headers=h)

    r = client.get("/calendar.ics", headers=h)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/calendar")
    assert "attachment" in r.headers["content-disposition"]
    body = r.text
    assert body.startswith("BEGIN:VCALENDAR\r\n") and body.endswith("END:VCALENDAR\r\n")
    unfolded = body.replace("\r\n ", "")
    assert "SUMMARY:מבחן: אלגברה\\, לינארית 1" in unfolded
    assert "DTSTART:20270201T070000Z" in unfolded and "DTEND:20270201T100000Z" in unfolded
    assert "TRIGGER:-PT1440M" in unfolded
    # 22:30 UTC בנובמבר (שעון חורף, UTC+2) = 00:30 בישראל למחרת -> תאריך ההגשה המקומי הוא 6.11
    assert "DTSTART;VALUE=DATE:20261106" in unfolded
    assert 'הגשה: ממ"ן 11 (חובה)' in unfolded
    assert "הוגשה" not in unfolded  # מטלה שהוגשה לא נכנסת
    # 20.10.2026 הוא יום שלישי; המפגש ביום שני -> המופע הראשון 26.10
    assert "DTSTART:20261026T180000" in unfolded
    assert "RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO;UNTIL=20270131T235959" in unfolded
    assert "SUMMARY:תזכורת: לקנות ספר" in unfolded

    # בלי התחברות - אין גישה
    assert client.get("/calendar.ics").status_code == 401

    # כתובת מנוי
    assert client.get("/me", headers=h).json()["calendar_token"] is None
    r = client.post("/me/calendar-token", headers=h)
    assert r.status_code == 200
    token, path = r.json()["token"], r.json()["path"]
    assert path == f"/calendar/feed/{token}.ics"
    assert client.get("/me", headers=h).json()["calendar_token"] == token
    feed = client.get(path)
    assert feed.status_code == 200 and "BEGIN:VCALENDAR" in feed.text and "content-disposition" not in feed.headers

    # החלפה מבטלת את הכתובת הקודמת
    new_path = client.post("/me/calendar-token", headers=h).json()["path"]
    assert client.get(path).status_code == 404
    assert client.get(new_path).status_code == 200

    assert client.delete("/me/calendar-token", headers=h).status_code == 204
    assert client.get(new_path).status_code == 404
    assert client.get("/calendar/feed/short.ics").status_code == 404
