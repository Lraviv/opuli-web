from datetime import datetime, timedelta

from app.config import settings
from tests.conftest import register_and_login


def _degree(client, h, institution="האוניברסיטה הפתוחה"):
    r = client.post("/degrees", json={"name": "מדמ\"ח", "institution": institution}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _student(client, email, institution="האוניברסיטה הפתוחה"):
    h = register_and_login(client, email)["headers"]
    if institution is not None:
        _degree(client, h, institution)
    return h


def _post(client, h, **kw):
    body = {"category": "tip", "title": "כותרת", "body": "גוף"}
    body.update(kw)
    r = client.post("/forum/posts", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _future(days=3):
    return (datetime.utcnow() + timedelta(days=days)).isoformat() + "Z"


def _event(client, h, **kw):
    return _post(
        client,
        h,
        category="study",
        title="קבוצת לימוד",
        event_starts_at=_future(),
        place_public="זום",
        place_private="https://zoom.example/abc",
        **kw,
    )


def test_feed_is_per_institution(client):
    h1 = _student(client, "noa@example.com")
    # כתיב אחר של אותו מוסד -> אותו פורום
    h2 = _student(client, "omer@example.com", institution='האו"פ')
    h3 = _student(client, "tal@example.com", institution="הטכניון")
    h4 = _student(client, "solo@example.com", institution=None)

    post = _post(client, h1, title="  איך שורדים סמסטר  ")
    assert post["title"] == "איך שורדים סמסטר" and post["is_mine"] is True
    assert post["author"]["display_name"] == "noa"

    page = client.get("/forum/posts", headers=h2).json()
    assert page["linked"] is True and page["institution"] == "האוניברסיטה הפתוחה"
    assert page["total"] == 1 and page["items"][0]["is_mine"] is False

    assert client.get("/forum/posts", headers=h3).json()["total"] == 0
    assert client.get(f"/forum/posts/{post['id']}", headers=h3).status_code == 404

    assert client.get("/forum/posts", headers=h4).json()["linked"] is False
    r = client.post("/forum/posts", json={"category": "tip", "title": "x", "body": "y"}, headers=h4)
    assert r.status_code == 400


def test_filters_search_and_sort(client):
    h1 = _student(client, "a@example.com")
    h2 = _student(client, "b@example.com")
    q = _post(client, h1, category="question", title="שאלה על סמינר")
    t = _post(client, h1, title="עצה", body="לעבור על מבחנים קודמים")
    client.put(f"/forum/posts/{q['id']}/vote", json={"value": 1}, headers=h2)

    def titles(params):
        return [p["title"] for p in client.get(f"/forum/posts?{params}", headers=h2).json()["items"]]

    assert titles("") == ["עצה", "שאלה על סמינר"]
    assert titles("sort=top") == ["שאלה על סמינר", "עצה"]
    assert titles("category=question") == ["שאלה על סמינר"]
    assert titles("q=מבחנים") == ["עצה"]

    client.put(f"/forum/posts/{t['id']}/save", json={"value": True}, headers=h2)
    assert titles("saved=true") == ["עצה"]


def test_event_requires_date_and_place(client):
    h = _student(client, "org@example.com")
    r = client.post("/forum/posts", json={"category": "party", "title": "מסיבה", "body": "בואו"}, headers=h)
    assert r.status_code == 422
    past = (datetime.utcnow() - timedelta(days=1)).isoformat() + "Z"
    r = client.post(
        "/forum/posts",
        json={"category": "party", "title": "מסיבה", "body": "בואו", "event_starts_at": past, "place_public": "תל אביב"},
        headers=h,
    )
    assert r.status_code == 400
    # לפוסט רגיל פרטי אירוע פשוט לא נשמרים
    tip = _post(client, h, event_starts_at=_future(), place_public="x")
    assert tip["event"] is None


def test_rsvp_hides_address_and_only_organizer_sees_emails(client):
    org = _student(client, "org@example.com")
    guest = _student(client, "guest@example.com")
    other = _student(client, "other@example.com")
    ev = _event(client, org)
    assert ev["event"]["place_private"] == "https://zoom.example/abc"

    seen = client.get(f"/forum/posts/{ev['id']}", headers=guest).json()["post"]["event"]
    assert seen["place_public"] == "זום" and seen["place_private"] is None and seen["going_count"] == 0

    r = client.put(f"/forum/posts/{ev['id']}/rsvp", headers=guest)
    assert r.status_code == 200
    assert r.json()["event"]["i_am_going"] is True
    assert r.json()["event"]["place_private"] == "https://zoom.example/abc"
    assert r.json()["event"]["going_count"] == 1
    # פעמיים לא נספר פעמיים, ולמארגן/ת אין צורך לאשר
    assert client.put(f"/forum/posts/{ev['id']}/rsvp", headers=guest).json()["event"]["going_count"] == 1
    assert client.put(f"/forum/posts/{ev['id']}/rsvp", headers=org).status_code == 400

    attendees = client.get(f"/forum/posts/{ev['id']}/attendees", headers=org).json()
    assert [(a["display_name"], a["email"]) for a in attendees] == [("guest", "guest@example.com")]
    assert client.get(f"/forum/posts/{ev['id']}/attendees", headers=guest).status_code == 404
    assert client.get(f"/forum/posts/{ev['id']}/attendees", headers=other).status_code == 404
    # המיילים לא מופיעים בשום מקום אחר
    assert "guest@example.com" not in client.get("/forum/posts", headers=other).text

    r = client.delete(f"/forum/posts/{ev['id']}/rsvp", headers=guest)
    assert r.json()["event"]["going_count"] == 0 and r.json()["event"]["place_private"] is None
    assert client.get(f"/forum/posts/{ev['id']}/attendees", headers=org).json() == []

    upcoming = client.get("/forum/events/upcoming", headers=other).json()
    assert [p["id"] for p in upcoming] == [ev["id"]]


def test_votes_are_anonymous(client):
    h1 = _student(client, "a@example.com")
    h2 = _student(client, "b@example.com")
    p = _post(client, h1)
    assert client.put(f"/forum/posts/{p['id']}/vote", json={"value": 1}, headers=h1).status_code == 400
    r = client.put(f"/forum/posts/{p['id']}/vote", json={"value": 1}, headers=h2).json()
    assert r["score"] == 1 and r["voted"] is True
    assert client.put(f"/forum/posts/{p['id']}/vote", json={"value": 1}, headers=h2).json()["score"] == 1
    mine = client.get("/forum/posts", headers=h1).json()["items"][0]
    assert mine["score"] == 1 and mine["voted"] is False and "voters" not in mine
    assert client.put(f"/forum/posts/{p['id']}/vote", json={"value": 0}, headers=h2).json()["score"] == 0


def test_comments_thread_and_delete(client):
    h1 = _student(client, "noa@example.com")
    h2 = _student(client, "omer@example.com")
    p = _post(client, h1)
    c1 = client.post(f"/forum/posts/{p['id']}/comments", json={"body": "תגובה"}, headers=h2).json()
    c2 = client.post(f"/forum/posts/{p['id']}/comments", json={"body": "תשובה", "parent_id": c1["id"]}, headers=h1).json()
    # תשובה לתשובה נשארת באותו שרשור
    c3 = client.post(f"/forum/posts/{p['id']}/comments", json={"body": "ועוד", "parent_id": c2["id"]}, headers=h2).json()
    assert c3["parent_id"] == c1["id"] and c3["reply_to_name"] == "noa"

    detail = client.get(f"/forum/posts/{p['id']}", headers=h2).json()
    assert detail["post"]["comment_count"] == 3
    assert [r["body"] for r in detail["comments"][0]["replies"]] == ["תשובה", "ועוד"]

    # רק הכותב/ת עורכ/ת ומוחק/ת
    assert client.patch(f"/forum/comments/{c1['id']}", json={"body": "x"}, headers=h1).status_code == 404
    assert client.patch(f"/forum/comments/{c1['id']}", json={"body": "ערוך"}, headers=h2).json()["edited"] is True

    # תגובה עם תשובות נשארת כ"נמחקה"
    assert client.delete(f"/forum/comments/{c1['id']}", headers=h2).status_code == 204
    root = client.get(f"/forum/posts/{p['id']}", headers=h1).json()["comments"][0]
    assert root["deleted"] is True and root["author"] is None

    # פוסט עם תגובות נשאר כ"נמחק", ובלי תגובות נמחק לגמרי
    assert client.delete(f"/forum/posts/{p['id']}", headers=h2).status_code == 404
    assert client.delete(f"/forum/posts/{p['id']}", headers=h1).status_code == 204
    gone = client.get(f"/forum/posts/{p['id']}", headers=h2).json()["post"]
    assert gone["deleted"] is True and gone["title"] == "" and gone["author"] is None


def test_delete_post_with_votes_rsvps_and_saves(client):
    # כמו הבאג של PR #7 בעצות: ב-Postgres מפתח זר נכשל אם מוחקים את הפוסט לפני הילדים
    org = _student(client, "org@example.com")
    guest = _student(client, "guest@example.com")
    ev = _event(client, org)
    client.put(f"/forum/posts/{ev['id']}/vote", json={"value": 1}, headers=guest)
    client.put(f"/forum/posts/{ev['id']}/rsvp", headers=guest)
    client.put(f"/forum/posts/{ev['id']}/save", json={"value": True}, headers=guest)
    client.post("/forum/reports", json={"target_type": "post", "target_id": ev["id"]}, headers=guest)
    assert client.delete(f"/forum/posts/{ev['id']}", headers=org).status_code == 204
    assert client.get(f"/forum/posts/{ev['id']}", headers=guest).status_code == 404


def test_edit_post(client):
    h1 = _student(client, "a@example.com")
    h2 = _student(client, "b@example.com")
    ev = _event(client, h1)
    assert client.patch(f"/forum/posts/{ev['id']}", json={"title": "x"}, headers=h2).status_code == 404
    r = client.patch(f"/forum/posts/{ev['id']}", json={"title": "קבוצה חדשה", "place_public": "רעננה"}, headers=h1)
    assert r.json()["title"] == "קבוצה חדשה" and r.json()["event"]["place_public"] == "רעננה"
    assert r.json()["edited"] is True
    tip = _post(client, h1)
    assert client.patch(f"/forum/posts/{tip['id']}", json={"place_public": "x"}, headers=h1).status_code == 400


def test_reports_hide_after_three(client, monkeypatch):
    author = _student(client, "author@example.com")
    p = _post(client, author)
    reporters = [_student(client, f"r{i}@example.com") for i in range(3)]
    assert client.post("/forum/reports", json={"target_type": "post", "target_id": p["id"]}, headers=author).status_code == 400
    for h in reporters[:2]:
        assert client.post("/forum/reports", json={"target_type": "post", "target_id": p["id"]}, headers=h).status_code == 202
    # דיווח כפול לא נספר
    r = client.post("/forum/reports", json={"target_type": "post", "target_id": p["id"]}, headers=reporters[0])
    assert r.json()["status"] == "already_reported"
    assert client.get("/forum/posts", headers=author).json()["total"] == 1

    client.post("/forum/reports", json={"target_type": "post", "target_id": p["id"]}, headers=reporters[2])
    assert client.get("/forum/posts", headers=author).json()["total"] == 0

    # מנהלת רואה את הפוסט המוסתר ויכולה להחזיר אותו
    monkeypatch.setattr(settings, "admin_emails", "r0@example.com")
    page = client.get("/forum/posts", headers=reporters[0]).json()
    assert page["is_admin"] is True and page["items"][0]["hidden"] is True
    assert client.put(f"/forum/posts/{p['id']}/hide", json={"value": False}, headers=reporters[0]).status_code == 200
    assert client.get("/forum/posts", headers=author).json()["total"] == 1


def test_pin_is_admin_only(client, monkeypatch):
    h1 = _student(client, "a@example.com")
    h2 = _student(client, "lihi@example.com")
    first = _post(client, h1, title="ראשון")
    _post(client, h1, title="שני")
    assert client.put(f"/forum/posts/{first['id']}/pin", json={"value": True}, headers=h2).status_code == 403
    monkeypatch.setattr(settings, "admin_emails", " Lihi@example.com ,x@example.com")
    assert client.put(f"/forum/posts/{first['id']}/pin", json={"value": True}, headers=h2).json()["pinned"] is True
    assert [p["title"] for p in client.get("/forum/posts", headers=h1).json()["items"]] == ["ראשון", "שני"]


def test_course_tag_and_activity(client):
    h = _student(client, "a@example.com")
    r = client.post("/courses", json={"name": "מבני נתונים", "credits": 6, "course_code": "20407"}, headers=h)
    cid = r.json()["id"]
    p = _post(client, h, course_id=cid)
    assert p["course"] == {"code": "20407", "name": "מבני נתונים"}
    _post(client, h)
    assert [x["id"] for x in client.get(f"/forum/posts?course_id={cid}", headers=h).json()["items"]] == [p["id"]]
    assert client.get("/forum/my-courses", headers=h).json() == [{"course_id": cid, "name": "מבני נתונים", "post_count": 1}]


def test_rate_limit(client, monkeypatch):
    import app.routers.forum as forum

    monkeypatch.setattr(forum, "POSTS_PER_HOUR", 2)
    h = _student(client, "spam@example.com")
    _post(client, h)
    _post(client, h)
    r = client.post("/forum/posts", json={"category": "tip", "title": "x", "body": "y"}, headers=h)
    assert r.status_code == 429
