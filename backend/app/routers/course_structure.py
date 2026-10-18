"""מבנה קורס משותף: המטלות, המשקלים וכללי הציון שסטודנטים אחרים כבר הזינו לאותו קורס.

הסטודנט/ית הראשון/ה שמזינים את הממ"נים והמשקלים של קורס (לפי מוסד + מספר קורס,
ראו SharedCourse) חוסכים את ההקלדה לכל השאר. משתפים רק את המבנה: שמות המטלות, סוג,
משקל, חובה וכללי הציון. תאריכים, ציונים והגשות נשארים פרטיים.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from ..authz import get_owned_course
from ..db import get_session
from ..deps import get_current_user
from ..models import AssignmentKind, Course, CourseItem, CourseItemType, User
from ..schemas import CourseItemRead
from ..tips import resolve_shared_course

router = APIRouter(tags=["course-structure"])

# כמו בלשונית העצות: מי שלא הגדיר/ה שם תצוגה
ANONYMOUS_NAME = "סטודנט/ית"

# כללי הציון שעוברים עם המבנה (כולם שדות של Course)
RULE_FIELDS = (
    "exam_weight",
    "min_exam_grade",
    "pass_grade",
    "min_assignments_count",
    "min_assignments_weight",
    "assignments_shield",
)


class StructureAssignment(BaseModel):
    title: str
    kind: AssignmentKind | None
    weight_percent: float | None
    is_mandatory: bool


class StructureRules(BaseModel):
    exam_weight: float | None = None
    min_exam_grade: float | None = None
    pass_grade: float | None = None
    min_assignments_count: int | None = None
    min_assignments_weight: float | None = None
    assignments_shield: bool = False


class SharedStructureRead(BaseModel):
    assignments: list[StructureAssignment]
    rules: StructureRules
    # כמה סטודנטים (חוץ ממך) משתמשים בדיוק במבנה הזה
    students: int
    # שם התצוגה של מי שהזין/ה אותו לאחרונה
    entered_by: str


def _assignments(course_id: int, session: Session) -> list[CourseItem]:
    items = session.exec(
        select(CourseItem).where(CourseItem.course_id == course_id, CourseItem.type == CourseItemType.assignment)
    ).all()
    return sorted(items, key=lambda i: (i.order is None, i.order or 0, i.title))


def _structure(course: Course, items: list[CourseItem]) -> tuple[list[StructureAssignment], StructureRules]:
    assignments = [
        StructureAssignment(title=i.title, kind=i.kind, weight_percent=i.weight_percent, is_mandatory=i.is_mandatory)
        for i in items
    ]
    rules = StructureRules(**{f: getattr(course, f) for f in RULE_FIELDS})
    return assignments, rules


def find_shared_structure(course: Course, session: Session) -> SharedStructureRead | None:
    """המבנה הנפוץ ביותר בין הסטודנטים האחרים באותו קורס משותף (בשוויון - העדכני ביותר)."""
    shared = resolve_shared_course(course, session)
    if shared is None:
        return None
    others = session.exec(
        select(Course)
        .where(Course.shared_course_id == shared.id, Course.user_id != course.user_id)
        .order_by(Course.created_at.desc())
    ).all()

    groups: dict[str, list[tuple[Course, list[StructureAssignment], StructureRules]]] = defaultdict(list)
    seen_users: set[int] = set()
    for other in others:
        # סטודנט/ית שלקחו את הקורס כמה פעמים נספרים פעם אחת, לפי הניסיון האחרון
        if other.user_id in seen_users:
            continue
        items = _assignments(other.id, session)
        if not items:
            continue
        seen_users.add(other.user_id)
        assignments, rules = _structure(other, items)
        key = repr(([a.model_dump() for a in assignments], rules.model_dump()))
        groups[key].append((other, assignments, rules))

    if not groups:
        return None
    # הקבוצה הגדולה ביותר; others ממוין מהחדש לישן, אז groups[...][0] הוא העדכני בכל קבוצה
    best = max(groups.values(), key=lambda g: (len(g), g[0][0].created_at))
    latest, assignments, rules = best[0]
    author = session.get(User, latest.user_id)
    return SharedStructureRead(
        assignments=assignments,
        rules=rules,
        students=len(best),
        entered_by=(author.display_name if author and author.display_name else ANONYMOUS_NAME),
    )


@router.get("/courses/{course_id}/shared-structure", response_model=SharedStructureRead | None)
def get_shared_structure(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    course = get_owned_course(course_id, current_user.id, session)
    return find_shared_structure(course, session)


@router.post(
    "/courses/{course_id}/shared-structure/apply",
    response_model=list[CourseItemRead],
    status_code=status.HTTP_201_CREATED,
)
def apply_shared_structure(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """מעתיק את המבנה המשותף לקורס שעוד אין בו מטלות: יוצר את המטלות (בלי תאריכים) וממלא את כללי הציון."""
    course = get_owned_course(course_id, current_user.id, session)
    if _assignments(course.id, session):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="בקורס כבר יש מטלות")
    structure = find_shared_structure(course, session)
    if structure is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="אין עדיין מבנה משותף לקורס הזה")

    items = [
        CourseItem(
            course_id=course.id,
            type=CourseItemType.assignment,
            title=a.title,
            kind=a.kind,
            weight_percent=a.weight_percent,
            is_mandatory=a.is_mandatory,
            order=i,
        )
        for i, a in enumerate(structure.assignments)
    ]
    session.add_all(items)
    for field, value in structure.rules.model_dump().items():
        setattr(course, field, value)
    session.add(course)
    session.commit()
    for item in items:
        session.refresh(item)
    return items
