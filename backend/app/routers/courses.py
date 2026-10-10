from datetime import datetime
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
from ..tips import normalize_course_code, resolve_shared_course
from ..schemas import (
    BatchAssignmentCreate,
    CourseCreate,
    CourseItemCreate,
    CourseItemRead,
    CourseItemUpdate,
    CourseRead,
    CourseUpdate,
)

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
    data = payload.model_dump()
    data["course_code"] = normalize_course_code(data.get("course_code"))
    course = Course(user_id=current_user.id, **data)
    session.add(course)
    session.commit()
    session.refresh(course)
    resolve_shared_course(course, session)
    return course


@router.put("/courses/{course_id}", response_model=CourseRead)
def update_course(
    course_id: int,
    payload: CourseUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    course = get_owned_course(course_id, current_user.id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "assignments_shield" and value is None:
            continue  # עמודה לא-nullable - null מפורש פשוט מתעלמים ממנו
        if field == "course_code":
            value = normalize_course_code(value)
        setattr(course, field, value)
    session.add(course)
    session.commit()
    session.refresh(course)
    resolve_shared_course(course, session)
    return course


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
        session.delete(exam)

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
    item = CourseItem(course_id=course_id, **payload.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put("/items/{item_id}", response_model=CourseItemRead)
def update_course_item(
    item_id: int,
    payload: CourseItemUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    item = get_owned_course_item(item_id, current_user.id, session)
    if "is_done" in payload.model_dump(exclude_unset=True):
        if payload.is_done and not item.is_done:
            item.completed_at = datetime.utcnow()
        elif not payload.is_done and item.is_done:
            item.completed_at = None

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "is_mandatory" and value is None:
            continue
        setattr(item, field, value)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


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

    # Find the current max order for lessons in this course
    stmt = select(CourseItem).where(CourseItem.course_id == course_id, CourseItem.type == CourseItemType.lesson)
    existing_lessons = session.exec(stmt).all()
    max_order = max([item.order or 0 for item in existing_lessons], default=0)

    new_items = []
    for i in range(1, payload.count + 1):
        # We start numbering from 01, but the order field is sequential
        title = f"שיעור {i:02d}"
        item = CourseItem(
            course_id=course_id,
            type=CourseItemType.lesson,
            title=title,
            order=max_order + i,
        )
        session.add(item)
        new_items.append(item)

    session.commit()
    for item in new_items:
        session.refresh(item)
    
    return new_items


# ברירת המחדל למספור לפי סוג: ממ"נים מתחילים ב-11, ממ"חים ב-01 (כמו באו"פ)
_BATCH_DEFAULT_START = {AssignmentKind.mmn: 11, AssignmentKind.mmh: 1, AssignmentKind.other: 1}


def assignment_title(kind: AssignmentKind, number: int) -> str:
    if kind == AssignmentKind.mmn:
        return f'ממ"ן {number}'
    if kind == AssignmentKind.mmh:
        return f'ממ"ח {number:02d}'
    return f"מטלה {number}"


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
        )
        for i in range(payload.count)
    ]
    session.add_all(items)
    session.commit()
    for item in items:
        session.refresh(item)
    return items
