from tests.conftest import register_and_login
from tests.test_tips import _course, _degree


def _student(client, email, institution="האוניברסיטה הפתוחה", code="20407"):
    h = register_and_login(client, email)["headers"]
    return h, _course(client, h, code=code, degree_id=_degree(client, h, institution=institution))


def _fill(client, h, cid, weights=(15, 15, 0, 0), exam_weight=70, min_count=3):
    for i, w in enumerate(weights):
        r = client.post(
            f"/courses/{cid}/items",
            json={"type": "assignment", "title": f'ממ"ן {11 + i}', "kind": "mmn", "weight_percent": w,
                  "is_mandatory": True, "order": 11 + i, "due_date": "2026-11-01T00:00:00", "grade": 90},
            headers=h,
        )
        assert r.status_code == 201, r.text
    client.put(f"/courses/{cid}", json={"exam_weight": exam_weight, "min_assignments_count": min_count}, headers=h)


def test_no_structure_until_someone_enters_one(client):
    h1, c1 = _student(client, "maya@example.com")
    assert client.get(f"/courses/{c1}/shared-structure", headers=h1).json() is None
    assert client.post(f"/courses/{c1}/shared-structure/apply", headers=h1).status_code == 404


def test_structure_is_shared_without_dates_or_grades(client):
    h1, c1 = _student(client, "maya@example.com")
    _fill(client, h1, c1)
    h2, c2 = _student(client, "noa@example.com", institution='האו"פ')
    s = client.get(f"/courses/{c2}/shared-structure", headers=h2).json()
    assert s["entered_by"] == "maya" and s["students"] == 1
    assert [a["title"] for a in s["assignments"]] == ['ממ"ן 11', 'ממ"ן 12', 'ממ"ן 13', 'ממ"ן 14']
    assert s["assignments"][0] == {"title": 'ממ"ן 11', "kind": "mmn", "weight_percent": 15, "is_mandatory": True}
    assert s["rules"]["exam_weight"] == 70 and s["rules"]["min_assignments_count"] == 3

    items = client.post(f"/courses/{c2}/shared-structure/apply", headers=h2).json()
    assert len(items) == 4 and all(i["due_date"] is None and i["grade"] is None and not i["is_done"] for i in items)
    course = next(c for c in client.get("/courses", headers=h2).json() if c["id"] == c2)
    assert course["exam_weight"] == 70 and course["min_assignments_count"] == 3
    # פעם שנייה - כבר יש מטלות
    assert client.post(f"/courses/{c2}/shared-structure/apply", headers=h2).status_code == 409
    # המבנה שלך לא מוצע לך עצמך
    assert client.get(f"/courses/{c1}/shared-structure", headers=h1).json()["entered_by"] == "noa"


def test_most_common_structure_wins(client):
    h1, c1 = _student(client, "a@example.com")
    _fill(client, h1, c1, weights=(10, 10))
    h2, c2 = _student(client, "b@example.com")
    _fill(client, h2, c2)
    h3, c3 = _student(client, "c@example.com")
    _fill(client, h3, c3)
    h4, c4 = _student(client, "d@example.com")
    s = client.get(f"/courses/{c4}/shared-structure", headers=h4).json()
    assert s["students"] == 2 and len(s["assignments"]) == 4 and s["entered_by"] == "c"


def test_other_course_or_institution_is_not_shared(client):
    h1, c1 = _student(client, "a@example.com")
    _fill(client, h1, c1)
    h2, c2 = _student(client, "b@example.com", code="20417")
    h3, c3 = _student(client, "c@example.com", institution="הטכניון")
    assert client.get(f"/courses/{c2}/shared-structure", headers=h2).json() is None
    assert client.get(f"/courses/{c3}/shared-structure", headers=h3).json() is None
    # ואי אפשר לבקש מבנה לקורס של מישהו אחר
    assert client.get(f"/courses/{c1}/shared-structure", headers=h2).status_code == 404
