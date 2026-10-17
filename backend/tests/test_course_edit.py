from tests.conftest import register_and_login


def _course(client, h, name="מבני נתונים", credits=6, **extra):
    r = client.post("/courses", json={"name": name, "credits": credits, **extra}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_course_pass_grade_roundtrip(client):
    h = register_and_login(client, "pass@example.com")["headers"]
    course = _course(client, h)
    assert course["pass_grade"] is None

    r = client.put(f"/courses/{course['id']}", json={"pass_grade": 56}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["pass_grade"] == 56

    # null מפורש מחזיר לברירת המחדל
    r = client.put(f"/courses/{course['id']}", json={"pass_grade": None}, headers=h)
    assert r.json()["pass_grade"] is None

    assert client.put(f"/courses/{course['id']}", json={"pass_grade": 101}, headers=h).status_code == 422


def test_exam_term(client):
    h = register_and_login(client, "term@example.com")["headers"]
    course = _course(client, h)
    r = client.post(
        f"/courses/{course['id']}/exams",
        json={"date_time": "2026-11-12T09:00:00", "term": "a"},
        headers=h,
    )
    assert r.status_code == 201, r.text
    exam = r.json()
    assert exam["term"] == "a"

    r = client.put(f"/exams/{exam['id']}", json={"term": "b"}, headers=h)
    assert r.status_code == 200 and r.json()["term"] == "b"

    r = client.post(
        f"/courses/{course['id']}/exams",
        json={"date_time": "2026-11-12T09:00:00", "term": "c"},
        headers=h,
    )
    assert r.status_code == 422


def test_assignment_series_with_due_dates(client):
    h = register_and_login(client, "series@example.com")["headers"]
    course = _course(client, h)
    r = client.post(
        f"/courses/{course['id']}/items/batch-assignments",
        json={"kind": "mmn", "count": 3, "first_due_date": "2026-10-21T23:59:00", "interval_weeks": 2},
        headers=h,
    )
    assert r.status_code == 201, r.text
    dates = [i["due_date"][:10] for i in r.json()]
    assert dates == ["2026-10-21", "2026-11-04", "2026-11-18"]

    # בלי תאריך ראשון - בלי תאריכים, כמו קודם
    r = client.post(
        f"/courses/{course['id']}/items/batch-assignments",
        json={"kind": "mmh", "count": 2},
        headers=h,
    )
    assert [i["due_date"] for i in r.json()] == [None, None]
