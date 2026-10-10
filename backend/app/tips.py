"""זהות קורס משותפת בין סטודנטים (בשביל לשונית העצות).

קורס אישי (Course) שייך למשתמש אחד. כדי ששני סטודנטים יראו את אותו דיון,
מזהים את הקורס לפי מוסד + מספר קורס, ומקשרים אותו לרשומת SharedCourse אחת.
"""

import re

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .models import Course, Degree, SharedCourse

# קורסי תבנית שומרים את המספר בשדה notes של הקטלוג (ראו create_degree)
_CATALOG_CODE_RE = re.compile(r"מספר קורס:\s*([0-9A-Za-z-]+)")

# כתיבים נפוצים של אותו מוסד -> שם אחיד, כדי ש"האו״פ" ו"האוניברסיטה הפתוחה"
# יגיעו לאותו דיון. מפתחות אחרי הסרת גרשיים ורווחים כפולים.
_INSTITUTION_ALIASES = {
    "האוניברסיטה הפתוחה": "האוניברסיטה הפתוחה",
    "אוניברסיטה הפתוחה": "האוניברסיטה הפתוחה",
    "האופ": "האוניברסיטה הפתוחה",
    "אופ": "האוניברסיטה הפתוחה",
    "the open university": "האוניברסיטה הפתוחה",
    "open university": "האוניברסיטה הפתוחה",
    "openu": "האוניברסיטה הפתוחה",
}


def normalize_course_code(code: str | None) -> str | None:
    if code is None:
        return None
    code = re.sub(r"\s+", "", code)
    return code or None


def code_from_catalog_notes(notes: str | None) -> str | None:
    if not notes:
        return None
    match = _CATALOG_CODE_RE.search(notes)
    return match.group(1) if match else None


def normalize_institution(institution: str | None) -> str:
    if not institution:
        return ""
    cleaned = re.sub(r"\s+", " ", institution).strip()
    key = re.sub(r"[\"'״׳]", "", cleaned).lower()
    return _INSTITUTION_ALIASES.get(key, cleaned)


def resolve_shared_course(course: Course, session: Session) -> SharedCourse | None:
    """מחזיר (ויוצר אם צריך) את הקורס המשותף של קורס אישי. None אם אין לו מספר קורס.

    מחושב מחדש בכל פעם, כך ששינוי מוסד בתואר או מספר בקורס מתעדכן מעצמו.
    """
    code = normalize_course_code(course.course_code)
    if code is None:
        if course.shared_course_id is not None:
            course.shared_course_id = None
            session.add(course)
            session.commit()
        return None

    degree = session.get(Degree, course.degree_id) if course.degree_id else None
    institution = normalize_institution(degree.institution if degree else None)

    shared = session.exec(
        select(SharedCourse).where(SharedCourse.institution == institution, SharedCourse.code == code)
    ).first()
    if shared is None:
        shared = SharedCourse(institution=institution, code=code, name=course.name)
        session.add(shared)
        try:
            session.commit()
        except IntegrityError:
            # סטודנט/ית אחר/ת יצר/ה את אותו קורס משותף באותו רגע
            session.rollback()
            shared = session.exec(
                select(SharedCourse).where(SharedCourse.institution == institution, SharedCourse.code == code)
            ).one()
        session.refresh(shared)

    if course.shared_course_id != shared.id:
        course.shared_course_id = shared.id
        session.add(course)
        session.commit()
    return shared
