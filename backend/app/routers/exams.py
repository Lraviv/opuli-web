from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from ..authz import get_owned_course, get_owned_exam
from ..config import settings
from ..db import get_session
from ..deps import get_current_user
from ..models import Course, Exam, ExamReminder, User
from ..schemas import ExamCreate, ExamRead, ExamReminderRead, ExamUpdate

router = APIRouter(tags=["exams"])


def _exam_to_read(exam: Exam, session: Session) -> ExamRead:
    reminders = session.exec(select(ExamReminder).where(ExamReminder.exam_id == exam.id)).all()
    data = ExamRead.model_validate(exam)
    data.reminders = [ExamReminderRead.model_validate(r) for r in reminders]
    return data


def _replace_reminders(exam_id: int, offsets_minutes: list[int], session: Session) -> None:
    # מוחקים תזכורות קיימות (כולל כאלה שכבר נשלחו - קונפיגורציה חדשה מתחילה מחדש)
    existing = session.exec(select(ExamReminder).where(ExamReminder.exam_id == exam_id)).all()
    for reminder in existing:
        session.delete(reminder)

    for offset in offsets_minutes:
        session.add(ExamReminder(exam_id=exam_id, offset_minutes=offset))


# ---------------------------------------------------------------------------
# מבחנים
# ---------------------------------------------------------------------------


@router.get("/exams", response_model=list[ExamRead])
def list_upcoming_exams(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """כל המבחנים הקרובים של המשתמש, מכל הקורסים, ממוינים כרונולוגית."""
    exams = session.exec(
        select(Exam)
        .join(Course, Course.id == Exam.course_id)
        .where(Course.user_id == current_user.id)
        .order_by(Exam.date_time.asc())
    ).all()
    return [_exam_to_read(exam, session) for exam in exams]


@router.post(
    "/courses/{course_id}/exams",
    response_model=ExamRead,
    status_code=status.HTTP_201_CREATED,
)
def create_exam(
    course_id: int,
    payload: ExamCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)

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

    return _exam_to_read(exam, session)


@router.put("/exams/{exam_id}", response_model=ExamRead)
def update_exam(
    exam_id: int,
    payload: ExamUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    exam = get_owned_exam(exam_id, current_user.id, session)

    update_data = payload.model_dump(exclude_unset=True, exclude={"reminder_offsets_minutes"})
    for field, value in update_data.items():
        setattr(exam, field, value)
    session.add(exam)

    if payload.reminder_offsets_minutes is not None:
        _replace_reminders(exam_id, payload.reminder_offsets_minutes, session)

    session.commit()
    session.refresh(exam)
    return _exam_to_read(exam, session)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    exam = get_owned_exam(exam_id, current_user.id, session)
    for reminder in session.exec(select(ExamReminder).where(ExamReminder.exam_id == exam_id)).all():
        session.delete(reminder)
    # קודם מוחקים את התזכורות במסד, ורק אז את המבחן (מפתח זר ב-Postgres)
    session.flush()
    session.delete(exam)
    session.commit()
