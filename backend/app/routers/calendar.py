"""ייצוא ליומן: קובץ .ics להורדה, וכתובת מנוי סודית שמתעדכנת אוטומטית (Google Calendar וכו')."""

import secrets
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlmodel import Session, select

from ..db import get_session
from ..deps import get_current_user
from ..ical import AllDayEvent, TimedEvent, WeeklyEvent, build_calendar, first_occurrence, utc_to_local_date
from ..models import ClassSession, Course, CourseItem, CourseItemType, Exam, User, UserReminder
from ..schemas import CalendarTokenRead

router = APIRouter(tags=["calendar"])

# משך ברירת מחדל לאירוע מבחן ביומן (בחינות באו"פ הן לרוב 3 שעות)
EXAM_DURATION = timedelta(hours=3)
REMINDER_DURATION = timedelta(minutes=30)


def build_user_calendar(user: User, session: Session) -> str:
    courses = {c.id: c for c in session.exec(select(Course).where(Course.user_id == user.id)).all()}
    course_ids = list(courses)

    timed: list[TimedEvent] = []
    all_day: list[AllDayEvent] = []
    weekly: list[WeeklyEvent] = []

    if course_ids:
        for exam in session.exec(select(Exam).where(Exam.course_id.in_(course_ids))).all():
            course = courses[exam.course_id]
            timed.append(
                TimedEvent(
                    uid=f"exam-{exam.id}@opuli",
                    summary=f"מבחן: {course.name}",
                    start_utc=exam.date_time,
                    end_utc=exam.date_time + EXAM_DURATION,
                    location=exam.location,
                    description=exam.notes,
                    alarm_minutes_before=24 * 60,
                )
            )

        items = session.exec(
            select(CourseItem).where(
                CourseItem.course_id.in_(course_ids),
                CourseItem.type == CourseItemType.assignment,
                CourseItem.is_done == False,  # noqa: E712
                CourseItem.due_date.is_not(None),
            )
        ).all()
        for item in items:
            course = courses[item.course_id]
            suffix = " (חובה)" if item.is_mandatory else ""
            all_day.append(
                AllDayEvent(
                    uid=f"assignment-{item.id}@opuli",
                    summary=f"הגשה: {item.title}{suffix} · {course.name}",
                    day=utc_to_local_date(item.due_date),
                    description=item.notes,
                )
            )

        for cs in session.exec(select(ClassSession).where(ClassSession.course_id.in_(course_ids))).all():
            course = courses[cs.course_id]
            anchor = date.fromisoformat(cs.start_date) if cs.start_date else cs.created_at.date()
            weekly.append(
                WeeklyEvent(
                    uid=f"session-{cs.id}@opuli",
                    summary=f"{cs.title or 'מפגש'}: {course.name}",
                    weekday=cs.weekday,
                    start_time=cs.start_time,
                    end_time=cs.end_time,
                    first_date=first_occurrence(cs.weekday, anchor),
                    interval_weeks=cs.interval_weeks,
                    until=date.fromisoformat(cs.end_date) if cs.end_date else None,
                    location=cs.location,
                )
            )

    reminders = session.exec(
        select(UserReminder).where(
            UserReminder.user_id == user.id,
            UserReminder.is_done == False,  # noqa: E712
            UserReminder.due_date.is_not(None),
        )
    ).all()
    for reminder in reminders:
        timed.append(
            TimedEvent(
                uid=f"reminder-{reminder.id}@opuli",
                summary=f"תזכורת: {reminder.title}",
                start_utc=reminder.due_date,
                end_utc=reminder.due_date + REMINDER_DURATION,
            )
        )

    return build_calendar("OpuLi - לימודים", timed, all_day, weekly, now=datetime.utcnow())


def _ics_response(body: str, download: bool) -> Response:
    headers = {"Cache-Control": "no-store"}
    if download:
        headers["Content-Disposition"] = 'attachment; filename="opuli.ics"'
    return Response(content=body, media_type="text/calendar; charset=utf-8", headers=headers)


@router.get("/calendar.ics")
def download_calendar(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """הורדה חד-פעמית של כל המבחנים, ההגשות, המפגשים והתזכורות כקובץ .ics."""
    return _ics_response(build_user_calendar(current_user, session), download=True)


@router.get("/calendar/feed/{token}.ics")
def calendar_feed(token: str, session: Session = Depends(get_session)):
    """כתובת מנוי ציבורית (בלי התחברות) - מוגנת רק בטוקן הסודי. יומן Google מושך אותה מדי כמה שעות."""
    if len(token) < 20:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="לא נמצא")
    user = session.exec(select(User).where(User.calendar_token == token)).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="לא נמצא")
    return _ics_response(build_user_calendar(user, session), download=False)


@router.post("/me/calendar-token", response_model=CalendarTokenRead)
def rotate_calendar_token(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """יוצר כתובת מנוי חדשה (ומבטל את הקודמת, אם הייתה)."""
    current_user.calendar_token = secrets.token_urlsafe(24)
    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    token = current_user.calendar_token
    return CalendarTokenRead(token=token, path=f"/calendar/feed/{token}.ics")


@router.delete("/me/calendar-token", status_code=status.HTTP_204_NO_CONTENT)
def revoke_calendar_token(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    current_user.calendar_token = None
    session.add(current_user)
    session.commit()
