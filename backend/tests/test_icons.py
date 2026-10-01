from tests.conftest import register_and_login


def test_degree_icon_create_and_update(client):
    tokens = register_and_login(client, "icon1@example.com")
    h = tokens["headers"]
    r = client.post("/degrees", json={"name": "מדעי המחשב", "icon": "💻"}, headers=h)
    assert r.status_code == 201, r.text
    degree = r.json()
    assert degree["icon"] == "💻"

    r = client.put(f"/degrees/{degree['id']}", json={"icon": "🧮"}, headers=h)
    assert r.status_code == 200
    assert r.json()["icon"] == "🧮"

    r = client.post("/degrees", json={"name": "בלי אייקון"}, headers=h)
    assert r.json()["icon"] is None


def test_user_avatar_icon(client):
    tokens = register_and_login(client, "icon2@example.com")
    h = tokens["headers"]
    assert client.get("/me", headers=h).json()["avatar_icon"] is None

    r = client.patch("/me", json={"avatar_icon": "🦊"}, headers=h)
    assert r.status_code == 200
    assert r.json()["avatar_icon"] == "🦊"

    # חזרה לאות הראשונה
    r = client.patch("/me", json={"avatar_icon": None}, headers=h)
    assert r.json()["avatar_icon"] is None
