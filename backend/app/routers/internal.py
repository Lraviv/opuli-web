"""Endpoint פנימי, לא לשימוש המובייל - נועד להיקרא ע"י טריגר חיצוני מתוזמן
(cron-job.org / GitHub Actions וכו', ראו מסמך האיפיון) כל 15-30 דקות, כדי
לבדוק אילו תזכורות מבחן הגיע זמנן ולשלוח עבורן Push.

מוגן בכותרת סוד משותפת (X-Internal-Secret) ולא בטוקן משתמש - כי זו קריאה
שרת-לשרת ולא פעולה מטעם משתמש ספציפי.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlmodel import Session, select

from ..config import settings
from ..db import get_session
from ..email_reminders import process_email_reminders
from ..models import Course, Exam, ExamReminder, PushToken
from ..push import build_exam_reminder_message, send_expo_push_messages

router = APIRouter(tags=["internal"])


def _verify_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    if x_internal_secret != settings.internal_secret:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="סוד פנימי לא תקין")


@router.post("/internal/check-reminders")
def check_reminders(
    _: None = Depends(_verify_internal_secret),
    session: Session = Depends(get_session),
):
    now = datetime.now(timezone.utc)

    due_reminders = session.exec(
        select(ExamReminder, Exam, Course)
        .join(Exam, Exam.id == ExamReminder.exam_id)
        .join(Course, Course.id == Exam.course_id)
        .where(ExamReminder.sent_at.is_(None))
    ).all()

    messages: list[dict] = []
    reminders_to_mark_sent: list[ExamReminder] = []
    skipped_past = 0
    due_count = 0

    for reminder, exam, course in due_reminders:
        exam_time = exam.date_time
        if exam_time.tzinfo is None:
            exam_time = exam_time.replace(tzinfo=timezone.utc)
        due_at = exam_time - timedelta(minutes=reminder.offset_minutes)

        if due_at > now:
            continue  # עוד לא הגיע הזמן לתזכורת הזו

        due_count += 1

        if exam_time < now:
            # המבחן כבר עבר (למשל אם השרת היה כבוי) - אין טעם להתריע בדיעבד
            skipped_past += 1
            reminders_to_mark_sent.append(reminder)
            continue

        minutes_until = max(0, round((exam_time - now).total_seconds() / 60))
        push_tokens = session.exec(
            select(PushToken).where(PushToken.user_id == course.user_id)
        ).all()
        for token in push_tokens:
            messages.append(
                build_exam_reminder_message(token.expo_push_token, course.name, minutes_until)
            )

        reminders_to_mark_sent.append(reminder)

    sent_ok = send_expo_push_messages(messages)

    for reminder in reminders_to_mark_sent:
        reminder.sent_at = now
        session.add(reminder)
    session.commit()

    email = process_email_reminders(session, now)

    return {
        "email": email,
        "checked": len(due_reminders),
        "due": due_count,
        "messages_sent": len(messages),
        "skipped_past_exams": skipped_past,
        "expo_request_ok": sent_ok,
    }
