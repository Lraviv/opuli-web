"""כלי הכתיבה של שרת ה-MCP: הוספה ועדכון של תזכורות, מטלות, מבחנים, קורסים,
ציונים, שיעורים ומערכת שעות. דורשים הרשאת opuli.write (require_write).

כל הכתיבה עוברת דרך app/services ודרך הסכמות של ה-API, כך שהתוצאה זהה למה
שהאתר היה יוצר. כלי הוספה מדלגים על כפילויות כדי שניסיון חוזר לא יכפיל.
"""

import re
from datetime import datetime
from typing import Any, Literal

from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import ToolAnnotations
from pydantic import BaseModel, Field, ValidationError
from sqlmodel import Session, select

from ..db import engine
from ..models import (
    CatalogCourse,
    ClassSession,
    Course,
    CourseItem,
    CourseItemType,
    CourseStatus,
    Degree,
    Exam,
    Semester,
    UserReminder,
)
from ..schemas import (
    ClassSessionCreate,
    ClassSessionUpdate,
    CourseCreate,
    CourseItemCreate,
    CourseItemUpdate,
    CourseUpdate,
    ExamCreate,
    ExamUpdate,
)
from ..services.class_sessions import InvalidSession, create_class_session
from ..services.class_sessions import update_class_session as update_class_session_service
from ..services.courses import (
    add_course_item,
    add_lessons as add_lessons_service,
    course_from_catalog,
    create_course,
    update_course as update_course_service,
    update_course_item,
)
from ..services.exams import create_exam, update_exam as update_exam_service
from ..services.reminders import create_reminder, update_reminder as update_reminder_service
from .auth import current_user_id, require_write
from .common import TERMS, course_url, norm, parse_local, resolve_course, to_local, to_local_display, validation_message
from .server import mcp_server

# הוספה: לא הרסני, אבל גם לא אידמפוטנטי במובן הפורמלי (יוצר רשומות)
ADD = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)
# עדכון שדות: אותה קריאה פעמיים = אותה תוצאה
UPDATE = ToolAnnotations(read_only_hint=False, destructive_hint=False, idempotent_hint=True, open_world_hint=False)

MAX_BATCH = 30
_WEEKDAY_NAMES = {
    "ראשון": 0, "שני": 1, "שלישי": 2, "רביעי": 3, "חמישי": 4, "שישי": 5, "שבת": 6,
    "sunday": 0, "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6,
}
_TERMS_IN = {"a": "a", "א": "a", "b": "b", "ב": "b", "special": "special", "מיוחד": "special"}


def _validate(schema: type[BaseModel], data: dict[str, Any]) -> Any:
    try:
        return schema.model_validate(data)
    except ValidationError as exc:
        raise ToolError(validation_message(exc))


def _owned_course_row(session: Session, model: Any, row_id: int, user_id: int, what: str) -> Any:
    """שורה של קורס (פריט/מבחן/מפגש) ששייכת למשתמשת, אחרת "לא נמצא"."""
    row = session.get(model, row_id)
    if row is not None:
        course = session.get(Course, row.course_id)
        if course is not None and course.user_id == user_id:
            return row
    raise ToolError(f"{what} {row_id} לא נמצא/ה.")


def _owned_reminder(session: Session, reminder_id: int, user_id: int) -> UserReminder:
    reminder = session.get(UserReminder, reminder_id)
    if reminder is None or reminder.user_id != user_id:
        raise ToolError(f"תזכורת {reminder_id} לא נמצאה.")
    return reminder


def _check_grade(grade: float | None) -> None:
    if grade is not None and not 0 <= grade <= 100:
        raise ToolError("ציון צריך להיות בין 0 ל-100.")


def _term(term: str | None) -> str | None:
    if term is None:
        return None
    key = norm(term).removeprefix("מועד ").strip()
    if key not in _TERMS_IN:
        raise ToolError("מועד צריך להיות a / b / special (א / ב / מיוחד).")
    return _TERMS_IN[key]


def _weekday(value: str | int) -> int:
    if isinstance(value, int) or str(value).isdigit():
        day = int(value)
        if 0 <= day <= 6:
            return day
    else:
        key = norm(str(value)).removeprefix("יום ").strip()
        if key in _WEEKDAY_NAMES:
            return _WEEKDAY_NAMES[key]
    raise ToolError(f"יום לא מוכר: \"{value}\". אפשר שם יום (ראשון / Sunday) או מספר 0-6 כשראשון = 0.")


def _resolve_semester(session: Session, degree_id: int | None, name: str) -> tuple[int | None, str | None]:
    """(semester_id, semester_text). בתואר שיש לו סמסטרים - חייבת להיות התאמה."""
    if degree_id is None:
        return None, name
    semesters = session.exec(select(Semester).where(Semester.degree_id == degree_id)).all()
    if not semesters:
        return None, name
    key = norm(name)
    for matcher in (lambda s: norm(s.name) == key, lambda s: key in norm(s.name)):
        matches = [s for s in semesters if matcher(s)]
        if len(matches) == 1:
            return matches[0].id, None
        if len(matches) > 1:
            break
    names = ", ".join(s.name for s in sorted(semesters, key=lambda s: s.sort_order))
    raise ToolError(f"לא נמצא סמסטר יחיד בשם \"{name}\". הסמסטרים בתואר: {names}.")


def _assignment_row(item: CourseItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "title": item.title,
        "due": to_local(item.due_date),
        "due_display": to_local_display(item.due_date),
        "kind": item.kind.value if item.kind else None,
        "weight_percent": item.weight_percent,
        "submitted": item.is_done,
        "grade": item.grade,
        "mandatory": item.is_mandatory,
    }


def _reminder_row(r: UserReminder) -> dict[str, Any]:
    return {"id": r.id, "title": r.title, "due": to_local(r.due_date), "due_display": to_local_display(r.due_date), "done": r.is_done}


def _exam_row(e: Exam, course: Course) -> dict[str, Any]:
    return {
        "id": e.id,
        "course": course.name,
        "course_id": course.id,
        "term": TERMS.get(e.term, e.term) if e.term else None,
        "when": to_local(e.date_time),
        "when_display": to_local_display(e.date_time),
        "location": e.location,
        "notes": e.notes,
    }


def _course_row(c: Course) -> dict[str, Any]:
    return {
        "id": c.id,
        "name": c.name,
        "code": c.course_code,
        "credits": c.credits,
        "status": c.status.value,
        "semester_id": c.semester_id,
        "semester": c.semester,
        "grade": c.grade,
        "url": course_url(c.id),
    }


# ---------------------------------------------------------------- תזכורות


@mcp_server.tool(annotations=ADD)
def add_reminder(title: str, due: str | None = None) -> dict[str, Any]:
    """Add a personal reminder / to-do. `due` is optional Israel local time (YYYY-MM-DDTHH:MM, or a date
    alone for 09:00). Example: "remind me to email my tutor on Sunday"."""
    require_write()
    user_id = current_user_id()
    title = title.strip()
    if not title:
        raise ToolError("חסרה כותרת לתזכורת.")
    due_date = parse_local(due) if due else None
    with Session(engine) as session:
        duplicate = session.exec(
            select(UserReminder).where(
                UserReminder.user_id == user_id,
                UserReminder.title == title,
                UserReminder.due_date == due_date,
                UserReminder.is_done.is_(False),
            )
        ).first()
        if duplicate:
            return {"created": False, "note": "התזכורת הזאת כבר קיימת", "reminder": _reminder_row(duplicate)}
        reminder = create_reminder(session, user_id, title, due_date)
        return {"created": True, "reminder": _reminder_row(reminder)}


@mcp_server.tool(annotations=UPDATE)
def update_reminder(
    reminder_id: int, title: str | None = None, due: str | None = None, done: bool | None = None
) -> dict[str, Any]:
    """Change a reminder's title or due time (Israel local time), or mark it done / not done."""
    require_write()
    user_id = current_user_id()
    data: dict[str, Any] = {}
    if title is not None:
        data["title"] = title.strip()
    if due is not None:
        data["due_date"] = parse_local(due)
    if done is not None:
        data["is_done"] = done
    with Session(engine) as session:
        reminder = _owned_reminder(session, reminder_id, user_id)
        return _reminder_row(update_reminder_service(session, reminder, data))


# ---------------------------------------------------------------- מטלות


class NewAssignment(BaseModel):
    title: str = Field(description='e.g. ממ"ן 11, ממ"ח 02, תרגיל 3')
    due: str | None = Field(default=None, description="Israel local time, YYYY-MM-DDTHH:MM (date alone = 23:59)")
    kind: Literal["mmn", "mmh", "other"] | None = Field(
        default=None, description='mmn = ממ"ן (tutor-marked), mmh = ממ"ח (computer-marked), other'
    )
    weight_percent: float | None = Field(default=None, ge=0, le=100, description="Share of the final grade, in %")
    mandatory: bool = False
    grade: float | None = Field(default=None, ge=0, le=100)


def _guess_kind(title: str) -> str | None:
    t = norm(title)
    if 'ממ"ן' in t or "ממן" in t:
        return "mmn"
    if 'ממ"ח' in t or "ממח" in t:
        return "mmh"
    return None


@mcp_server.tool(annotations=ADD)
def add_assignments(course: str, assignments: list[NewAssignment]) -> dict[str, Any]:
    """Add 1-30 assignments to a course in one call - for example from a pasted syllabus or a screenshot of
    the assignment schedule. Assignments whose title already exists in the course are skipped.
    `course` is an id, a course code or (part of) the course name."""
    require_write()
    user_id = current_user_id()
    if not 1 <= len(assignments) <= MAX_BATCH:
        raise ToolError(f"אפשר להוסיף בין 1 ל-{MAX_BATCH} מטלות בקריאה אחת.")
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        existing = {
            norm(i.title)
            for i in session.exec(
                select(CourseItem).where(CourseItem.course_id == c.id, CourseItem.type == CourseItemType.assignment)
            ).all()
        }
        created, skipped = [], []
        for a in assignments:
            title = a.title.strip()
            if not title or norm(title) in existing:
                skipped.append(title)
                continue
            payload = _validate(
                CourseItemCreate,
                {
                    "type": CourseItemType.assignment,
                    "title": title,
                    "due_date": parse_local(a.due, default_time="23:59") if a.due else None,
                    "kind": a.kind or _guess_kind(title),
                    "weight_percent": a.weight_percent,
                    "is_mandatory": a.mandatory,
                    "grade": a.grade,
                    # ממ"ן 12 -> סדר 12, כמו בהוספה הסדרתית באתר
                    "order": int(m.group()) if (m := re.search(r"\d+", title)) else None,
                },
            )
            created.append(_assignment_row(add_course_item(session, c.id, payload)))
            existing.add(norm(title))
        return {"course": c.name, "course_url": course_url(c.id), "created": created, "skipped_existing": skipped}


@mcp_server.tool(annotations=UPDATE)
def update_assignment(
    assignment_id: int,
    title: str | None = None,
    due: str | None = None,
    weight_percent: float | None = None,
    submitted: bool | None = None,
    grade: float | None = None,
    mandatory: bool | None = None,
) -> dict[str, Any]:
    """Update an assignment: due date (Israel local time), weight, submitted, grade (0-100), mandatory.
    Get assignment ids from get_course."""
    require_write()
    user_id = current_user_id()
    _check_grade(grade)
    data: dict[str, Any] = {}
    if title is not None:
        data["title"] = title.strip()
    if due is not None:
        data["due_date"] = parse_local(due, default_time="23:59")
    if weight_percent is not None:
        data["weight_percent"] = weight_percent
    if submitted is not None:
        data["is_done"] = submitted
    if grade is not None:
        data["grade"] = grade
    if mandatory is not None:
        data["is_mandatory"] = mandatory
    with Session(engine) as session:
        item = _owned_course_row(session, CourseItem, assignment_id, user_id, "מטלה")
        if item.type != CourseItemType.assignment:
            raise ToolError(f"מטלה {assignment_id} לא נמצאה.")
        return _assignment_row(update_course_item(session, item, _validate(CourseItemUpdate, data)))


# ---------------------------------------------------------------- מבחנים


@mcp_server.tool(annotations=ADD)
def add_exam(
    course: str, when: str, term: str | None = None, location: str | None = None, notes: str | None = None
) -> dict[str, Any]:
    """Add an exam to a course. `when` is Israel local time (YYYY-MM-DDTHH:MM). `term` is a / b / special
    (מועד א / ב / מיוחד). Default reminders (a day and two hours before) are added like on the site.
    An exam at the exact same time in the same course is not added twice."""
    require_write()
    user_id = current_user_id()
    date_time = parse_local(when)
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        duplicate = session.exec(select(Exam).where(Exam.course_id == c.id, Exam.date_time == date_time)).first()
        if duplicate:
            return {"created": False, "note": "המבחן הזה כבר קיים", "exam": _exam_row(duplicate, c)}
        payload = _validate(
            ExamCreate, {"date_time": date_time, "term": _term(term), "location": location, "notes": notes}
        )
        return {"created": True, "exam": _exam_row(create_exam(session, c.id, payload), c)}


@mcp_server.tool(annotations=UPDATE)
def update_exam(
    exam_id: int,
    when: str | None = None,
    term: str | None = None,
    location: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Change an exam's time (Israel local time), term, location or notes. Get exam ids from get_course."""
    require_write()
    user_id = current_user_id()
    data: dict[str, Any] = {}
    if when is not None:
        data["date_time"] = parse_local(when)
    if term is not None:
        data["term"] = _term(term)
    if location is not None:
        data["location"] = location
    if notes is not None:
        data["notes"] = notes
    with Session(engine) as session:
        exam = _owned_course_row(session, Exam, exam_id, user_id, "מבחן")
        exam = update_exam_service(session, exam, _validate(ExamUpdate, data))
        return _exam_row(exam, session.get(Course, exam.course_id))


# ---------------------------------------------------------------- קורסים וציונים


def _pick_degree(session: Session, user_id: int, degree_id: int | None) -> Degree | None:
    degrees = session.exec(select(Degree).where(Degree.user_id == user_id)).all()
    if degree_id is not None:
        for d in degrees:
            if d.id == degree_id:
                return d
        raise ToolError(f"תואר {degree_id} לא נמצא.")
    if len(degrees) <= 1:
        return degrees[0] if degrees else None
    names = ", ".join(f"{d.name} (id {d.id})" for d in degrees)
    raise ToolError(f"יש לך כמה תארים: {names}. צריך לציין degree_id.")


@mcp_server.tool(annotations=ADD)
def add_course(
    name: str,
    credits: float | None = None,
    status: Literal["current", "planned", "done"] = "planned",
    semester: str | None = None,
    degree_id: int | None = None,
    code: str | None = None,
    grade: float | None = None,
) -> dict[str, Any]:
    """Add a course to the student's degree. If the degree's catalog has a course with this name or code,
    it is taken from the catalog (credits and category included); otherwise `credits` is required.
    `semester` is a semester name from get_overview. A course that already exists and isn't done is
    returned instead of being added twice."""
    require_write()
    user_id = current_user_id()
    _check_grade(grade)
    name = name.strip()
    with Session(engine) as session:
        degree = _pick_degree(session, user_id, degree_id)
        existing = session.exec(select(Course).where(Course.user_id == user_id)).all()
        for c in existing:
            same = norm(c.name) == norm(name) or (code and c.course_code and norm(c.course_code) == norm(code))
            if same and c.status != CourseStatus.done:
                return {"created": False, "note": "הקורס כבר קיים", "course": _course_row(c)}

        semester_id, semester_text = _resolve_semester(session, degree.id if degree else None, semester) if semester else (None, None)

        catalog_match = None
        if degree is not None:
            catalog = session.exec(select(CatalogCourse).where(CatalogCourse.degree_id == degree.id)).all()
            catalog_match = next((cc for cc in catalog if norm(cc.name) == norm(name)), None)
            if catalog_match is None and code:
                catalog_match = next((cc for cc in catalog if cc.notes and norm(code) in norm(cc.notes)), None)

        if catalog_match is not None:
            c = course_from_catalog(
                session,
                user_id,
                catalog_match,
                status=CourseStatus(status),
                semester=semester_text,
                semester_id=semester_id,
                grade=grade,
            )
            return {"created": True, "from_catalog": True, "course": _course_row(c)}

        if credits is None:
            raise ToolError(f"\"{name}\" לא נמצא בקטלוג של התואר, אז צריך לציין כמה נקודות זכות (credits) הוא שווה.")
        payload = _validate(
            CourseCreate,
            {
                "name": name,
                "credits": credits,
                "status": status,
                "degree_id": degree.id if degree else None,
                "semester": semester_text,
                "semester_id": semester_id,
                "course_code": code,
                "grade": grade,
            },
        )
        return {"created": True, "from_catalog": False, "course": _course_row(create_course(session, user_id, payload))}


@mcp_server.tool(annotations=UPDATE)
def update_course(
    course: str,
    name: str | None = None,
    credits: float | None = None,
    status: Literal["current", "planned", "done"] | None = None,
    semester: str | None = None,
    grade: float | None = None,
) -> dict[str, Any]:
    """Update a course: name, credits, status (current / planned / done), semester (by name) or final grade.
    `course` is an id, a course code or (part of) the course name."""
    require_write()
    user_id = current_user_id()
    _check_grade(grade)
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        data: dict[str, Any] = {}
        if name is not None:
            data["name"] = name.strip()
        if credits is not None:
            data["credits"] = credits
        if status is not None:
            data["status"] = status
        if semester is not None:
            data["semester_id"], data["semester"] = _resolve_semester(session, c.degree_id, semester)
        if grade is not None:
            data["grade"] = grade
        return _course_row(update_course_service(session, c, _validate(CourseUpdate, data)))


def _match_assignment(assignments: list[CourseItem], ref: str) -> CourseItem:
    key = norm(ref)
    number = re.fullmatch(r"\D*(\d+)\D*", key)
    for matcher in (
        lambda i: norm(i.title) == key,
        lambda i: key in norm(i.title),
        # "12" / "ממן 12" -> ממ"ן 12
        lambda i: number is not None and re.search(rf"(?<!\d){int(number.group(1))}(?!\d)", norm(i.title)) is not None,
    ):
        matches = [i for i in assignments if matcher(i)]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            names = ", ".join(f"{i.title} (id {i.id})" for i in matches[:10])
            raise ToolError(f"יש כמה מטלות שמתאימות ל-\"{ref}\": {names}.")
    raise ToolError(f"לא נמצאה מטלה \"{ref}\" בקורס.")


@mcp_server.tool(annotations=UPDATE)
def set_grade(course: str, grade: float, assignment: str | None = None) -> dict[str, Any]:
    """Record a grade (0-100). With `assignment` (its title or number, e.g. "ממ\"ן 12" or "12") the grade goes
    to that assignment; without it, it is the course's final grade and the course is marked done."""
    require_write()
    user_id = current_user_id()
    _check_grade(grade)
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        if assignment:
            assignments = session.exec(
                select(CourseItem).where(CourseItem.course_id == c.id, CourseItem.type == CourseItemType.assignment)
            ).all()
            item = _match_assignment(list(assignments), assignment)
            item = update_course_item(session, item, CourseItemUpdate(grade=grade, is_done=True))
            return {"course": c.name, "assignment": _assignment_row(item)}
        c = update_course_service(session, c, CourseUpdate(grade=grade, status=CourseStatus.done))
        return {"course": _course_row(c)}


# ---------------------------------------------------------------- שיעורים ומערכת שעות


class NewClassSession(BaseModel):
    weekday: str = Field(description="Day name (ראשון / Sunday) or 0-6 where Sunday = 0")
    start: str = Field(description="HH:MM, Israel local time")
    end: str = Field(description="HH:MM")
    location: str | None = None
    title: str | None = Field(default=None, description="e.g. מפגש הנחיה, תרגול")
    every_weeks: int = Field(default=1, ge=1, le=4)
    from_date: str | None = Field(default=None, description="YYYY-MM-DD, first meeting (required if every_weeks > 1)")
    until_date: str | None = Field(default=None, description="YYYY-MM-DD, last meeting")


def _session_row(s: ClassSession, course: Course) -> dict[str, Any]:
    days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
    return {
        "id": s.id,
        "course": course.name,
        "weekday": days[s.weekday],
        "start": s.start_time,
        "end": s.end_time,
        "location": s.location,
        "title": s.title,
        "every_weeks": s.interval_weeks,
        "from_date": s.start_date,
        "until_date": s.end_date,
    }


@mcp_server.tool(annotations=ADD)
def add_class_sessions(course: str, sessions: list[NewClassSession]) -> dict[str, Any]:
    """Add recurring class meetings to a course's weekly schedule - for example from the university's
    timetable. A meeting with the same day and hours that already exists is skipped."""
    require_write()
    user_id = current_user_id()
    if not 1 <= len(sessions) <= MAX_BATCH:
        raise ToolError(f"אפשר להוסיף בין 1 ל-{MAX_BATCH} מפגשים בקריאה אחת.")
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        existing = {
            (s.weekday, s.start_time, s.end_time)
            for s in session.exec(select(ClassSession).where(ClassSession.course_id == c.id)).all()
        }
        created, skipped = [], []
        for s in sessions:
            payload = _validate(
                ClassSessionCreate,
                {
                    "weekday": _weekday(s.weekday),
                    "start_time": s.start,
                    "end_time": s.end,
                    "location": s.location,
                    "title": s.title,
                    "interval_weeks": s.every_weeks,
                    "start_date": s.from_date,
                    "end_date": s.until_date,
                },
            )
            key = (payload.weekday, payload.start_time, payload.end_time)
            if key in existing:
                skipped.append(f"{s.weekday} {s.start}-{s.end}")
                continue
            created.append(_session_row(create_class_session(session, c.id, payload), c))
            existing.add(key)
        return {"course": c.name, "created": created, "skipped_existing": skipped}


@mcp_server.tool(annotations=UPDATE)
def update_class_session(
    session_id: int,
    weekday: str | None = None,
    start: str | None = None,
    end: str | None = None,
    location: str | None = None,
    title: str | None = None,
    every_weeks: int | None = None,
    from_date: str | None = None,
    until_date: str | None = None,
) -> dict[str, Any]:
    """Change a recurring class meeting (day, hours, location, ...). Get session ids from get_schedule."""
    require_write()
    user_id = current_user_id()
    data: dict[str, Any] = {}
    if weekday is not None:
        data["weekday"] = _weekday(weekday)
    for key, value in (
        ("start_time", start),
        ("end_time", end),
        ("location", location),
        ("title", title),
        ("interval_weeks", every_weeks),
        ("start_date", from_date),
        ("end_date", until_date),
    ):
        if value is not None:
            data[key] = value
    with Session(engine) as session:
        class_session = _owned_course_row(session, ClassSession, session_id, user_id, "מפגש")
        try:
            updated = update_class_session_service(session, class_session, _validate(ClassSessionUpdate, data))
        except InvalidSession as exc:
            raise ToolError(str(exc))
        return _session_row(updated, session.get(Course, updated.course_id))


@mcp_server.tool(annotations=ADD)
def add_lessons(course: str, titles: list[str] | None = None, count: int | None = None) -> dict[str, Any]:
    """Add lessons / lectures to a course, in order: either their `titles`, or a `count` of numbered lessons
    (שיעור 01, שיעור 02, ...) continuing after the existing ones. Titles that already exist are skipped."""
    require_write()
    user_id = current_user_id()
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        lessons = session.exec(
            select(CourseItem).where(CourseItem.course_id == c.id, CourseItem.type == CourseItemType.lesson)
        ).all()
        if titles:
            wanted = [t.strip() for t in titles if t.strip()]
        elif count:
            wanted = [f"שיעור {len(lessons) + i:02d}" for i in range(1, count + 1)]
        else:
            raise ToolError("צריך לתת titles או count.")
        if len(wanted) > 100:
            raise ToolError("אפשר להוסיף עד 100 שיעורים בקריאה אחת.")
        existing = {norm(i.title) for i in lessons}
        new_titles, skipped = [], []
        for title in wanted:
            if norm(title) in existing:
                skipped.append(title)
            else:
                new_titles.append(title)
                existing.add(norm(title))
        created = add_lessons_service(session, c.id, new_titles) if new_titles else []
        return {
            "course": c.name,
            "created": [{"id": i.id, "title": i.title} for i in created],
            "skipped_existing": skipped,
        }


@mcp_server.tool(annotations=UPDATE)
def mark_lessons_watched(course: str, lessons: list[str], watched: bool = True) -> dict[str, Any]:
    """Mark lessons as watched (or not). Each entry is a lesson number ("3"), a range ("3-5") or a title."""
    require_write()
    user_id = current_user_id()
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        all_lessons = sorted(
            session.exec(
                select(CourseItem).where(CourseItem.course_id == c.id, CourseItem.type == CourseItemType.lesson)
            ).all(),
            key=lambda i: (i.order is None, i.order or 0, i.id),
        )
        if not all_lessons:
            raise ToolError(f"אין שיעורים בקורס {c.name}.")

        def by_number(n: int) -> CourseItem:
            for i in all_lessons:
                if i.order == n or re.search(rf"(?<!\d)0*{n}(?!\d)", i.title):
                    return i
            raise ToolError(f"לא נמצא שיעור {n} בקורס {c.name}.")

        targets: dict[int, CourseItem] = {}
        for ref in lessons:
            ref = ref.strip()
            if m := re.fullmatch(r"(\d+)\s*[-–]\s*(\d+)", ref):
                for n in range(int(m.group(1)), int(m.group(2)) + 1):
                    item = by_number(n)
                    targets[item.id] = item
            elif ref.isdigit():
                item = by_number(int(ref))
                targets[item.id] = item
            else:
                matches = [i for i in all_lessons if norm(ref) in norm(i.title)]
                if len(matches) != 1:
                    raise ToolError(f"לא נמצא שיעור יחיד בשם \"{ref}\".")
                targets[matches[0].id] = matches[0]

        updated = []
        for item in targets.values():
            data: dict[str, Any] = {"is_done": watched}
            if watched and item.watched_at is None:
                data["watched_at"] = datetime.utcnow()
            updated.append(update_course_item(session, item, CourseItemUpdate(**data)))
        return {
            "course": c.name,
            "updated": [{"id": i.id, "title": i.title, "watched": i.is_done} for i in updated],
        }
