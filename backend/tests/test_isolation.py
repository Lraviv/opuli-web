"""בידוד בין משתמשים: משתמשת אחת יוצרת נתונים מכל סוג, ומשתמשת שנייה לא רואה ולא נוגעת בהם."""

from tests.conftest import register_and_login


def _populate(client, h):
    """יוצרת תואר עם קטלוג, קורס, פריטים, מבחן, נושא, סמסטר, קישור, מפגש ותזכורת. מחזירה את המזהים."""
    deg = client.post("/degrees", json={"name": "A", "template": "cs_open_university"}, headers=h).json()
    catalog = client.get(f"/degrees/{deg['id']}/catalog", headers=h).json()
    course = client.post(f"/catalog-courses/{catalog[0]['id']}/select", json={"status": "current"}, headers=h).json()
    item = client.post(f"/courses/{course['id']}/items", json={"type": "assignment", "title": "סודי"}, headers=h).json()
    exam = client.post(f"/courses/{course['id']}/exams", json={"date_time": "2027-01-01T08:00:00"}, headers=h).json()
    topic = client.post(f"/courses/{course['id']}/topics", json={"title": "סודי"}, headers=h).json()
    semester = client.post(f"/degrees/{deg['id']}/semesters", json={"name": "סמסטר א"}, headers=h).json()
    link = client.post("/links", json={"title": "סודי", "url": "a.com", "course_id": course["id"]}, headers=h).json()
    session = client.post(
        f"/courses/{course['id']}/sessions", json={"weekday": 1, "start_time": "18:00", "end_time": "20:00"}, headers=h
    ).json()
    reminder = client.post("/reminders/", json={"title": "סודי"}, headers=h).json()
    client.put(f"/degrees/{deg['id']}/requirements", json={"requirements": [{"category": "x", "min_credits": 1}]}, headers=h)
    return dict(
        degree=deg["id"], catalog=catalog[0]["id"], course=course["id"], item=item["id"], exam=exam["id"],
        topic=topic["id"], semester=semester["id"], link=link["id"], session=session["id"], reminder=reminder["id"],
    )


def test_second_user_sees_nothing_from_first(client):
    a = register_and_login(client, "alice@example.com")["headers"]
    b = register_and_login(client, "bob@example.com")["headers"]
    ids = _populate(client, a)

    # כל רשימה "כללית" של משתמשת ב' ריקה
    for path in ["/degrees", "/courses", "/course-items", "/exams", "/sessions", "/links", "/reminders/"]:
        r = client.get(path, headers=b)
        assert r.status_code == 200 and r.json() == [], (path, r.json())

    # כל משאב ספציפי של א' - 404 לב' (לא 403, כדי לא לחשוף שהוא קיים)
    not_found = [
        ("get", f"/degrees/{ids['degree']}/catalog"),
        ("get", f"/degrees/{ids['degree']}/requirements"),
        ("get", f"/degrees/{ids['degree']}/semesters"),
        ("get", f"/courses/{ids['course']}/items"),
        ("get", f"/courses/{ids['course']}/topics"),
        ("get", f"/courses/{ids['course']}/sessions"),
        ("get", f"/links?course_id={ids['course']}"),
        ("put", f"/degrees/{ids['degree']}"),
        ("put", f"/courses/{ids['course']}"),
        ("put", f"/items/{ids['item']}"),
        ("put", f"/exams/{ids['exam']}"),
        ("put", f"/topics/{ids['topic']}"),
        ("put", f"/links/{ids['link']}"),
        ("put", f"/sessions/{ids['session']}"),
        ("put", f"/catalog-courses/{ids['catalog']}"),
        ("post", f"/catalog-courses/{ids['catalog']}/select"),
        ("delete", f"/semesters/{ids['semester']}"),
        ("delete", f"/exams/{ids['exam']}"),
        ("delete", f"/courses/{ids['course']}"),
        ("delete", f"/degrees/{ids['degree']}"),
    ]
    for method, path in not_found:
        kwargs = {"json": {}} if method in ("put", "post") else {}
        r = getattr(client, method)(path, headers=b, **kwargs)
        assert r.status_code == 404, (method, path, r.status_code)

    # תזכורת ומטלה של א' - ב' לא יכול לשנות או למחוק (403/404)
    assert client.patch(f"/reminders/{ids['reminder']}", json={"title": "x"}, headers=b).status_code in (403, 404)
    assert client.delete(f"/items/{ids['item']}", headers=b).status_code in (403, 404)

    # ובצד של א' - הכול עדיין שם
    assert len(client.get("/courses", headers=a).json()) == 1
    assert len(client.get("/reminders/", headers=a).json()) == 1
    assert len(client.get("/exams", headers=a).json()) == 1

    # ייצוא היומן של ב' לא כולל שום דבר של א'
    ics = client.get("/calendar.ics", headers=b).text
    assert "BEGIN:VEVENT" not in ics


def test_course_cannot_point_to_another_users_degree_or_semester(client):
    a = register_and_login(client, "alice2@example.com")["headers"]
    b = register_and_login(client, "bob2@example.com")["headers"]
    ids = _populate(client, a)

    # יצירה עם תואר/סמסטר של מישהו אחר - נדחית
    r = client.post("/courses", json={"name": "x", "credits": 1, "degree_id": ids["degree"]}, headers=b)
    assert r.status_code == 404
    r = client.post("/courses", json={"name": "x", "credits": 1, "semester_id": ids["semester"]}, headers=b)
    assert r.status_code == 404

    # גם בעדכון: סמסטר זר נדחה; degree_id בכלל לא ניתן לעדכון (השדה מתעלמים ממנו)
    own = client.post("/courses", json={"name": "mine", "credits": 1}, headers=b).json()
    assert client.put(f"/courses/{own['id']}", json={"semester_id": ids["semester"]}, headers=b).status_code == 404
    r = client.put(f"/courses/{own['id']}", json={"degree_id": ids["degree"]}, headers=b)
    assert r.status_code == 200 and r.json()["degree_id"] is None

    # ושיוך לתואר/סמסטר משלך עדיין עובד
    deg_b = client.post("/degrees", json={"name": "B"}, headers=b).json()["id"]
    sem_b = client.post(f"/degrees/{deg_b}/semesters", json={"name": "א"}, headers=b).json()["id"]
    assert client.post("/courses", json={"name": "y", "credits": 1, "degree_id": deg_b, "semester_id": sem_b}, headers=b).status_code == 201
    assert client.put(f"/courses/{own['id']}", json={"semester_id": sem_b}, headers=b).status_code == 200
    assert client.put(f"/courses/{own['id']}", json={"semester_id": None}, headers=b).status_code == 200


def test_api_responses_are_not_cacheable(client):
    """כל המשתמשים מבקשים אותן כתובות - תשובה אישית לא אמורה להישמר במטמון משותף."""
    h = register_and_login(client, "cache@example.com")["headers"]
    for path in ["/me", "/courses", "/degrees", "/health"]:
        r = client.get(path, headers=h)
        assert "no-store" in r.headers["cache-control"], path
        assert "Authorization" in r.headers["vary"], path
    # תשובות שקבעו Cache-Control בעצמן נשארות כמו שהן (למשל קובץ היומן)
    assert client.get("/calendar.ics", headers=h).headers["cache-control"] == "no-store"
