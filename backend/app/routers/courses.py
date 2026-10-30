from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..authz import get_owned_course, get_owned_course_item
from ..db import get_session
from ..deps import get_current_user
from ..models import (
    AssignmentKind,
    ClassSession,
    Course,
    CourseItem,
    CourseItemType,
    CourseStatus,
    Exam,
    ExamReminder,
    Link,
    StudyTopic,
    User,
)
from ..schemas import (
    BatchAssignmentCreate,
    CourseCreate,
    CourseItemCreate,
    CourseItemRead,
    CourseItemUpdate,
    CourseRead,
    CourseUpdate,
)
from ..services.courses import add_course_item as add_course_item_service
from ..services.courses import add_lessons
from ..services.courses import create_course as create_course_service
from ..services.courses import update_course as update_course_service
from ..services.courses import update_course_item as update_course_item_service

class BatchLessonCreate(BaseModel):
    count: int = Field(..., gt=0, le=100)

router = APIRouter(tags=["courses"])


# ---------------------------------------------------------------------------
# קורסים אישיים
# ---------------------------------------------------------------------------


@router.get("/courses", response_model=list[CourseRead])
def list_courses(
    degree_id: int | None = Query(default=None),
    status_filter: CourseStatus | None = Query(default=None, alias="status"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Course).where(Course.user_id == current_user.id)
    if degree_id is not None:
        query = query.where(Course.degree_id == degree_id)
    if status_filter is not None:
        query = query.where(Course.status == status_filter)
    return session.exec(query).all()


@router.post("/courses", response_model=CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """הוספת קורס ידנית (לא מהקטלוג) - למשל קורס מוכר מתואר קודם."""
    return create_course_service(session, current_user.id, payload)


@router.put("/courses/{course_id}", response_model=CourseRead)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    course = get_owned_course(course_id, current_user.id, session)
    return update_course_service(session, course, payload)


@router.delete("/courses/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    course = get_owned_course(course_id, current_user.id, session)

    # מוחקים בעלי-תלות: פריטי התקדמות, ומבחנים יחד עם התזכורות שלהם
    for item in session.exec(select(CourseItem).where(CourseItem.course_id == course_id)).all():
        session.delete(item)

    for topic in session.exec(select(StudyTopic).where(StudyTopic.course_id == course_id)).all():
        session.delete(topic)

    for link in session.exec(select(Link).where(Link.course_id == course_id)).all():
        session.delete(link)

    for class_session in session.exec(select(ClassSession).where(ClassSession.course_id == course_id)).all():
        session.delete(class_session)

    for exam in session.exec(select(Exam).where(Exam.course_id == course_id)).all():
        for reminder in session.exec(
            select(ExamReminder).where(ExamReminder.exam_id == exam.id)
        ).all():
            session.delete(reminder)
        session.flush()
        session.delete(exam)

    # כל התלויות נמחקות במסד לפני הקורס עצמו (מפתחות זרים ב-Postgres)
    session.flush()
    session.delete(course)
    session.commit()


# ---------------------------------------------------------------------------
# פריטי התקדמות (שיעורים / מטלות)
# ---------------------------------------------------------------------------


@router.get("/course-items", response_model=list[CourseItemRead])
def list_all_course_items(
    type_filter: CourseItemType | None = Query(default=None, alias="type"),
    is_done: bool | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """כל פריטי ההתקדמות (שיעורים/מטלות) מכל הקורסים של המשתמש/ת, בלי תלות
    בקורס ספציפי - משמש בעיקר למסך הבית ("מטלות קרובות", ראו app-spec 3.4)."""
    query = (
        select(CourseItem)
        .join(Course, Course.id == CourseItem.course_id)
        .where(Course.user_id == current_user.id)
    )
    if type_filter is not None:
        query = query.where(CourseItem.type == type_filter)
    if is_done is not None:
        query = query.where(CourseItem.is_done == is_done)
    return session.exec(query).all()


@router.get("/courses/{course_id}/items", response_model=list[CourseItemRead])
def list_course_items(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)
    return session.exec(select(CourseItem).where(CourseItem.course_id == course_id)).all()


@router.post(
    "/courses/{course_id}/items",
    response_model=CourseItemRead,
    status_code=status.HTTP_201_CREATED,
)
def add_course_item(
    course_id: int,
    payload: CourseItemCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)
    return add_course_item_service(session, course_id, payload)


@router.put("/items/{item_id}", response_model=CourseItemRead)
def update_course_item(
    item_id: int,
    payload: CourseItemUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    item = get_owned_course_item(item_id, current_user.id, session)
    return update_course_item_service(session, item, payload)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course_item(
    item_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)
):
    item = session.get(CourseItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    course = session.get(Course, item.course_id)
    if not course or course.user_id != user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    session.delete(item)
    session.commit()
    return None

@router.post(
    "/courses/{course_id}/items/batch-lessons",
    response_model=list[CourseItemRead],
    status_code=status.HTTP_201_CREATED,
)
def batch_add_lessons(
    course_id: int,
    payload: BatchLessonCreate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    course = session.get(Course, course_id)
    if not course or course.user_id != user.id:
        raise HTTPException(status_code=404, detail="Course not found")

    # We start numbering from 01, but the order field is sequential
    return add_lessons(session, course_id, [f"שיעור {i:02d}" for i in range(1, payload.count + 1)])


# ברירת המחדל למספור לפי סוג: ממ"נים מתחילים ב-11, ממ"חים ב-01 (כמו באו"פ)
_BATCH_DEFAULT_START = {AssignmentKind.mmn: 11, AssignmentKind.mmh: 1, AssignmentKind.other: 1}


def assignment_title(kind: AssignmentKind, number: int) -> str:
    if kind == AssignmentKind.mmn:
        return f'ממ"ן {number}'
    if kind == AssignmentKind.mmh:
        return f'ממ"ח {number:02d}'
    return f"מטלה {number}"


def _series_due_date(payload: BatchAssignmentCreate, index: int) -> datetime | None:
    """תאריך ההגשה של המטלה ה-index בסדרה: הראשונה + index * המרווח (ברירת מחדל 3 שבועות)."""
    if payload.first_due_date is None:
        return None
    return payload.first_due_date + timedelta(weeks=index * (payload.interval_weeks or 3))


@router.post(
    "/courses/{course_id}/items/batch-assignments",
    response_model=list[CourseItemRead],
    status_code=status.HTTP_201_CREATED,
)
def batch_add_assignments(
    course_id: int,
    payload: BatchAssignmentCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """יצירת סדרת מטלות ממוספרות בבת אחת - למשל ממ"ן 11 עד ממ"ן 15."""
    get_owned_course(course_id, current_user.id, session)
    start = payload.start_number if payload.start_number is not None else _BATCH_DEFAULT_START[payload.kind]
    items = [
        CourseItem(
            course_id=course_id,
            type=CourseItemType.assignment,
            title=assignment_title(payload.kind, start + i),
            kind=payload.kind,
            weight_percent=payload.weight_percent,
            is_mandatory=payload.is_mandatory,
            order=start + i,
            due_date=_series_due_date(payload, i),
        )
        for i in range(payload.count)
    ]
    session.add_all(items)
    session.commit()
    for item in items:
        session.refresh(item)
    return items
