"""תזכורות במייל: מטלות ומבחנים יום לפני, ותזכורות אישיות בזמן שלהן.

רץ מתוך /internal/check-reminders (Cloud Scheduler כל כמה דקות). לכל משתמש
נשלח מייל אחד שמרכז את כל מה שהגיע זמנו בריצה הזו. פריט מסומן כנשלח רק
אחרי שליחה מוצלחת; משתמש שכיבה סוג תזכורות - הפריטים שלו לא נשלחים ולא
מסומנים (אם יפעיל שוב, יקבל רק את מה שעדיין רלוונטי).
"""

import html
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from .config import settings
from .mailer import is_email_configured, send_email
from .models import Course, CourseItem, CourseItemType, Exam, User, UserReminder

TZ = ZoneInfo("Asia/Jerusalem")
# מטלות ומבחנים: מתריעים כשנשארו פחות מ-24 שעות
DAY_BEFORE = timedelta(hours=24)
# תזכורות אישיות: שולחים קצת לפני הזמן (הטריגר רץ כל כמה דקות), ולא שולחים בדיעבד
# תזכורת שהזמן שלה עבר מזמן (למשל אם השרת היה כבוי)
REMINDER_LEAD = timedelta(minutes=5)
REMINDER_STALE = timedelta(hours=6)


@dataclass
class _Line:
    kind: str  # "מטלה" / "מבחן" / "תזכורת"
    title: str
    when: datetime
    record: CourseItem | Exam | UserReminder


def _utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _fmt(dt: datetime) -> str:
    local = _utc(dt).astimezone(TZ)
    return local.strftime("%d/%m %H:%M")


def collect_due(session: Session, now: datetime) -> dict[int, list[_Line]]:
    """מה שהגיע זמן לשלוח עליו מייל, לפי משתמש (רק משתמשים שהסוג פעיל אצלם)."""
    now_naive = now.astimezone(timezone.utc).replace(tzinfo=None)
    by_user: dict[int, list[_Line]] = defaultdict(list)

    assignments = session.exec(
        select(CourseItem, Course, User)
        .join(Course, Course.id == CourseItem.course_id)
        .join(User, User.id == Course.user_id)
        .where(
            CourseItem.type == CourseItemType.assignment,
            CourseItem.is_done == False,  # noqa: E712
            CourseItem.email_sent_at.is_(None),
            CourseItem.due_date.is_not(None),
            CourseItem.due_date > now_naive,
            CourseItem.due_date <= now_naive + DAY_BEFORE,
            User.email_notify_assignments == True,  # noqa: E712
        )
    ).all()
    for item, course, user in assignments:
        by_user[user.id].append(_Line("מטלה", f"{item.title} ({course.name})", item.due_date, item))

    exams = session.exec(
        select(Exam, Course, User)
        .join(Course, Course.id == Exam.course_id)
        .join(User, User.id == Course.user_id)
        .where(
            Exam.email_sent_at.is_(None),
            Exam.date_time > now_naive,
            Exam.date_time <= now_naive + DAY_BEFORE,
            User.email_notify_exams == True,  # noqa: E712
        )
    ).all()
    for exam, course, user in exams:
        title = course.name + (f" - {exam.location}" if exam.location else "")
        by_user[user.id].append(_Line("מבחן", title, exam.date_time, exam))

    reminders = session.exec(
        select(UserReminder, User)
        .join(User, User.id == UserReminder.user_id)
        .where(
            UserReminder.is_done == False,  # noqa: E712
            UserReminder.email_sent_at.is_(None),
            UserReminder.due_date.is_not(None),
            UserReminder.due_date > now_naive - REMINDER_STALE,
            UserReminder.due_date <= now_naive + REMINDER_LEAD,
            User.email_notify_reminders == True,  # noqa: E712
        )
    ).all()
    for reminder, user in reminders:
        by_user[user.id].append(_Line("תזכורת", reminder.title, reminder.due_date, reminder))

    return by_user


def _render(user: User, lines: list[_Line]) -> tuple[str, str, str]:
    lines = sorted(lines, key=lambda line: _utc(line.when))
    first = lines[0]
    subject = (
        f"OpuLi: {first.kind} - {first.title}"
        if len(lines) == 1
        else f"OpuLi: {len(lines)} דברים שמחכים לך בקרוב"
    )
    greeting = f"שלום {user.display_name}," if user.display_name else "שלום,"
    esc = html.escape
    rows = "".join(
        f"<tr><td style='padding:6px 0 6px 12px;color:#666;white-space:nowrap'>{esc(_fmt(line.when))}</td>"
        f"<td style='padding:6px 0'><b>{esc(line.kind)}:</b> {esc(line.title)}</td></tr>"
        for line in lines
    )
    profile_url = f"{settings.web_url}/profile"
    body_html = (
        "<div dir='rtl' style='font-family:Arial,sans-serif;font-size:15px;color:#222'>"
        f"<p>{esc(greeting)}</p><p>תזכורת ממה שמחכה לך ב-OpuLi:</p>"
        f"<table style='border-collapse:collapse'>{rows}</table>"
        f"<p><a href='{esc(settings.web_url)}'>לפתיחת OpuLi</a></p>"
        f"<p style='color:#888;font-size:12px'>לא רוצים את המיילים האלה? אפשר לכבות אותם "
        f"<a href='{esc(profile_url)}'>במסך הפרופיל</a>.</p></div>"
    )
    body_text = "\n".join(
        [greeting, "תזכורת ממה שמחכה לך ב-OpuLi:", ""]
        + [f"{_fmt(line.when)}  {line.kind}: {line.title}" for line in lines]
        + ["", settings.web_url, f"לכיבוי המיילים: {profile_url}"]
    )
    return subject, body_html, body_text


def process_email_reminders(session: Session, now: datetime | None = None) -> dict:
    if not is_email_configured():
        return {"configured": False, "emails_sent": 0, "emails_failed": 0}

    now = now or datetime.now(timezone.utc)
    sent_at = now.astimezone(timezone.utc).replace(tzinfo=None)
    sent = failed = 0
    for user_id, lines in collect_due(session, now).items():
        user = session.get(User, user_id)
        subject, body_html, body_text = _render(user, lines)
        if not send_email(user.email, subject, body_html, body_text):
            failed += 1
            continue
        sent += 1
        for line in lines:
            line.record.email_sent_at = sent_at
            session.add(line.record)
        session.commit()
    return {"configured": True, "emails_sent": sent, "emails_failed": failed}
