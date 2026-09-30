"""לוח תכנון סמסטרים (Backlog-style) של תואר - ראו degree/[id]/plan.tsx במובייל.

כל סמסטר שייך לתואר ספציפי; קורסים משויכים לסמסטר דרך Course.semester_id
(ראו PUT /courses/{course_id}/semester להזזת קורס בין סמסטרים / להוצאתו
מהלוח עם semester_id=null).
"""

from fastapi import APIRouter, Depends, status
from sqlmodel import Session, select

from ..authz import get_owned_course, get_owned_degree, get_owned_semester
from ..db import get_session
from ..deps import get_current_user
from ..models import Semester, User
from ..schemas import CourseRead, MoveCourseToSemester, SemesterCreate, SemesterRead, SemesterUpdate

router = APIRouter(tags=["semesters"])


@router.get("/degrees/{degree_id}/semesters", response_model=list[SemesterRead])
def list_semesters(
    degree_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_degree(degree_id, current_user.id, session)
    return session.exec(
        select(Semester).where(Semester.degree_id == degree_id).order_by(Semester.sort_order, Semester.id)
    ).all()


@router.post("/degrees/{degree_id}/semesters", response_model=SemesterRead, status_code=status.HTTP_201_CREATED)
def create_semester(
    degree_id: int,
    payload: SemesterCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_degree(degree_id, current_user.id, session)

    sort_order = payload.sort_order
    if sort_order is None:
        max_order = session.exec(
            select(Semester.sort_order).where(Semester.degree_id == degree_id).order_by(Semester.sort_order.desc())
        ).first()
        sort_order = (max_order or 0) + 1

    semester = Semester(degree_id=degree_id, name=payload.name, sort_order=sort_order)
    session.add(semester)
    session.commit()
    session.refresh(semester)
    return semester


@router.put("/semesters/{semester_id}", response_model=SemesterRead)
def update_semester(
    semester_id: int,
    payload: SemesterUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    semester = get_owned_semester(semester_id, current_user.id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(semester, field, value)
    session.add(semester)
    session.commit()
    session.refresh(semester)
    return semester


@router.delete("/semesters/{semester_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_semester(
    semester_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    semester = get_owned_semester(semester_id, current_user.id, session)

    # קורסים שהיו בסמסטר הזה לא נמחקים - רק מנותקים ממנו (חוזרים ל"מאגר" הלא-משובץ)
    from ..models import Course

    courses = session.exec(select(Course).where(Course.semester_id == semester_id)).all()
    for course in courses:
        course.semester_id = None
        session.add(course)

    session.delete(semester)
    session.commit()


@router.put("/courses/{course_id}/semester", response_model=CourseRead)
def move_course_to_semester(
    course_id: int,
    payload: MoveCourseToSemester,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """מזיזה קורס לסמסטר אחר בלוח התכנון, או מוציאה אותו מהלוח (semester_id=null)."""
    course = get_owned_course(course_id, current_user.id, session)
    if payload.semester_id is not None:
        get_owned_semester(payload.semester_id, current_user.id, session)

    course.semester_id = payload.semester_id
    session.add(course)
    session.commit()
    session.refresh(course)
    return course
