from tests.conftest import register_and_login


def _course(client, h, name="אלגברה לינארית"):
    r = client.post("/courses", json={"name": name, "credits": 5}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_topics_crud_and_order(client):
    h = register_and_login(client, "topics1@example.com")["headers"]
    cid = _course(client, h)

    assert client.get(f"/courses/{cid}/topics", headers=h).json() == []

    r = client.post(f"/courses/{cid}/topics", json={"title": "  פרק 1 - וקטורים  "}, headers=h)
    assert r.status_code == 201
    first = r.json()
    assert first["title"] == "פרק 1 - וקטורים" and first["is_done"] is False

    # הדבקת רשימה: שורות ריקות מדולגות, הסדר נשמר אחרי מה שכבר קיים
    r = client.post(f"/courses/{cid}/topics/batch", json={"titles": ["פרק 2", "", "  ", "פרק 3"]}, headers=h)
    assert r.status_code == 201
    assert [t["title"] for t in r.json()] == ["פרק 2", "פרק 3"]

    topics = client.get(f"/courses/{cid}/topics", headers=h).json()
    assert [t["title"] for t in topics] == ["פרק 1 - וקטורים", "פרק 2", "פרק 3"]

    r = client.put(f"/topics/{first['id']}", json={"is_done": True, "title": "פרק 1"}, headers=h)
    assert r.status_code == 200
    assert r.json()["is_done"] is True and r.json()["title"] == "פרק 1"

    assert client.delete(f"/topics/{first['id']}", headers=h).status_code == 204
    assert len(client.get(f"/courses/{cid}/topics", headers=h).json()) == 2


def test_topics_validation(client):
    h = register_and_login(client, "topics2@example.com")["headers"]
    cid = _course(client, h)
    assert client.post(f"/courses/{cid}/topics", json={"title": "   "}, headers=h).status_code == 422
    assert client.post(f"/courses/{cid}/topics/batch", json={"titles": ["", " "]}, headers=h).status_code == 422


def test_topics_are_private(client):
    h1 = register_and_login(client, "topics3@example.com")["headers"]
    h2 = register_and_login(client, "topics4@example.com")["headers"]
    cid = _course(client, h1)
    tid = client.post(f"/courses/{cid}/topics", json={"title": "סודי"}, headers=h1).json()["id"]

    assert client.get(f"/courses/{cid}/topics", headers=h2).status_code == 404
    assert client.post(f"/courses/{cid}/topics", json={"title": "x"}, headers=h2).status_code == 404
    assert client.put(f"/topics/{tid}", json={"is_done": True}, headers=h2).status_code == 404
    assert client.delete(f"/topics/{tid}", headers=h2).status_code == 404


def test_deleting_course_deletes_topics(client):
    h = register_and_login(client, "topics5@example.com")["headers"]
    cid = _course(client, h)
    client.post(f"/courses/{cid}/topics/batch", json={"titles": ["a", "b"]}, headers=h)
    assert client.delete(f"/courses/{cid}", headers=h).status_code == 204
    assert client.get(f"/courses/{cid}/topics", headers=h).status_code == 404
