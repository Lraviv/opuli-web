"""כלי הקריאה של שרת ה-MCP. כל כלי מזהה את המשתמשת רק לפי הטוקן
(current_user_id), ולעולם לא לפי פרמטר שה-AI שולח."""

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from mcp.types import ToolAnnotations
from sqlmodel import Session, select

from ..db import engine
from ..models import (
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
from .auth import current_user_id
from .common import course_url, now_local, resolve_course, to_local, to_local_display
from .server import mcp_server

READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)

DEFAULT_PASS_GRADE = 60  # כמו DEFAULT_PASS_GRADE באתר (web/src/lib/grades.ts)
_TERMS = {"a": "א", "b": "ב", "special": "מיוחד"}  # Exam.term
_SESSION_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]  # ClassSession.weekday


def _counts_toward_degree(course: Course) -> bool:
    """הושלם ולא נכשל - אותו כלל כמו countsTowardDegree באתר."""
    if course.status != CourseStatus.done:
        return False
    return course.grade is None or course.grade >= (course.pass_grade or DEFAULT_PASS_GRADE)


def _semester_names(session: Session, degree_ids: list[int]) -> dict[int, str]:
    if not degree_ids:
        return {}
    rows = session.exec(select(Semester).where(Semester.degree_id.in_(degree_ids))).all()
    return {s.id: s.name for s in rows}


def _course_summary(course: Course, semesters: dict[int, str]) -> dict[str, Any]:
    return {
        "id": course.id,
        "name": course.name,
        "code": course.course_code,
        "status": course.status.value,
        "semester": semesters.get(course.semester_id) if course.semester_id else course.semester,
        "credits": course.credits,
        "grade": course.grade,
        "category": course.category,
        "degree_id": course.degree_id,
    }


def _user_courses(session: Session, user_id: int) -> list[Course]:
    return list(session.exec(select(Course).where(Course.user_id == user_id).order_by(Course.created_at)).all())


@mcp_server.tool(annotations=READ_ONLY)
def get_overview() -> dict[str, Any]:
    """Start here. Returns today's date (Israel time), the student's degrees with completed credits and
    credit-weighted average, semesters, and all courses with their ids, status (current / planned / done),
    credits and grades. Use the ids from here in the other tools."""
    user_id = current_user_id()
    with Session(engine) as session:
        degrees = session.exec(select(Degree).where(Degree.user_id == user_id)).all()
        courses = _user_courses(session, user_id)
        semesters = _semester_names(session, [d.id for d in degrees])

        degree_rows = []
        for degree in degrees:
            counted = [c for c in courses if c.degree_id == degree.id and _counts_toward_degree(c)]
            graded = [c for c in counted if c.grade is not None and c.credits > 0]
            weight = sum(c.credits for c in graded)
            degree_rows.append({
                "id": degree.id,
                "name": degree.name,
                "institution": degree.institution,
                "target_credits": degree.target_credits,
                "credits_completed": sum(c.credits for c in counted),
                "average": round(sum(c.grade * c.credits for c in graded) / weight, 2) if weight else None,
            })

        today = now_local()
        return {
            "today": today.strftime("%Y-%m-%d"),
            "now_local": today.strftime("%Y-%m-%dT%H:%M"),
            "timezone": "Asia/Jerusalem",
            "degrees": degree_rows,
            "semesters": [{"id": sid, "name": name} for sid, name in semesters.items()],
            "courses": [_course_summary(c, semesters) for c in courses],
        }


@mcp_server.tool(annotations=READ_ONLY)
def list_courses(
    status: Literal["current", "planned", "done"] | None = None,
    degree_id: int | None = None,
) -> list[dict[str, Any]]:
    """List the student's courses, optionally filtered by status (current = this semester, planned, done)
    or by degree."""
    user_id = current_user_id()
    with Session(engine) as session:
        courses = _user_courses(session, user_id)
        degree_ids = sorted({c.degree_id for c in courses if c.degree_id})
        semesters = _semester_names(session, degree_ids)
        return [
            _course_summary(c, semesters)
            for c in courses
            if (status is None or c.status.value == status) and (degree_id is None or c.degree_id == degree_id)
        ]


@mcp_server.tool(annotations=READ_ONLY)
def get_course(course: str) -> dict[str, Any]:
    """Full details of one course: assignments (with due dates, weights and grades), lessons progress,
    exams and weekly class sessions. `course` is an id, a course code or (part of) the course name."""
    user_id = current_user_id()
    with Session(engine) as session:
        c = resolve_course(session, user_id, course)
        semesters = _semester_names(session, [c.degree_id] if c.degree_id else [])
        items = session.exec(select(CourseItem).where(CourseItem.course_id == c.id)).all()
        assignments = sorted(
            (i for i in items if i.type == CourseItemType.assignment),
            key=lambda i: (i.due_date is None, i.due_date or datetime.min, i.order or 0),
        )
        lessons = [i for i in items if i.type == CourseItemType.lesson]
        exams = session.exec(select(Exam).where(Exam.course_id == c.id).order_by(Exam.date_time)).all()
        sessions = session.exec(select(ClassSession).where(ClassSession.course_id == c.id)).all()

        return {
            **_course_summary(c, semesters),
            "url": course_url(c.id),
            "pass_grade": c.pass_grade or DEFAULT_PASS_GRADE,
            "exam_weight": c.exam_weight,
            "assignments": [
                {
                    "id": i.id,
                    "title": i.title,
                    "kind": i.kind.value if i.kind else None,
                    "due": to_local(i.due_date),
                    "due_display": to_local_display(i.due_date),
                    "submitted": i.is_done,
                    "weight_percent": i.weight_percent,
                    "grade": i.grade,
                    "mandatory": i.is_mandatory,
                }
                for i in assignments
            ],
            "lessons": {
                "total": len(lessons),
                "watched": sum(1 for i in lessons if i.is_done),
                "items": [
                    {"id": i.id, "title": i.title, "watched": i.is_done}
                    for i in sorted(lessons, key=lambda i: (i.order is None, i.order or 0, i.id))
                ],
            },
            "exams": [
                {
                    "id": e.id,
                    "term": _TERMS.get(e.term, e.term) if e.term else None,
                    "when": to_local(e.date_time),
                    "when_display": to_local_display(e.date_time),
                    "location": e.location,
                    "notes": e.notes,
                }
                for e in exams
            ],
            "class_sessions": [_session_row(s, c) for s in sessions],
        }


def _session_row(s: ClassSession, course: Course) -> dict[str, Any]:
    return {
        "id": s.id,
        "course_id": course.id,
        "course": course.name,
        "weekday": _SESSION_WEEKDAYS[s.weekday],
        "start": s.start_time,
        "end": s.end_time,
        "title": s.title,
        "location": s.location,
        "every_weeks": s.interval_weeks,
        "from_date": s.start_date,
        "until_date": s.end_date,
    }


@mcp_server.tool(annotations=READ_ONLY)
def list_upcoming(days: int = 14) -> dict[str, Any]:
    """What's coming up: assignments not yet submitted, exams and open reminders due in the next `days`
    days (default 14, max 120), plus overdue items that are still open. Times are Israel local time."""
    user_id = current_user_id()
    days = max(1, min(days, 120))
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    until = now_utc + timedelta(days=days)
    with Session(engine) as session:
        courses = {c.id: c for c in _user_courses(session, user_id)}
        events: list[dict[str, Any]] = []

        if courses:
            for item in session.exec(
                select(CourseItem).where(
                    CourseItem.course_id.in_(list(courses)),
                    CourseItem.type == CourseItemType.assignment,
                    CourseItem.is_done.is_(False),
                    CourseItem.due_date.is_not(None),
                    CourseItem.due_date <= until,
                )
            ).all():
                events.append({
                    "type": "assignment",
                    "id": item.id,
                    "title": item.title,
                    "course": courses[item.course_id].name,
                    "course_id": item.course_id,
                    "_at": item.due_date,
                })
            for exam in session.exec(
                select(Exam).where(
                    Exam.course_id.in_(list(courses)), Exam.date_time >= now_utc, Exam.date_time <= until
                )
            ).all():
                events.append({
                    "type": "exam",
                    "id": exam.id,
                    "title": f"מבחן {courses[exam.course_id].name}" + (f" (מועד {_TERMS.get(exam.term, exam.term)})" if exam.term else ""),
                    "course": courses[exam.course_id].name,
                    "course_id": exam.course_id,
                    "location": exam.location,
                    "_at": exam.date_time,
                })

        for r in session.exec(
            select(UserReminder).where(
                UserReminder.user_id == user_id,
                UserReminder.is_done.is_(False),
                UserReminder.due_date.is_not(None),
                UserReminder.due_date <= until,
            )
        ).all():
            events.append({"type": "reminder", "id": r.id, "title": r.title, "_at": r.due_date})

        events.sort(key=lambda e: e["_at"])
        for e in events:
            at = e.pop("_at")
            e["when"] = to_local(at)
            e["when_display"] = to_local_display(at)
            e["overdue"] = at < now_utc

        return {"today": now_local().strftime("%Y-%m-%d"), "days": days, "items": events}


@mcp_server.tool(annotations=READ_ONLY)
def list_reminders(include_done: bool = False) -> list[dict[str, Any]]:
    """The student's personal reminders (to-dos), open ones by default."""
    user_id = current_user_id()
    with Session(engine) as session:
        query = select(UserReminder).where(UserReminder.user_id == user_id)
        if not include_done:
            query = query.where(UserReminder.is_done.is_(False))
        rows = session.exec(query.order_by(UserReminder.created_at.desc())).all()
        return [
            {
                "id": r.id,
                "title": r.title,
                "due": to_local(r.due_date),
                "due_display": to_local_display(r.due_date),
                "done": r.is_done,
            }
            for r in rows
        ]


@mcp_server.tool(annotations=READ_ONLY)
def get_schedule() -> dict[str, Any]:
    """The weekly class schedule: every recurring class session of every course, grouped by weekday
    (Sunday first), with start/end times (Israel local time) and location."""
    user_id = current_user_id()
    with Session(engine) as session:
        courses = {c.id: c for c in _user_courses(session, user_id)}
        if not courses:
            return {"days": []}
        sessions = session.exec(
            select(ClassSession).where(ClassSession.course_id.in_(list(courses)))
        ).all()
        days = []
        for weekday, name in enumerate(_SESSION_WEEKDAYS):
            day = sorted((s for s in sessions if s.weekday == weekday), key=lambda s: s.start_time)
            if day:
                days.append({"weekday": name, "sessions": [_session_row(s, courses[s.course_id]) for s in day]})
        return {"days": days}
