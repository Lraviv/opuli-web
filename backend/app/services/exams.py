from sqlmodel import Session, select

from ..config import settings
from ..models import Exam, ExamReminder
from ..schemas import ExamCreate, ExamUpdate


def replace_reminders(exam_id: int, offsets_minutes: list[int], session: Session) -> None:
    # מוחקים תזכורות קיימות (כולל כאלה שכבר נשלחו - קונפיגורציה חדשה מתחילה מחדש)
    existing = session.exec(select(ExamReminder).where(ExamReminder.exam_id == exam_id)).all()
    for reminder in existing:
        session.delete(reminder)

    for offset in offsets_minutes:
        session.add(ExamReminder(exam_id=exam_id, offset_minutes=offset))


def create_exam(session: Session, course_id: int, payload: ExamCreate) -> Exam:
    """מבחן חדש + תזכורות (ברירת מחדל: יום ושעתיים לפני)."""
    exam = Exam(
        course_id=course_id,
        date_time=payload.date_time,
        location=payload.location,
        notes=payload.notes,
        term=payload.term,
    )
    session.add(exam)
    session.commit()
    session.refresh(exam)

    offsets = payload.reminder_offsets_minutes
    if offsets is None:
        offsets = settings.default_exam_reminder_offsets_minutes
    for offset in offsets:
        session.add(ExamReminder(exam_id=exam.id, offset_minutes=offset))
    session.commit()
    return exam


def update_exam(session: Session, exam: Exam, payload: ExamUpdate) -> Exam:
    update_data = payload.model_dump(exclude_unset=True, exclude={"reminder_offsets_minutes"})
    for field, value in update_data.items():
        setattr(exam, field, value)
    session.add(exam)

    if payload.reminder_offsets_minutes is not None:
        replace_reminders(exam.id, payload.reminder_offsets_minutes, session)

    session.commit()
    session.refresh(exam)
    return exam
