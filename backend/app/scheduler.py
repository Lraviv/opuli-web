import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlmodel import Session, select

from .db import engine
from .models import Course, Exam, ExamReminder, PushToken
from .push import build_exam_reminder_message, send_expo_push_messages

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


def process_exam_reminders():
    with Session(engine) as session:
        now = datetime.utcnow()
        # Find reminders not yet sent
        statement = (
            select(ExamReminder, Exam, Course)
            .join(Exam, ExamReminder.exam_id == Exam.id)
            .join(Course, Exam.course_id == Course.id)
            .where(ExamReminder.sent_at == None)
        )
        results = session.exec(statement).all()

        messages = []
        reminders_to_update = []

        for reminder, exam, course in results:
            target_time = exam.date_time - timedelta(minutes=reminder.offset_minutes)
            if now >= target_time:
                tokens = session.exec(
                    select(PushToken).where(PushToken.user_id == course.user_id)
                ).all()
                for t in tokens:
                    msg = build_exam_reminder_message(
                        expo_push_token=t.expo_push_token,
                        course_name=course.name,
                        minutes_until=reminder.offset_minutes,
                    )
                    messages.append(msg)

                reminder.sent_at = now
                reminders_to_update.append(reminder)

        if messages:
            success = send_expo_push_messages(messages)
            if success:
                logger.info("Sent %d exam reminders via Push.", len(messages))
                session.add_all(reminders_to_update)
                session.commit()
            else:
                logger.error("Failed to send push notifications; will retry later.")
        elif reminders_to_update:
            # We had reminders to update but no tokens found
            session.add_all(reminders_to_update)
            session.commit()


def start_scheduler():
    # הסדר כאן חשוב: scheduler.start() חייב לרוץ *לפני* add_job. AsyncIOScheduler
    # קושר את עצמו ל-event loop הפעיל בזמן start() - אם מוסיפים job לפני כן,
    # ה-wakeup() הפנימי שלו משתמש בהפניה הישנה (ואם ה-loop הזה כבר נסגר, למשל
    # כשה-lifespan של FastAPI רץ כמה פעמים באותו תהליך כמו בבדיקות עם כמה
    # TestClient, זה זורק "Event loop is closed"). scheduler.running בודק
    # שלא מתחילים פעמיים אם ה-scheduler כבר פעיל.
    if not scheduler.running:
        scheduler.start()

    scheduler.add_job(
        process_exam_reminders,
        trigger=IntervalTrigger(minutes=1),  # Check every 1 minute
        id="exam_reminders_job",
        replace_existing=True,
    )


def stop_scheduler():
    """נקרא בכיבוי האפליקציה (ראו lifespan ב-main.py) כדי לא להשאיר event loop
    תקוע - חשוב בעיקר בבדיקות שיוצרות כמה TestClient/lifespan באותו תהליך."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
