"""חומר לימוד: רשימת נושאים לסימון בכל קורס (הכנה למבחן)."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, func, select

from ..authz import get_owned_course
from ..db import get_session
from ..deps import get_current_user
from ..models import StudyTopic, User
from ..schemas import StudyTopicBatchCreate, StudyTopicCreate, StudyTopicRead, StudyTopicUpdate

router = APIRouter(tags=["study-topics"])


def _get_owned_topic(topic_id: int, user_id: int, session: Session) -> StudyTopic:
    topic = session.get(StudyTopic, topic_id)
    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="נושא לא נמצא")
    get_owned_course(topic.course_id, user_id, session)
    return topic


def _next_order(course_id: int, session: Session) -> int:
    current = session.exec(select(func.max(StudyTopic.order)).where(StudyTopic.course_id == course_id)).one()
    return (current if current is not None else -1) + 1


@router.get("/courses/{course_id}/topics", response_model=list[StudyTopicRead])
def list_topics(
    course_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)
    return session.exec(
        select(StudyTopic).where(StudyTopic.course_id == course_id).order_by(StudyTopic.order, StudyTopic.id)
    ).all()


@router.post("/courses/{course_id}/topics", response_model=StudyTopicRead, status_code=status.HTTP_201_CREATED)
def add_topic(
    course_id: int,
    payload: StudyTopicCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    get_owned_course(course_id, current_user.id, session)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="כותרת ריקה")
    topic = StudyTopic(course_id=course_id, title=title, order=_next_order(course_id, session))
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic


@router.post(
    "/courses/{course_id}/topics/batch",
    response_model=list[StudyTopicRead],
    status_code=status.HTTP_201_CREATED,
)
def add_topics_batch(
    course_id: int,
    payload: StudyTopicBatchCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """הדבקת רשימה מהסילבוס - כל שורה נושא, לפי הסדר. שורות ריקות מדולגות."""
    get_owned_course(course_id, current_user.id, session)
    titles = [t.strip()[:300] for t in payload.titles if t.strip()]
    if not titles:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="לא נמצאו נושאים")
    start = _next_order(course_id, session)
    topics = [StudyTopic(course_id=course_id, title=t, order=start + i) for i, t in enumerate(titles)]
    session.add_all(topics)
    session.commit()
    for t in topics:
        session.refresh(t)
    return topics


@router.put("/topics/{topic_id}", response_model=StudyTopicRead)
def update_topic(
    topic_id: int,
    payload: StudyTopicUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    topic = _get_owned_topic(topic_id, current_user.id, session)
    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        data["title"] = data["title"].strip()
        if not data["title"]:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="כותרת ריקה")
    for field, value in data.items():
        setattr(topic, field, value)
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic


@router.delete("/topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_topic(
    topic_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    topic = _get_owned_topic(topic_id, current_user.id, session)
    session.delete(topic)
    session.commit()
