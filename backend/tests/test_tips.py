from tests.conftest import register_and_login


def _degree(client, h, institution="האוניברסיטה הפתוחה"):
    r = client.post("/degrees", json={"name": "מדמ\"ח", "institution": institution}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _course(client, h, code="20407", degree_id=None, name="מבני נתונים"):
    body = {"name": name, "credits": 6, "course_code": code}
    if degree_id is not None:
        body["degree_id"] = degree_id
    r = client.post("/courses", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _post(client, h, cid, body, parent_id=None):
    r = client.post(f"/courses/{cid}/tips", json={"body": body, "parent_id": parent_id}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _two_students(client):
    h1 = register_and_login(client, "noa@example.com")["headers"]
    h2 = register_and_login(client, "omer@example.com")["headers"]
    c1 = _course(client, h1, degree_id=_degree(client, h1))
    # כתיב אחר של אותו מוסד -> אותו דיון
    c2 = _course(client, h2, code=" 20407 ", degree_id=_degree(client, h2, institution='האו"פ'))
    return h1, c1, h2, c2


def test_students_share_a_discussion(client):
    h1, c1, h2, c2 = _two_students(client)
    tip = _post(client, h1, c1, "  לפתור את כל הממ\"נים לבד  ")
    assert tip["body"] == 'לפתור את כל הממ"נים לבד'
    assert tip["author"]["display_name"] == "noa" and tip["is_mine"] is True

    page = client.get(f"/courses/{c2}/tips", headers=h2).json()
    assert page["linked"] is True
    assert page["course"]["code"] == "20407" and page["course"]["participants"] == 2
    assert page["total"] == 1
    assert page["items"][0]["id"] == tip["id"] and page["items"][0]["is_mine"] is False


def test_course_without_code_is_not_linked(client):
    h = register_and_login(client, "solo@example.com")["headers"]
    cid = _course(client, h, code=None)
    assert client.get(f"/courses/{cid}/tips", headers=h).json() == {"linked": False, "course": None, "total": 0, "items": []}
    assert client.post(f"/courses/{cid}/tips", json={"body": "x"}, headers=h).status_code == 400

    # הוספת מספר קורס מחברת לדיון
    assert client.put(f"/courses/{cid}", json={"course_code": "20441"}, headers=h).status_code == 200
    assert client.get(f"/courses/{cid}/tips", headers=h).json()["linked"] is True


def test_different_institution_is_a_different_discussion(client):
    h1 = register_and_login(client, "a1@example.com")["headers"]
    h2 = register_and_login(client, "a2@example.com")["headers"]
    c1 = _course(client, h1, degree_id=_degree(client, h1))
    c2 = _course(client, h2, degree_id=_degree(client, h2, institution="הטכניון"))
    tip = _post(client, h1, c1, "עצה")
    assert client.get(f"/courses/{c2}/tips", headers=h2).json()["total"] == 0
    # ומי שלא בקורס לא יכול/ה לגעת בתגובה
    assert client.put(f"/tips/{tip['id']}/vote", json={"value": 1}, headers=h2).status_code == 404
    assert client.get(f"/tips/{tip['id']}/replies", headers=h2).status_code == 404


def test_votes_are_anonymous_and_sorting(client):
    h1, c1, h2, c2 = _two_students(client)
    h3 = register_and_login(client, "dana@example.com")["headers"]
    c3 = _course(client, h3, degree_id=_degree(client, h3))

    old = _post(client, h1, c1, "ישנה")
    mid = _post(client, h1, c1, "אמצעית")
    new = _post(client, h1, c1, "חדשה")

    # אי אפשר להצביע לעצמך
    assert client.put(f"/tips/{old['id']}/vote", json={"value": 1}, headers=h1).status_code == 400

    r = client.put(f"/tips/{old['id']}/vote", json={"value": 1}, headers=h2)
    assert r.json()["score"] == 1 and r.json()["my_vote"] == 1
    client.put(f"/tips/{old['id']}/vote", json={"value": 1}, headers=h3)
    client.put(f"/tips/{mid['id']}/vote", json={"value": -1}, headers=h2)
    # שינוי דעה וביטול
    assert client.put(f"/tips/{mid['id']}/vote", json={"value": 1}, headers=h2).json()["score"] == 1
    assert client.put(f"/tips/{mid['id']}/vote", json={"value": 0}, headers=h2).json()["score"] == 0

    def order(sort, h=h1, cid=c1):
        return [t["body"] for t in client.get(f"/courses/{cid}/tips?sort={sort}", headers=h).json()["items"]]

    # ברירת מחדל: הכי מומלצות, ובשוויון (0) - החדשה קודם
    assert order("top") == ["ישנה", "חדשה", "אמצעית"]
    assert client.get(f"/courses/{c1}/tips", headers=h1).json()["items"][0]["body"] == "ישנה"
    assert order("new") == ["חדשה", "אמצעית", "ישנה"]
    assert order("old") == ["ישנה", "אמצעית", "חדשה"]

    # המצביעים לא נחשפים: הכותבת רואה ניקוד בלבד, ו-my_vote הוא רק של מי ששואל/ת
    item = client.get(f"/courses/{c3}/tips", headers=h3).json()["items"][0]
    assert item["score"] == 2 and item["my_vote"] == 1
    assert "votes" not in item and "voters" not in item
    assert client.get(f"/courses/{c1}/tips", headers=h1).json()["items"][0]["my_vote"] == 0
    assert new["score"] == 0


def test_replies_thread_one_level(client):
    h1, c1, h2, c2 = _two_students(client)
    root = _post(client, h1, c1, "שאלה")
    r1 = _post(client, h2, c2, "תשובה 1", parent_id=root["id"])
    # תשובה לתשובה נשארת באותו שרשור עם "בתגובה ל־"
    r2 = _post(client, h1, c1, "תשובה 2", parent_id=r1["id"])
    assert r2["parent_id"] == root["id"] and r2["reply_to_name"] == "omer"
    _post(client, h2, c2, "תשובה 3", parent_id=root["id"])

    item = client.get(f"/courses/{c1}/tips", headers=h1).json()["items"][0]
    assert item["reply_count"] == 3
    assert [r["body"] for r in item["replies"]] == ["תשובה 1", "תשובה 2"]

    all_replies = client.get(f"/tips/{root['id']}/replies", headers=h2).json()
    assert [r["body"] for r in all_replies] == ["תשובה 1", "תשובה 2", "תשובה 3"]


def test_edit_and_delete(client):
    h1, c1, h2, c2 = _two_students(client)
    root = _post(client, h1, c1, "מקור")
    # רק הכותב/ת עורכ/ת ומוחק/ת
    assert client.patch(f"/tips/{root['id']}", json={"body": "x"}, headers=h2).status_code == 404
    assert client.delete(f"/tips/{root['id']}", headers=h2).status_code == 404
    r = client.patch(f"/tips/{root['id']}", json={"body": "ערוך"}, headers=h1)
    assert r.json()["body"] == "ערוך" and r.json()["edited"] is True

    reply = _post(client, h2, c2, "תשובה", parent_id=root["id"])
    # תגובה עם תשובות נשארת כ"נמחקה"
    assert client.delete(f"/tips/{root['id']}", headers=h1).status_code == 204
    item = client.get(f"/courses/{c2}/tips", headers=h2).json()["items"][0]
    assert item["deleted"] is True and item["author"] is None and item["body"] == ""
    assert client.put(f"/tips/{root['id']}/vote", json={"value": 1}, headers=h2).status_code == 404

    # מחיקת התשובה האחרונה מעלימה גם את התגובה שנמחקה
    assert client.delete(f"/tips/{reply['id']}", headers=h2).status_code == 204
    assert client.get(f"/courses/{c2}/tips", headers=h2).json()["total"] == 0


def test_validation(client):
    h = register_and_login(client, "v@example.com")["headers"]
    cid = _course(client, h)
    assert client.post(f"/courses/{cid}/tips", json={"body": "   "}, headers=h).status_code == 422
    assert client.post(f"/courses/{cid}/tips", json={"body": "א" * 2001}, headers=h).status_code == 422
    assert client.put("/tips/999/vote", json={"value": 2}, headers=h).status_code == 422


def test_rate_limit(client):
    h = register_and_login(client, "spam@example.com")["headers"]
    cid = _course(client, h)
    for i in range(20):
        _post(client, h, cid, f"תגובה {i}")
    assert client.post(f"/courses/{cid}/tips", json={"body": "עוד"}, headers=h).status_code == 429


def test_selecting_template_course_sets_code(client):
    h = register_and_login(client, "tpl@example.com")["headers"]
    did = client.post("/degrees", json={"name": "cs", "template": "cs_open_university"}, headers=h).json()["id"]
    catalog = client.get(f"/degrees/{did}/catalog", headers=h).json()
    ds = next(c for c in catalog if c["name"] == "מבני נתונים ומבוא לאלגוריתמים")
    course = client.post(f"/catalog-courses/{ds['id']}/select", json={}, headers=h).json()
    assert course["course_code"] == "20407"
    page = client.get(f"/courses/{course['id']}/tips", headers=h).json()
    assert page["course"]["institution"] == "האוניברסיטה הפתוחה"
