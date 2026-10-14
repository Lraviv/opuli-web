"""לשונית "עצות מסטודנטים" בקורס: תגובות, תשובות והצבעות אנונימיות.

כל הנתיבים עוברים דרך קורס אישי של המשתמש/ת (course_id) או דרך תגובה, והשרת
מוודא שלמשתמש/ת יש קורס שמקושר לאותו קורס משותף. מי שמצביע/ה לא נחשף/ת אף פעם.
"""

from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlmodel import Session, select

from ..authz import get_owned_course
from ..db import get_session
from ..deps import get_current_user
from ..models import Course, CoursePost, CoursePostVote, SharedCourse, User
from ..tips import resolve_shared_course

router = APIRouter(tags=["tips"])

MAX_BODY = 2000
PAGE_SIZE = 20
REPLIES_PREVIEW = 2
# הגנה בסיסית מהצפה: כמה תגובות (כולל תשובות) מותר לכתוב בשעה
POSTS_PER_HOUR = 20
ANONYMOUS_NAME = "סטודנט/ית"


def _clean_body(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("התגובה ריקה")
    return v


class TipCreate(BaseModel):
    body: str = Field(..., max_length=MAX_BODY)
    parent_id: int | None = None

    _clean = field_validator("body")(_clean_body)


class TipUpdate(BaseModel):
    body: str = Field(..., max_length=MAX_BODY)

    _clean = field_validator("body")(_clean_body)


class VoteIn(BaseModel):
    value: Literal[-1, 0, 1]


class TipAuthor(BaseModel):
    display_name: str
    avatar_icon: str | None = None


class TipRead(BaseModel):
    id: int
    parent_id: int | None
    author: TipAuthor | None  # None = התגובה נמחקה
    reply_to_name: str | None = None
    body: str
    created_at: datetime
    edited: bool
    deleted: bool
    score: int
    my_vote: int
    is_mine: bool
    reply_count: int
    replies: list["TipRead"] = []


class SharedCourseInfo(BaseModel):
    code: str
    institution: str
    name: str
    participants: int


class TipsPage(BaseModel):
    # False = לקורס אין מספר קורס, ולכן אין לו עדיין דיון משותף
    linked: bool
    course: SharedCourseInfo | None = None
    total: int = 0
    items: list[TipRead] = []


# ---------------------------------------------------------------------------
# עזרים
# ---------------------------------------------------------------------------


def _shared_for_course(course_id: int, user: User, session: Session) -> SharedCourse | None:
    course = get_owned_course(course_id, user.id, session)
    return resolve_shared_course(course, session)


def _is_member(shared_course_id: int, user_id: int, session: Session) -> bool:
    shared = session.get(SharedCourse, shared_course_id)
    if shared is None:
        return False
    # הקישור לקורס המשותף מחושב בעצלות, אז בודקים כל קורס של המשתמש/ת עם אותו
    # מספר (בדרך כלל אחד) ומקשרים אותו עכשיו אם עוד לא קושר
    candidates = session.exec(
        select(Course).where(Course.user_id == user_id, Course.course_code == shared.code)
    ).all()
    return any(
        (linked := resolve_shared_course(c, session)) is not None and linked.id == shared_course_id
        for c in candidates
    )


def _get_visible_post(post_id: int, user: User, session: Session) -> CoursePost:
    post = session.get(CoursePost, post_id)
    if post is None or not _is_member(post.shared_course_id, user.id, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
    return post


def _serialize(posts: list[CoursePost], user: User, session: Session) -> list[TipRead]:
    if not posts:
        return []
    user_ids = {p.user_id for p in posts} | {p.reply_to_user_id for p in posts if p.reply_to_user_id}
    users = {u.id: u for u in session.exec(select(User).where(User.id.in_(user_ids))).all()}
    votes = dict(
        session.exec(
            select(CoursePostVote.post_id, CoursePostVote.value).where(
                CoursePostVote.user_id == user.id, CoursePostVote.post_id.in_([p.id for p in posts])
            )
        ).all()
    )

    def name(uid: int | None) -> str | None:
        if uid is None:
            return None
        u = users.get(uid)
        if u is None:
            return ANONYMOUS_NAME
        return (u.display_name or "").strip() or ANONYMOUS_NAME

    out = []
    for p in posts:
        deleted = p.deleted_at is not None
        author = users.get(p.user_id)
        out.append(
            TipRead(
                id=p.id,
                parent_id=p.parent_id,
                author=None
                if deleted
                else TipAuthor(display_name=name(p.user_id), avatar_icon=author.avatar_icon if author else None),
                reply_to_name=name(p.reply_to_user_id),
                body="" if deleted else p.body,
                created_at=p.created_at,
                edited=p.edited_at is not None,
                deleted=deleted,
                score=p.score,
                my_vote=votes.get(p.id, 0),
                is_mine=p.user_id == user.id and not deleted,
                reply_count=p.reply_count,
            )
        )
    return out


# ---------------------------------------------------------------------------
# נתיבים
# ---------------------------------------------------------------------------


@router.get("/courses/{course_id}/tips", response_model=TipsPage)
def list_tips(
    course_id: int,
    sort: Literal["top", "new", "old"] = Query(default="top"),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=PAGE_SIZE, ge=1, le=500),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    shared = _shared_for_course(course_id, current_user, session)
    if shared is None:
        return TipsPage(linked=False)

    base = select(CoursePost).where(CoursePost.shared_course_id == shared.id, CoursePost.parent_id.is_(None))
    if sort == "new":
        order = (CoursePost.created_at.desc(), CoursePost.id.desc())
    elif sort == "old":
        order = (CoursePost.created_at.asc(), CoursePost.id.asc())
    else:
        # הכי מומלצות; בשוויון ניקוד (כולל כשהכול 0) - החדשה קודם
        order = (CoursePost.score.desc(), CoursePost.created_at.desc(), CoursePost.id.desc())
    posts = session.exec(base.order_by(*order).offset(offset).limit(limit)).all()
    total = session.exec(
        select(func.count()).select_from(CoursePost).where(
            CoursePost.shared_course_id == shared.id, CoursePost.parent_id.is_(None)
        )
    ).one()
    participants = session.exec(
        select(func.count(func.distinct(Course.user_id))).where(Course.shared_course_id == shared.id)
    ).one()

    # תצוגה מקדימה של התשובות: שתי הראשונות (מהישנה לחדשה) לכל תגובה בעמוד
    replies_by_parent: dict[int, list[CoursePost]] = {}
    if posts:
        replies = session.exec(
            select(CoursePost)
            .where(CoursePost.parent_id.in_([p.id for p in posts]))
            .order_by(CoursePost.created_at.asc(), CoursePost.id.asc())
        ).all()
        for r in replies:
            bucket = replies_by_parent.setdefault(r.parent_id, [])
            if len(bucket) < REPLIES_PREVIEW:
                bucket.append(r)

    preview = [r for p in posts for r in replies_by_parent.get(p.id, [])]
    serialized = _serialize(list(posts) + preview, current_user, session)
    by_id = {t.id: t for t in serialized}
    items = []
    for p in posts:
        tip = by_id[p.id]
        tip.replies = [by_id[r.id] for r in replies_by_parent.get(p.id, [])]
        items.append(tip)

    return TipsPage(
        linked=True,
        course=SharedCourseInfo(
            code=shared.code, institution=shared.institution, name=shared.name, participants=participants
        ),
        total=total,
        items=items,
    )


@router.get("/tips/{post_id}/replies", response_model=list[TipRead])
def list_replies(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    replies = session.exec(
        select(CoursePost)
        .where(CoursePost.parent_id == post.id)
        .order_by(CoursePost.created_at.asc(), CoursePost.id.asc())
    ).all()
    return _serialize(list(replies), current_user, session)


@router.post("/courses/{course_id}/tips", response_model=TipRead, status_code=status.HTTP_201_CREATED)
def create_tip(
    course_id: int,
    payload: TipCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    shared = _shared_for_course(course_id, current_user, session)
    if shared is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="צריך להוסיף מספר קורס כדי להצטרף לדיון")

    hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent = session.exec(
        select(func.count()).select_from(CoursePost).where(
            CoursePost.user_id == current_user.id, CoursePost.created_at >= hour_ago
        )
    ).one()
    if recent >= POSTS_PER_HOUR:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="כתבת הרבה תגובות בשעה האחרונה. נסו שוב מאוחר יותר")

    parent = None
    reply_to_user_id = None
    if payload.parent_id is not None:
        target = session.get(CoursePost, payload.parent_id)
        if target is None or target.shared_course_id != shared.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
        if target.parent_id is None:
            parent = target
        else:
            # תשובה לתשובה: נשארת באותו שרשור, עם "בתגובה ל־"
            parent = session.get(CoursePost, target.parent_id)
            reply_to_user_id = target.user_id
        if parent.deleted_at is not None and parent.reply_count == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")

    post = CoursePost(
        shared_course_id=shared.id,
        user_id=current_user.id,
        parent_id=parent.id if parent else None,
        reply_to_user_id=reply_to_user_id,
        body=payload.body,
    )
    session.add(post)
    if parent is not None:
        parent.reply_count += 1
        session.add(parent)
    session.commit()
    session.refresh(post)
    return _serialize([post], current_user, session)[0]


@router.patch("/tips/{post_id}", response_model=TipRead)
def update_tip(
    post_id: int,
    payload: TipUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if post.user_id != current_user.id or post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
    if payload.body != post.body:
        post.body = payload.body
        post.edited_at = datetime.utcnow()
        session.add(post)
        session.commit()
        session.refresh(post)
    return _serialize([post], current_user, session)[0]


def _hard_delete(post: CoursePost, session: Session) -> None:
    for vote in session.exec(select(CoursePostVote).where(CoursePostVote.post_id == post.id)).all():
        session.delete(vote)
    # קודם מוחקים את ההצבעות במסד, ורק אז את התגובה (מפתח זר ב-Postgres)
    session.flush()
    session.delete(post)


@router.delete("/tips/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tip(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if post.user_id != current_user.id or post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")

    if post.parent_id is None and post.reply_count > 0:
        # יש תשובות - משאירים "התגובה נמחקה" כדי לא לשבור את השרשור
        post.deleted_at = datetime.utcnow()
        post.body = ""
        session.add(post)
        session.commit()
        return

    parent = session.get(CoursePost, post.parent_id) if post.parent_id else None
    _hard_delete(post, session)
    if parent is not None:
        parent.reply_count = max(0, parent.reply_count - 1)
        if parent.deleted_at is not None and parent.reply_count == 0:
            # התשובה האחרונה מתחת לתגובה שנמחקה - אין יותר מה לשמור
            session.flush()
            _hard_delete(parent, session)
        else:
            session.add(parent)
    session.commit()


@router.put("/tips/{post_id}/vote", response_model=TipRead)
def vote_tip(
    post_id: int,
    payload: VoteIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
    if post.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="אי אפשר להצביע על תגובה שלך")

    vote = session.get(CoursePostVote, (post.id, current_user.id))
    if payload.value == 0:
        if vote is not None:
            session.delete(vote)
    elif vote is None:
        session.add(CoursePostVote(post_id=post.id, user_id=current_user.id, value=payload.value))
    else:
        vote.value = payload.value
        session.add(vote)
    session.flush()

    # מחשבים מחדש מהטבלה (ולא +1/-1) כדי שהניקוד לא "יזלוג" בהצבעות מקבילות
    post.score = session.exec(
        select(func.coalesce(func.sum(CoursePostVote.value), 0)).where(CoursePostVote.post_id == post.id)
    ).one()
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize([post], current_user, session)[0]
