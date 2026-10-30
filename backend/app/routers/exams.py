from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from ..authz import get_owned_course, get_owned_exam
from ..db import get_session
from ..deps import get_current_user
from ..models import Course, Exam, ExamReminder, User
from ..schemas import ExamCreate, ExamRead, ExamReminderRead, ExamUpdate
from ..services.exams import create_exam as create_exam_service
from ..services.exams import update_exam as update_exam_service
from ..services.exams import delete_exam as delete_exam_service

router = APIRouter(tags=["exams"])


def _exam_to_read(exam: Exam, session: Session) -> ExamRead:
    reminders = session.exec(select(ExamReminder).where(ExamReminder.exam_id == exam.id)).all()
    data = ExamRead.model_validate(exam)
    data.reminders = [ExamReminderRead.model_validate(r) for r in reminders]
    return data


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
    exam = create_exam_service(session, course_id, payload)
    return _exam_to_read(exam, session)


@router.put("/exams/{exam_id}", response_model=ExamRead)
def update_exam(
    exam_id: int,
    payload: ExamUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    exam = get_owned_exam(exam_id, current_user.id, session)
    exam = update_exam_service(session, exam, payload)
    return _exam_to_read(exam, session)


@router.delete("/exams/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(
    exam_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    delete_exam_service(session, get_owned_exam(exam_id, current_user.id, session))
