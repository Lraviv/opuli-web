from datetime import datetime, timedelta, timezone

from .conftest import register_and_login


def test_auth_flow(client):
    tokens = register_and_login(client, "lihi@example.com")

    r = client.get("/me", headers=tokens["headers"])
    assert r.status_code == 200
    assert r.json()["email"] == "lihi@example.com"

    r = client.post("/auth/login", json={"email": "lihi@example.com", "password": "supersecret1"})
    assert r.status_code == 200

    r = client.post("/auth/login", json={"email": "lihi@example.com", "password": "wrong"})
    assert r.status_code == 401

    r = client.post("/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 200

    r = client.post(
        "/auth/register",
        json={"email": "lihi@example.com", "password": "supersecret1"},
    )
    assert r.status_code == 409

    r = client.get("/me")
    assert r.status_code == 401


def test_degree_catalog_and_course_selection(client):
    tokens = register_and_login(client, "student@example.com")
    h = tokens["headers"]

    r = client.post(
        "/degrees",
        json={"name": "תואר ראשון במדעי המחשב", "institution": "האוניברסיטה הפתוחה", "target_credits": 120},
        headers=h,
    )
    assert r.status_code == 201
    degree_id = r.json()["id"]

    r = client.post(
        f"/degrees/{degree_id}/catalog",
        json={"name": "מבוא למדעי המחשב", "credits": 5, "category": "חובה"},
        headers=h,
    )
    assert r.status_code == 201
    catalog_course_1 = r.json()["id"]

    r = client.post(
        f"/degrees/{degree_id}/catalog",
        json={"name": "חשבון אינפיניטסימלי 1", "credits": 5.5, "category": "חובה"},
        headers=h,
    )
    assert r.status_code == 201
    catalog_course_2 = r.json()["id"]

    r = client.get(f"/degrees/{degree_id}/catalog", headers=h)
    assert r.status_code == 200
    catalog = {c["id"]: c for c in r.json()}
    assert catalog[catalog_course_1]["already_selected"] is False
    assert catalog[catalog_course_2]["already_selected"] is False

    r = client.post(
        f"/catalog-courses/{catalog_course_1}/select",
        json={"status": "planned", "semester": "סמסטר א׳ תשפ״ו"},
        headers=h,
    )
    assert r.status_code == 201
    course = r.json()
    assert course["name"] == "מבוא למדעי המחשב"
    assert course["credits"] == 5
    assert course["catalog_course_id"] == catalog_course_1
    course_id = course["id"]

    r = client.get(f"/degrees/{degree_id}/catalog", headers=h)
    catalog = {c["id"]: c for c in r.json()}
    assert catalog[catalog_course_1]["already_selected"] is True
    assert catalog[catalog_course_2]["already_selected"] is False

    # קורס ידני, לא מהקטלוג
    r = client.post(
        "/courses",
        json={"name": "קורס מוכר מתואר קודם", "credits": 3, "status": "done", "grade": 90},
        headers=h,
    )
    assert r.status_code == 201
    manual_course_id = r.json()["id"]

    r = client.get("/courses", headers=h)
    assert r.status_code == 200
    assert {c["id"] for c in r.json()} == {course_id, manual_course_id}

    r = client.get("/courses", params={"status": "done"}, headers=h)
    assert [c["id"] for c in r.json()] == [manual_course_id]

    # עדכון קורס
    r = client.put(f"/courses/{course_id}", json={"status": "current"}, headers=h)
    assert r.status_code == 200
    assert r.json()["status"] == "current"

    # פריטי התקדמות
    r = client.post(
        f"/courses/{course_id}/items",
        json={"type": "assignment", "title": "תרגיל 1", "due_date": "2026-11-01T00:00:00Z"},
        headers=h,
    )
    assert r.status_code == 201
    item_id = r.json()["id"]
    assert r.json()["is_done"] is False

    r = client.put(f"/items/{item_id}", json={"is_done": True}, headers=h)
    assert r.status_code == 200
    assert r.json()["is_done"] is True

    r = client.get(f"/courses/{course_id}/items", headers=h)
    assert len(r.json()) == 1

    # עריכת כותרת והערות
    r = client.put(f"/items/{item_id}", json={"title": "תרגיל 1 מתוקן", "notes": "להגיש בזוגות"}, headers=h)
    assert r.status_code == 200
    assert r.json()["title"] == "תרגיל 1 מתוקן"
    assert r.json()["notes"] == "להגיש בזוגות"

    # שיעור עם תאריך צפייה והערות
    r = client.post(
        f"/courses/{course_id}/items",
        json={"type": "lesson", "title": "שיעור 1", "notes": "פרק 1", "watched_at": "2026-10-01T00:00:00Z"},
        headers=h,
    )
    assert r.status_code == 201
    lesson_id = r.json()["id"]
    assert r.json()["notes"] == "פרק 1"
    assert r.json()["watched_at"].startswith("2026-10-01")
    r = client.put(f"/items/{lesson_id}", json={"watched_at": None}, headers=h)
    assert r.json()["watched_at"] is None
    r = client.delete(f"/items/{lesson_id}", headers=h)
    assert r.status_code == 204

    r = client.delete(f"/items/{item_id}", headers=h)
    assert r.status_code == 204

    r = client.get(f"/courses/{course_id}/items", headers=h)
    assert len(r.json()) == 0

    # מחיקת קורס מהקטלוג לא מוחקת את הקורס האישי, רק מנתקת
    r = client.delete(f"/catalog-courses/{catalog_course_1}", headers=h)
    assert r.status_code == 204
    r = client.get("/courses", params={"status": "current"}, headers=h)
    assert r.json()[0]["catalog_course_id"] is None

    # מחיקת התואר מנתקת את הקורס האישי הנותר, אבל לא מוחקת אותו
    r = client.delete(f"/degrees/{degree_id}", headers=h)
    assert r.status_code == 204
    r = client.get("/courses", headers=h)
    assert len(r.json()) == 2
    assert all(c["degree_id"] is None for c in r.json())


def test_exams_reminders_and_push(client, monkeypatch):
    tokens = register_and_login(client, "exams@example.com")
    h = tokens["headers"]

    r = client.post("/courses", json={"name": "אלגברה", "credits": 5, "status": "current"}, headers=h)
    course_id = r.json()["id"]

    future_time = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    r = client.post(f"/courses/{course_id}/exams", json={"date_time": future_time}, headers=h)
    assert r.status_code == 201
    exam = r.json()
    exam_id = exam["id"]
    # ברירת המחדל: יום לפני + שעתיים לפני
    assert sorted(rem["offset_minutes"] for rem in exam["reminders"]) == [120, 1440]

    r = client.get("/exams", headers=h)
    assert r.status_code == 200
    assert len(r.json()) == 1

    # מעדכנים את זמן המבחן להיות בעוד 10 דקות, עם תזכורת יחידה של 30 דקות
    # לפני - כדי שהיא "תגיע זמנה" מיד (due_at = עכשיו - 20 דקות, בעבר)
    soon = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    r = client.put(
        f"/exams/{exam_id}",
        json={"date_time": soon, "reminder_offsets_minutes": [30]},
        headers=h,
    )
    assert r.status_code == 200
    assert [rem["offset_minutes"] for rem in r.json()["reminders"]] == [30]

    r = client.post("/push-tokens", json={"expo_push_token": "ExponentPushToken[abc123]"}, headers=h)
    assert r.status_code == 201

    # לא נותנים לבדיקה לבצע קריאת רשת אמיתית ל-Expo
    sent_messages = {}

    def fake_send(messages):
        sent_messages["messages"] = messages
        return True

    monkeypatch.setattr("app.routers.internal.send_expo_push_messages", fake_send)

    r = client.post("/internal/check-reminders", headers={"X-Internal-Secret": "wrong"})
    assert r.status_code == 401

    r = client.post("/internal/check-reminders", headers={"X-Internal-Secret": "test-internal-secret"})
    assert r.status_code == 200
    body = r.json()
    assert body["due"] == 1
    assert body["messages_sent"] == 1
    assert body["skipped_past_exams"] == 0
    assert sent_messages["messages"][0]["to"] == "ExponentPushToken[abc123]"

    # הרצה שנייה - התזכורת כבר נשלחה, אז לא אמורה להישלח שוב
    r = client.post("/internal/check-reminders", headers={"X-Internal-Secret": "test-internal-secret"})
    assert r.json()["checked"] == 0

    # מחיקת המבחן מוחקת גם את התזכורות שלו
    r = client.delete(f"/exams/{exam_id}", headers=h)
    assert r.status_code == 204
    r = client.get("/exams", headers=h)
    assert r.json() == []


def test_users_cannot_access_each_others_data(client):
    tokens_a = register_and_login(client, "a@example.com")
    tokens_b = register_and_login(client, "b@example.com")

    r = client.post("/degrees", json={"name": "התואר של א׳"}, headers=tokens_a["headers"])
    degree_id = r.json()["id"]

    r = client.post("/courses", json={"name": "קורס של א׳", "credits": 3}, headers=tokens_a["headers"])
    course_id = r.json()["id"]

    # משתמשת ב׳ מנסה לגשת למשאבים של א׳ - הכול אמור להיראות "לא נמצא"
    r = client.get(f"/degrees/{degree_id}/catalog", headers=tokens_b["headers"])
    assert r.status_code == 404

    r = client.put(f"/degrees/{degree_id}", json={"name": "השתלטות"}, headers=tokens_b["headers"])
    assert r.status_code == 404

    r = client.put(f"/courses/{course_id}", json={"status": "done"}, headers=tokens_b["headers"])
    assert r.status_code == 404

    r = client.delete(f"/courses/{course_id}", headers=tokens_b["headers"])
    assert r.status_code == 404

    # ומוודאים שהמשאבים של א׳ עדיין שלמים
    r = client.get("/courses", headers=tokens_a["headers"])
    assert len(r.json()) == 1
