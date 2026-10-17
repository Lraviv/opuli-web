from app.ou_course_info import COURSE_INFO, get_course_info
from tests.conftest import register_and_login


def test_same_semesters_both_years_means_every_year():
    info = get_course_info("20109")  # אלגברה לינארית 1: א, ב, ג ב-2027 וב-2028
    assert info.every_year and info.semesters == ("א", "ב", "ג")
    assert info.schedule_label == "סמסטרים א, ב, ג"
    assert info.subjects == ("מתמטיקה",)


def test_irregular_and_missing_semesters_are_shown_as_listed():
    assert get_course_info("20948").schedule_label == "א2027 בלבד"
    assert get_course_info("20944").schedule_label == "א2027, ב2027, א2028 בלבד"
    assert not get_course_info("20944").every_year
    assert get_course_info("22999").schedule_label == "לא מתוכנן ב-2027-2028"


def test_prerequisites_and_subjects():
    assert get_course_info("20554").has_prerequisites is True
    assert get_course_info("20441").has_prerequisites is False
    assert get_course_info("20277").subjects == ("הנדסת תוכנה", "מדעי המחשב")
    assert get_course_info("99999") is None and get_course_info(None) is None


def test_every_cs_template_course_has_info():
    from app.catalog_templates import TEMPLATES

    missing = [c.code for c in TEMPLATES["cs_open_university"].courses if c.code not in COURSE_INFO]
    assert missing == []


def test_info_in_catalog_and_course_responses(client):
    h = register_and_login(client, "info@example.com")["headers"]
    did = client.post("/degrees", json={"name": "cs", "template": "cs_open_university"}, headers=h).json()["id"]
    catalog = client.get(f"/degrees/{did}/catalog", headers=h).json()
    algo = next(c for c in catalog if c["name"] == "אלגוריתמים")
    assert algo["info"]["schedule_label"] == "סמסטרים א, ב"
    assert algo["info"]["subjects"] == ["מדעי המחשב"]
    course = client.post(f"/catalog-courses/{algo['id']}/select", json={}, headers=h).json()
    assert course["info"]["semesters"] == ["א", "ב"]
    manual = client.post("/courses", json={"name": "משהו", "credits": 3}, headers=h).json()
    assert manual["info"] is None
