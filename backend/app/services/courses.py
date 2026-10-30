from sqlmodel import Session, select

from ..models import CatalogCourse, Course, CourseItem, CourseItemType, CourseStatus
from ..schemas import CourseCreate, CourseItemCreate, CourseItemUpdate, CourseUpdate
from ..tips import code_from_catalog_notes, normalize_course_code, resolve_shared_course
from .completion import apply_done


def create_course(session: Session, user_id: int, payload: CourseCreate) -> Course:
    data = payload.model_dump()
    data["course_code"] = normalize_course_code(data.get("course_code"))
    course = Course(user_id=user_id, **data)
    session.add(course)
    session.commit()
    session.refresh(course)
    resolve_shared_course(course, session)
    return course


def course_from_catalog(
    session: Session,
    user_id: int,
    catalog_course: CatalogCourse,
    *,
    status: CourseStatus = CourseStatus.planned,
    semester: str | None = None,
    semester_id: int | None = None,
    grade: float | None = None,
) -> Course:
    """קורס אישי שמעתיק מקורס הקטלוג שם, נ"ז, קטגוריה וקוד קורס."""
    course = Course(
        user_id=user_id,
        degree_id=catalog_course.degree_id,
        catalog_course_id=catalog_course.id,
        name=catalog_course.name,
        credits=catalog_course.credits,
        category=catalog_course.category,
        status=status,
        semester=semester,
        semester_id=semester_id,
        grade=grade,
        course_code=code_from_catalog_notes(catalog_course.notes),
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    resolve_shared_course(course, session)
    return course


def update_course(session: Session, course: Course, payload: CourseUpdate) -> Course:
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


def add_course_item(session: Session, course_id: int, payload: CourseItemCreate) -> CourseItem:
    item = CourseItem(course_id=course_id, **payload.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def update_course_item(session: Session, item: CourseItem, payload: CourseItemUpdate) -> CourseItem:
    data = payload.model_dump(exclude_unset=True)
    apply_done(item, data)
    for field, value in data.items():
        if field == "is_mandatory" and value is None:
            continue
        setattr(item, field, value)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def add_lessons(session: Session, course_id: int, titles: list[str]) -> list[CourseItem]:
    """שיעורים חדשים בסוף רשימת השיעורים של הקורס, לפי הסדר."""
    existing_lessons = session.exec(
        select(CourseItem).where(CourseItem.course_id == course_id, CourseItem.type == CourseItemType.lesson)
    ).all()
    max_order = max([item.order or 0 for item in existing_lessons], default=0)

    new_items = [
        CourseItem(course_id=course_id, type=CourseItemType.lesson, title=title, order=max_order + i)
        for i, title in enumerate(titles, start=1)
    ]
    session.add_all(new_items)
    session.commit()
    for item in new_items:
        session.refresh(item)
    return new_items
