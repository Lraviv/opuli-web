"""כלי תכנון: דרישות תואר לפי קטגוריה, קישורים אישיים, ומפגשים קבועים (מערכת שעות)."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, func, select

from ..authz import get_owned_course, get_owned_degree
from ..db import get_session
from ..deps import get_current_user
from ..models import ClassSession, Course, DegreeRequirement, Link, User
from ..schemas import (
    ClassSessionCreate,
    ClassSessionRead,
    ClassSessionUpdate,
    DegreeRequirementRead,
    DegreeRequirementsReplace,
    LinkCreate,
    LinkRead,
    LinkUpdate,
)
from ..services.class_sessions import InvalidSession, create_class_session, update_class_session

router = APIRouter(tags=["planner"])


# ---------------------------------------------------------------------------
# דרישות תואר
# ---------------------------------------------------------------------------


def _list_requirements(degree_id: int, session: Session) -> list[DegreeRequirement]:
    return list(
        session.exec(
            select(DegreeRequirement)
            .where(DegreeRequirement.degree_id == degree_id)
            .order_by(DegreeRequirement.sort_order, DegreeRequirement.id)
        ).all()
    )


@router.get("/degrees/{degree_id}/requirements", response_model=list[DegreeRequirementRead])
def list_requirements(
    degree_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_degree(degree_id, current_user.id, session)
    return _list_requirements(degree_id, session)


@router.put("/degrees/{degree_id}/requirements", response_model=list[DegreeRequirementRead])
def replace_requirements(
    degree_id: int,
    payload: DegreeRequirementsReplace,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """מחליף את כל רשימת הדרישות של התואר בזו שנשלחה (לפי הסדר) - עריכה ברשימה אחת."""
    get_owned_degree(degree_id, current_user.id, session)
    for existing in _list_requirements(degree_id, session):
        session.delete(existing)
    session.flush()
    for i, req in enumerate(payload.requirements):
        session.add(DegreeRequirement(degree_id=degree_id, category=req.category, min_credits=req.min_credits, sort_order=i))
    session.commit()
    return _list_requirements(degree_id, session)


# ---------------------------------------------------------------------------
# קישורים אישיים
# ---------------------------------------------------------------------------


def _get_owned_link(link_id: int, user_id: int, session: Session) -> Link:
    link = session.get(Link, link_id)
    if link is None or link.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="קישור לא נמצא")
    return link


@router.get("/links", response_model=list[LinkRead])
def list_links(
    course_id: int | None = Query(default=None),
    scope: str | None = Query(default=None, pattern="^(global|all)$"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """?course_id=X - הקישורים של קורס. ?scope=global - הקישורים הכלליים (מסך הבית).
    בלי פרמטרים / scope=all - הכול."""
    query = select(Link).where(Link.user_id == current_user.id)
    if course_id is not None:
        get_owned_course(course_id, current_user.id, session)
        query = query.where(Link.course_id == course_id)
    elif scope == "global":
        query = query.where(Link.course_id.is_(None))
    return session.exec(query.order_by(Link.sort_order, Link.id)).all()


@router.post("/links", response_model=LinkRead, status_code=status.HTTP_201_CREATED)
def create_link(
    payload: LinkCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if payload.course_id is not None:
        get_owned_course(payload.course_id, current_user.id, session)
    scope_filter = Link.course_id == payload.course_id if payload.course_id is not None else Link.course_id.is_(None)
    current_max = session.exec(
        select(func.max(Link.sort_order)).where(Link.user_id == current_user.id, scope_filter)
    ).one()
    link = Link(
        user_id=current_user.id,
        course_id=payload.course_id,
        title=payload.title,
        url=payload.url,
        sort_order=(current_max if current_max is not None else -1) + 1,
    )
    session.add(link)
    session.commit()
    session.refresh(link)
    return link


@router.put("/links/{link_id}", response_model=LinkRead)
def update_link(
    link_id: int,
    payload: LinkUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    link = _get_owned_link(link_id, current_user.id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(link, field, value)
    session.add(link)
    session.commit()
    session.refresh(link)
    return link


@router.delete("/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_link(
    link_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    link = _get_owned_link(link_id, current_user.id, session)
    session.delete(link)
    session.commit()


# ---------------------------------------------------------------------------
# מפגשים קבועים
# ---------------------------------------------------------------------------


def _get_owned_session(session_id: int, user_id: int, session: Session) -> ClassSession:
    class_session = session.get(ClassSession, session_id)
    if class_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="מפגש לא נמצא")
    get_owned_course(class_session.course_id, user_id, session)
    return class_session


@router.get("/sessions", response_model=list[ClassSessionRead])
def list_all_sessions(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """כל המפגשים הקבועים מכל הקורסים - למסך הלו"ז."""
    return session.exec(
        select(ClassSession)
        .join(Course, Course.id == ClassSession.course_id)
        .where(Course.user_id == current_user.id)
        .order_by(ClassSession.weekday, ClassSession.start_time)
    ).all()


@router.get("/courses/{course_id}/sessions", response_model=list[ClassSessionRead])
def list_course_sessions(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)
    return session.exec(
        select(ClassSession)
        .where(ClassSession.course_id == course_id)
        .order_by(ClassSession.weekday, ClassSession.start_time)
    ).all()


@router.post("/courses/{course_id}/sessions", response_model=ClassSessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    course_id: int,
    payload: ClassSessionCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)
    return create_class_session(session, course_id, payload)


@router.put("/sessions/{session_id}", response_model=ClassSessionRead)
def update_session(
    session_id: int,
    payload: ClassSessionUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    class_session = _get_owned_session(session_id, current_user.id, session)
    try:
        return update_class_session(session, class_session, payload)
    except InvalidSession as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    class_session = _get_owned_session(session_id, current_user.id, session)
    session.delete(class_session)
    session.commit()
