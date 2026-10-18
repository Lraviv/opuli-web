from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from ..authz import get_catalog_course_in_own_degree, get_owned_degree
from ..catalog_templates import TEMPLATES, get_template
from ..db import get_session
from ..deps import get_current_user
from ..models import CatalogCourse, Course, Degree, DegreeRequirement, User
from ..tips import code_from_catalog_notes, resolve_shared_course
from ..schemas import (
    CatalogCourseCreate,
    CatalogCourseRead,
    CatalogCourseSelect,
    CatalogCourseUpdate,
    CourseRead,
    DegreeCreate,
    DegreeRead,
    DegreeTemplateRead,
    DegreeUpdate,
)

router = APIRouter(tags=["degrees"])


# ---------------------------------------------------------------------------
# תבניות תואר (קטלוג קבוע וזהה לכל המשתמשים, ראו app/catalog_templates.py)
# ---------------------------------------------------------------------------


@router.get("/degree-templates", response_model=list[DegreeTemplateRead])
def list_degree_templates():
    """תבניות תואר מוכנות - למשל "מדעי המחשב (האו"פ)". נבחרות ב-POST /degrees
    (שדה template) כדי לטעון אוטומטית את קטלוג הקורסים המלא של התואר."""
    return [
        DegreeTemplateRead(
            key=t.key,
            name=t.name,
            institution=t.institution,
            target_credits=t.target_credits,
            course_count=len(t.courses),
            requirements=[{"category": c, "min_credits": m} for c, m in t.requirements()],
        )
        for t in TEMPLATES.values()
    ]


# ---------------------------------------------------------------------------
# תארים
# ---------------------------------------------------------------------------


@router.get("/degrees", response_model=list[DegreeRead])
def list_degrees(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return session.exec(select(Degree).where(Degree.user_id == current_user.id)).all()


@router.post("/degrees", response_model=DegreeRead, status_code=status.HTTP_201_CREATED)
def create_degree(
    payload: DegreeCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    template = get_template(payload.template) if payload.template else None
    if payload.template and template is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="תבנית לא מוכרת")

    # exclude_unset - כדי שנוכל להשלים institution/target_credits מהתבנית רק
    # כשהמשתמש/ת לא סיפקו אותם בעצמם (ולא לדרוס עם None כי הם Optional)
    data = payload.model_dump(exclude={"template"}, exclude_unset=True)
    if template is not None:
        data.setdefault("institution", template.institution)
        data.setdefault("target_credits", template.target_credits)

    degree = Degree(user_id=current_user.id, **data)
    session.add(degree)
    session.commit()
    session.refresh(degree)

    if template is not None:
        # קטלוג הקורסים של התבנית קבוע וזהה לכל המשתמשים - נטען פה, בזמן
        # היצירה, ולא דורש הרשמה נפרדת (שלב "בחירה מהקטלוג") לכל קורס.
        for course in template.courses:
            session.add(
                CatalogCourse(
                    degree_id=degree.id,
                    name=course.name,
                    credits=course.credits,
                    category=course.category,
                    notes=f"מספר קורס: {course.code}" if course.code else None,
                )
            )
        # דרישות התואר נטענות יחד עם הקטלוג, כדי שהתואר ייפתח מוכן
        for i, (category, min_credits) in enumerate(template.requirements()):
            session.add(DegreeRequirement(degree_id=degree.id, category=category, min_credits=min_credits, sort_order=i))
        session.commit()

    return degree


@router.put("/degrees/{degree_id}", response_model=DegreeRead)
def update_degree(
    degree_id: int,
    payload: DegreeUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    degree = get_owned_degree(degree_id, current_user.id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(degree, field, value)
    session.add(degree)
    session.commit()
    session.refresh(degree)
    return degree


@router.delete("/degrees/{degree_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_degree(
    degree_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """מוחקת את התואר ואת קטלוג הקורסים שלו.

    הקורסים האישיים (Course) שכבר נבחרו מתוך התואר הזה **לא נמחקים** - הם
    מכילים העתק עצמאי של שם/נ"ז (snapshot), ורק מנותקים מהתואר/מהקטלוג
    (degree_id, catalog_course_id -> NULL) כדי לשמור את ההיסטוריה של המשתמש.
    """
    degree = get_owned_degree(degree_id, current_user.id, session)

    catalog_courses = session.exec(
        select(CatalogCourse).where(CatalogCourse.degree_id == degree_id)
    ).all()
    for catalog_course in catalog_courses:
        session.delete(catalog_course)

    for requirement in session.exec(
        select(DegreeRequirement).where(DegreeRequirement.degree_id == degree_id)
    ).all():
        session.delete(requirement)

    courses = session.exec(select(Course).where(Course.degree_id == degree_id)).all()
    for course in courses:
        course.degree_id = None
        course.catalog_course_id = None
        session.add(course)

    session.delete(degree)
    session.commit()


# ---------------------------------------------------------------------------
# קטלוג קורסים של תואר
# ---------------------------------------------------------------------------


@router.get("/degrees/{degree_id}/catalog", response_model=list[CatalogCourseRead])
def list_catalog(
    degree_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_degree(degree_id, current_user.id, session)
    catalog_courses = session.exec(
        select(CatalogCourse).where(CatalogCourse.degree_id == degree_id)
    ).all()

    # מסמנים אילו כבר נבחרו ע"י המשתמש (יש Course שמצביע לקורס הקטלוג הזה)
    selected_ids = set(
        session.exec(
            select(Course.catalog_course_id).where(
                Course.user_id == current_user.id,
                Course.catalog_course_id.is_not(None),
            )
        ).all()
    )

    result = []
    for cc in catalog_courses:
        item = CatalogCourseRead.model_validate(cc)
        item.already_selected = cc.id in selected_ids
        result.append(item)
    return result


@router.post(
    "/degrees/{degree_id}/catalog",
    response_model=CatalogCourseRead,
    status_code=status.HTTP_201_CREATED,
)
def add_catalog_course(
    degree_id: int,
    payload: CatalogCourseCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_degree(degree_id, current_user.id, session)
    catalog_course = CatalogCourse(degree_id=degree_id, **payload.model_dump())
    session.add(catalog_course)
    session.commit()
    session.refresh(catalog_course)
    return catalog_course


@router.put("/catalog-courses/{catalog_course_id}", response_model=CatalogCourseRead)
def update_catalog_course(
    catalog_course_id: int,
    payload: CatalogCourseUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    catalog_course = get_catalog_course_in_own_degree(catalog_course_id, current_user.id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(catalog_course, field, value)
    session.add(catalog_course)
    session.commit()
    session.refresh(catalog_course)
    return catalog_course


@router.delete("/catalog-courses/{catalog_course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_catalog_course(
    catalog_course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    catalog_course = get_catalog_course_in_own_degree(catalog_course_id, current_user.id, session)

    # קורסים אישיים שכבר נבחרו מהקורס הזה שומרים את שמם/נ"ז (snapshot) -
    # רק מנתקים את ההפניה כדי לא לאבד היסטוריה
    linked_courses = session.exec(
        select(Course).where(Course.catalog_course_id == catalog_course_id)
    ).all()
    for course in linked_courses:
        course.catalog_course_id = None
        session.add(course)

    session.delete(catalog_course)
    session.commit()


@router.post(
    "/catalog-courses/{catalog_course_id}/select",
    response_model=CourseRead,
    status_code=status.HTTP_201_CREATED,
)
def select_catalog_course(
    catalog_course_id: int,
    payload: CatalogCourseSelect,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """בוחרים קורס מהקטלוג -> נוצר קורס אישי (Course) שמעתיק ממנו שם/נ"ז/קטגוריה.

    שימי לב: אין בעיה לבחור אותו קורס קטלוג יותר מפעם אחת (למשל אם נכשלים
    וצריך לקחת אותו שוב) - כל בחירה יוצרת רשומת Course נפרדת.
    """
    catalog_course = get_catalog_course_in_own_degree(catalog_course_id, current_user.id, session)

    course = Course(
        user_id=current_user.id,
        degree_id=catalog_course.degree_id,
        catalog_course_id=catalog_course.id,
        name=catalog_course.name,
        credits=catalog_course.credits,
        category=catalog_course.category,
        status=payload.status,
        semester=payload.semester,
        grade=payload.grade,
        course_code=code_from_catalog_notes(catalog_course.notes),
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    resolve_shared_course(course, session)
    return course
