"""פורום הקהילה: פוסטים של סטודנטים מאותו מוסד - עצות, שאלות, מפגשי לימוד, מסיבות ודברים קהילתיים.

בנוי באותו דפוס כמו לשונית העצות (routers/tips.py): תגובות בשרשור ברמה אחת,
ניקוד מחושב מראש, הצבעות אנונימיות ומחיקה "רכה" כשיש תגובות.
המוסד של המשתמש/ת נלקח מהתואר שלו/ה (מנורמל), ומי שאין לו/ה מוסד בתואר לא
מחובר/ת לפורום. בפוסט של מפגש/אירוע הכתובת המדויקת ורשימת המגיעים (שם ומייל)
נחשפות רק למארגן/ת, והכתובת גם למי שאישר/ה הגעה.
"""

import html
import logging
from datetime import datetime, timedelta, timezone
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from ..authz import get_owned_course, is_admin
from ..config import settings
from ..db import get_session
from ..deps import get_current_user
from ..models import (
    Course,
    Degree,
    ForumComment,
    ForumPost,
    ForumReport,
    ForumRsvp,
    ForumSave,
    ForumVote,
    SharedCourse,
    User,
)
from ..tips import normalize_institution, resolve_shared_course
from .tips import ANONYMOUS_NAME

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/forum", tags=["forum"])

Category = Literal["tip", "question", "study", "party", "community"]
EVENT_CATEGORIES = {"study", "party"}
CATEGORY_LABEL = {"tip": "עצה", "question": "שאלה", "study": "מפגש לימוד", "party": "מסיבה ואירוע", "community": "קהילה"}

MAX_TITLE = 120
MAX_BODY = 4000
MAX_COMMENT = 2000
MAX_PLACE_PUBLIC = 120
MAX_PLACE_PRIVATE = 300
PAGE_SIZE = 20
POSTS_PER_HOUR = 10
COMMENTS_PER_HOUR = 30
# כמה מדווחים/ות שונים/ות מסתירים פוסט או תגובה עד שמנהלת בודקת
REPORTS_TO_HIDE = 3
RESEND_URL = "https://api.resend.com/emails"


def _utc_naive(dt: datetime | None) -> datetime | None:
    # כל התאריכים במסד נשמרים כ-UTC בלי אזור זמן
    if dt is None or dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _strip_required(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("השדה ריק")
    return v


def _strip_optional(v: str | None) -> str | None:
    if v is None:
        return None
    return v.strip() or None


# ---------------------------------------------------------------------------
# סכמות
# ---------------------------------------------------------------------------


class PostCreate(BaseModel):
    category: Category
    title: str = Field(..., max_length=MAX_TITLE)
    body: str = Field(..., max_length=MAX_BODY)
    # קורס אישי של המשתמש/ת - הפוסט מתויג בקורס המשותף שלו
    course_id: int | None = None
    event_starts_at: datetime | None = None
    event_ends_at: datetime | None = None
    place_public: str | None = Field(default=None, max_length=MAX_PLACE_PUBLIC)
    place_private: str | None = Field(default=None, max_length=MAX_PLACE_PRIVATE)
    # למנהלות בלבד: פרסום בשם "צוות OpuLi", נעיצה מיד, ופרסום לכל המוסדות
    as_team: bool = False
    pin: bool = False
    all_institutions: bool = False

    _req = field_validator("title", "body")(_strip_required)
    _opt = field_validator("place_public", "place_private")(_strip_optional)

    @model_validator(mode="after")
    def _event_fields(self):
        self.event_starts_at = _utc_naive(self.event_starts_at)
        self.event_ends_at = _utc_naive(self.event_ends_at)
        if self.category in EVENT_CATEGORIES:
            if self.event_starts_at is None or not self.place_public:
                raise ValueError("למפגש או לאירוע צריך תאריך ומקום")
            if self.event_ends_at is not None and self.event_ends_at < self.event_starts_at:
                raise ValueError("שעת הסיום לפני שעת ההתחלה")
        else:
            self.event_starts_at = self.event_ends_at = None
            self.place_public = self.place_private = None
        return self


class PostUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=MAX_TITLE)
    body: str | None = Field(default=None, max_length=MAX_BODY)
    event_starts_at: datetime | None = None
    event_ends_at: datetime | None = None
    place_public: str | None = Field(default=None, max_length=MAX_PLACE_PUBLIC)
    place_private: str | None = Field(default=None, max_length=MAX_PLACE_PRIVATE)

    @field_validator("title", "body")
    @classmethod
    def _req(cls, v: str | None) -> str | None:
        return None if v is None else _strip_required(v)

    _opt = field_validator("place_public", "place_private")(_strip_optional)


class CommentCreate(BaseModel):
    body: str = Field(..., max_length=MAX_COMMENT)
    parent_id: int | None = None

    _req = field_validator("body")(_strip_required)


class CommentUpdate(BaseModel):
    body: str = Field(..., max_length=MAX_COMMENT)

    _req = field_validator("body")(_strip_required)


class VoteIn(BaseModel):
    value: Literal[0, 1]


class FlagIn(BaseModel):
    value: bool


class ReportIn(BaseModel):
    target_type: Literal["post", "comment"]
    target_id: int
    reason: str = Field(default="", max_length=500)


class Author(BaseModel):
    display_name: str
    avatar_icon: str | None = None


TEAM_AUTHOR = Author(display_name="צוות OpuLi", avatar_icon="📣")
# מוסד של פוסט שמופיע בפורומים של כל המוסדות (הודעות צוות)
ALL_INSTITUTIONS = "*"


def _in_forum(inst: str):
    """תנאי SQL: פוסט שמופיע בפורום של המוסד - שלו, או הודעה לכל המוסדות."""
    return ForumPost.institution.in_([inst, ALL_INSTITUTIONS])


class CourseTag(BaseModel):
    code: str
    name: str


class EventInfo(BaseModel):
    starts_at: datetime
    ends_at: datetime | None
    place_public: str | None
    # רק למארגן/ת ולמי שאישר/ה הגעה
    place_private: str | None
    going_count: int
    i_am_going: bool


class PostRead(BaseModel):
    id: int
    category: Category
    title: str
    body: str
    author: Author | None  # None = הפוסט נמחק
    course: CourseTag | None
    event: EventInfo | None
    score: int
    voted: bool
    saved: bool
    comment_count: int
    is_mine: bool
    # פוסט רשמי של צוות OpuLi
    official: bool
    pinned: bool
    hidden: bool
    edited: bool
    deleted: bool
    created_at: datetime


class FeedPage(BaseModel):
    # False = אין מוסד בתואר, ולכן אין עדיין פורום
    linked: bool
    institution: str | None = None
    is_admin: bool = False
    total: int = 0
    items: list[PostRead] = []


class CommentRead(BaseModel):
    id: int
    parent_id: int | None
    author: Author | None
    reply_to_name: str | None = None
    body: str
    created_at: datetime
    edited: bool
    deleted: bool
    is_mine: bool
    replies: list["CommentRead"] = []


class PostDetail(BaseModel):
    post: PostRead
    comments: list[CommentRead]


class Attendee(BaseModel):
    display_name: str
    email: str
    avatar_icon: str | None = None
    created_at: datetime


class CourseActivity(BaseModel):
    course_id: int
    name: str
    post_count: int


# ---------------------------------------------------------------------------
# עזרים
# ---------------------------------------------------------------------------


def user_institution(user: User, session: Session) -> str | None:
    """המוסד של המשתמש/ת לפי התואר האחרון שיש בו מוסד. None = אין."""
    degrees = session.exec(
        select(Degree).where(Degree.user_id == user.id).order_by(Degree.created_at.desc(), Degree.id.desc())
    ).all()
    for d in degrees:
        inst = normalize_institution(d.institution)
        if inst:
            return inst
    return None


_is_admin = is_admin


def _require_institution(user: User, session: Session) -> str:
    inst = user_institution(user, session)
    if inst is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="צריך לבחור מוסד בתואר כדי להצטרף לקהילה")
    return inst


def _get_visible_post(post_id: int, user: User, session: Session) -> ForumPost:
    post = session.get(ForumPost, post_id)
    if (
        post is None
        or post.institution not in (user_institution(user, session), ALL_INSTITUTIONS)
        or (post.hidden_at is not None and not _is_admin(user))
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפוסט לא נמצא")
    return post


def _get_own_post(post_id: int, user: User, session: Session) -> ForumPost:
    post = _get_visible_post(post_id, user, session)
    if post.user_id != user.id or post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפוסט לא נמצא")
    return post


def _rate_limit(model, user: User, limit: int, session: Session) -> None:
    hour_ago = datetime.utcnow() - timedelta(hours=1)
    recent = session.exec(
        select(func.count()).select_from(model).where(model.user_id == user.id, model.created_at >= hour_ago)
    ).one()
    if recent >= limit:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="כתבת הרבה בשעה האחרונה. נסו שוב מאוחר יותר")


def _users(ids: set[int], session: Session) -> dict[int, User]:
    if not ids:
        return {}
    return {u.id: u for u in session.exec(select(User).where(User.id.in_(ids))).all()}


def _name(u: User | None) -> str:
    if u is None:
        return ANONYMOUS_NAME
    return (u.display_name or "").strip() or ANONYMOUS_NAME


def _mine(model, post_ids: list[int], user: User, session: Session) -> set[int]:
    if not post_ids:
        return set()
    return set(session.exec(select(model.post_id).where(model.user_id == user.id, model.post_id.in_(post_ids))).all())


def _serialize_posts(posts: list[ForumPost], user: User, session: Session) -> list[PostRead]:
    if not posts:
        return []
    ids = [p.id for p in posts]
    users = _users({p.user_id for p in posts}, session)
    voted = _mine(ForumVote, ids, user, session)
    saved = _mine(ForumSave, ids, user, session)
    going = _mine(ForumRsvp, ids, user, session)
    course_ids = {p.shared_course_id for p in posts if p.shared_course_id}
    courses = (
        {c.id: c for c in session.exec(select(SharedCourse).where(SharedCourse.id.in_(course_ids))).all()}
        if course_ids
        else {}
    )

    out = []
    for p in posts:
        deleted = p.deleted_at is not None
        author = users.get(p.user_id)
        mine = p.user_id == user.id
        event = None
        if p.event_starts_at is not None:
            event = EventInfo(
                starts_at=p.event_starts_at,
                ends_at=p.event_ends_at,
                place_public=p.place_public,
                place_private=p.place_private if (mine or p.id in going) and not deleted else None,
                going_count=p.going_count,
                i_am_going=p.id in going,
            )
        shared = courses.get(p.shared_course_id) if p.shared_course_id else None
        out.append(
            PostRead(
                id=p.id,
                category=p.category,
                title="" if deleted else p.title,
                body="" if deleted else p.body,
                author=None
                if deleted
                else TEAM_AUTHOR
                if p.as_team
                else Author(display_name=_name(author), avatar_icon=author.avatar_icon if author else None),
                course=CourseTag(code=shared.code, name=shared.name) if shared else None,
                event=event,
                score=p.score,
                voted=p.id in voted,
                saved=p.id in saved,
                comment_count=p.comment_count,
                is_mine=mine and not deleted,
                official=p.as_team,
                pinned=p.pinned_at is not None,
                hidden=p.hidden_at is not None,
                edited=p.edited_at is not None,
                deleted=deleted,
                created_at=p.created_at,
            )
        )
    return out


def _serialize_comments(comments: list[ForumComment], user: User, session: Session) -> list[CommentRead]:
    ids = {c.user_id for c in comments} | {c.reply_to_user_id for c in comments if c.reply_to_user_id}
    users = _users(ids, session)
    out = []
    for c in comments:
        gone = c.deleted_at is not None or c.hidden_at is not None
        author = users.get(c.user_id)
        out.append(
            CommentRead(
                id=c.id,
                parent_id=c.parent_id,
                author=None if gone else Author(display_name=_name(author), avatar_icon=author.avatar_icon if author else None),
                reply_to_name=_name(users.get(c.reply_to_user_id)) if c.reply_to_user_id else None,
                body="" if gone else c.body,
                created_at=c.created_at,
                edited=c.edited_at is not None,
                deleted=gone,
                is_mine=c.user_id == user.id and not gone,
            )
        )
    return out


def _delete_rows(model, post_id: int, session: Session) -> None:
    for row in session.exec(select(model).where(model.post_id == post_id)).all():
        session.delete(row)


def _hard_delete_post(post: ForumPost, session: Session) -> None:
    # קודם הילדים במסד, ורק אז הפוסט (מפתחות זרים ב-Postgres - ראו PR #7 בעצות)
    for model in (ForumVote, ForumRsvp, ForumSave):
        _delete_rows(model, post.id, session)
    comments = session.exec(select(ForumComment).where(ForumComment.post_id == post.id)).all()
    for c in sorted(comments, key=lambda c: c.parent_id is None):
        session.delete(c)
        session.flush()
    for r in session.exec(
        select(ForumReport).where(ForumReport.target_type == "post", ForumReport.target_id == post.id)
    ).all():
        session.delete(r)
    session.flush()
    session.delete(post)


def _recount(model, post: ForumPost, session: Session) -> int:
    return session.exec(select(func.count()).select_from(model).where(model.post_id == post.id)).one()


def _send_report_email(reporter: User, target_type: str, target_id: int, text: str, reason: str, hidden: bool) -> None:
    if not settings.resend_api_key:
        return
    esc = html.escape
    kind = "פוסט" if target_type == "post" else "תגובה"
    html_body = (
        f"<div dir='rtl' style='font-family:sans-serif'>"
        f"<p><b>דיווח על {kind} #{target_id}</b>{' (הוסתר אוטומטית)' if hidden else ''}</p>"
        f"<p><b>מדווח/ת:</b> {esc(_name(reporter))} &lt;{esc(reporter.email)}&gt;</p>"
        f"<p><b>סיבה:</b> {esc(reason or '-')}</p>"
        f"<p><b>תוכן:</b></p><p style='white-space:pre-wrap'>{esc(text[:2000])}</p>"
        f"</div>"
    )
    try:
        httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.feedback_from_email,
                "to": [settings.feedback_to_email],
                "subject": f"[OpuLi · דיווח בקהילה] {kind} #{target_id}",
                "html": html_body,
            },
            timeout=10,
        )
    except httpx.HTTPError:
        # הדיווח כבר נשמר; מייל שנכשל לא אמור להכשיל את הבקשה
        logger.warning("forum report email failed", exc_info=True)


# ---------------------------------------------------------------------------
# פוסטים
# ---------------------------------------------------------------------------


@router.get("/posts", response_model=FeedPage)
def list_posts(
    category: Category | None = None,
    q: str | None = Query(default=None, max_length=100),
    course_id: int | None = None,
    saved: bool = False,
    sort: Literal["new", "top"] = "new",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=PAGE_SIZE, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    inst = user_institution(current_user, session)
    admin = _is_admin(current_user)
    if inst is None:
        return FeedPage(linked=False, is_admin=admin)

    conds = [_in_forum(inst)]
    if not admin:
        conds.append(ForumPost.hidden_at.is_(None))
    if category:
        conds.append(ForumPost.category == category)
    if q and q.strip():
        like = f"%{q.strip()}%"
        conds.append(or_(ForumPost.title.ilike(like), ForumPost.body.ilike(like)))
    if course_id is not None:
        shared = resolve_shared_course(get_owned_course(course_id, current_user.id, session), session)
        conds.append(ForumPost.shared_course_id == (shared.id if shared else -1))
    if saved:
        conds.append(
            ForumPost.id.in_(select(ForumSave.post_id).where(ForumSave.user_id == current_user.id))
        )

    pinned_first = ForumPost.pinned_at.is_(None)  # False (נעוץ) לפני True
    if sort == "top":
        order = (pinned_first, ForumPost.score.desc(), ForumPost.created_at.desc(), ForumPost.id.desc())
    else:
        order = (pinned_first, ForumPost.created_at.desc(), ForumPost.id.desc())
    posts = session.exec(select(ForumPost).where(*conds).order_by(*order).offset(offset).limit(limit)).all()
    total = session.exec(select(func.count()).select_from(ForumPost).where(*conds)).one()
    return FeedPage(
        linked=True,
        institution=inst,
        is_admin=admin,
        total=total,
        items=_serialize_posts(list(posts), current_user, session),
    )


@router.get("/events/upcoming", response_model=list[PostRead])
def upcoming_events(
    limit: int = Query(default=5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    inst = user_institution(current_user, session)
    if inst is None:
        return []
    now = datetime.utcnow()
    posts = session.exec(
        select(ForumPost)
        .where(
            _in_forum(inst),
            ForumPost.event_starts_at.is_not(None),
            ForumPost.hidden_at.is_(None),
            ForumPost.deleted_at.is_(None),
            or_(ForumPost.event_starts_at >= now, ForumPost.event_ends_at >= now),
        )
        .order_by(ForumPost.event_starts_at.asc(), ForumPost.id.asc())
        .limit(limit)
    ).all()
    return _serialize_posts(list(posts), current_user, session)


@router.get("/my-courses", response_model=list[CourseActivity])
def my_courses_activity(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    inst = user_institution(current_user, session)
    if inst is None:
        return []
    out = []
    for course in session.exec(
        select(Course).where(Course.user_id == current_user.id, Course.course_code.is_not(None))
    ).all():
        shared = resolve_shared_course(course, session)
        if shared is None:
            continue
        count = session.exec(
            select(func.count()).select_from(ForumPost).where(
                ForumPost.institution == inst,
                ForumPost.shared_course_id == shared.id,
                ForumPost.hidden_at.is_(None),
                ForumPost.deleted_at.is_(None),
            )
        ).one()
        if count:
            out.append(CourseActivity(course_id=course.id, name=course.name, post_count=count))
    return sorted(out, key=lambda c: -c.post_count)


@router.get("/posts/{post_id}", response_model=PostDetail)
def get_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    comments = session.exec(
        select(ForumComment)
        .where(ForumComment.post_id == post.id)
        .order_by(ForumComment.created_at.asc(), ForumComment.id.asc())
    ).all()
    serialized = _serialize_comments(list(comments), current_user, session)
    roots = [c for c in serialized if c.parent_id is None]
    by_id = {c.id: c for c in roots}
    for c in serialized:
        if c.parent_id is not None and c.parent_id in by_id:
            by_id[c.parent_id].replies.append(c)
    return PostDetail(post=_serialize_posts([post], current_user, session)[0], comments=roots)


@router.post("/posts", response_model=PostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: PostCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    inst = _require_institution(current_user, session)
    _rate_limit(ForumPost, current_user, POSTS_PER_HOUR, session)
    if payload.event_starts_at is not None and payload.event_starts_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="תאריך האירוע כבר עבר")

    if (payload.as_team or payload.pin or payload.all_institutions) and not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="רק מנהלות יכולות לפרסם בשם הצוות")

    shared_id = None
    # קורס שייך למוסד אחד, אז בהודעה לכל המוסדות אין תגית קורס
    if payload.course_id is not None and not payload.all_institutions:
        shared = resolve_shared_course(get_owned_course(payload.course_id, current_user.id, session), session)
        shared_id = shared.id if shared else None

    post = ForumPost(
        institution=ALL_INSTITUTIONS if payload.all_institutions else inst,
        user_id=current_user.id,
        category=payload.category,
        title=payload.title,
        body=payload.body,
        shared_course_id=shared_id,
        event_starts_at=payload.event_starts_at,
        event_ends_at=payload.event_ends_at,
        place_public=payload.place_public,
        place_private=payload.place_private,
        as_team=payload.as_team,
        pinned_at=datetime.utcnow() if payload.pin else None,
    )
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


@router.patch("/posts/{post_id}", response_model=PostRead)
def update_post(
    post_id: int,
    payload: PostUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_own_post(post_id, current_user, session)
    changes = payload.model_dump(exclude_unset=True)
    is_event = post.event_starts_at is not None
    for key in ("event_starts_at", "event_ends_at", "place_public", "place_private"):
        if key in changes and not is_event:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="לפוסט הזה אין פרטי אירוע")
    if changes.get("event_starts_at") is None and "event_starts_at" in changes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="למפגש או לאירוע צריך תאריך")
    if "place_public" in changes and not changes["place_public"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="למפגש או לאירוע צריך מקום")
    for key in ("event_starts_at", "event_ends_at"):
        if key in changes:
            changes[key] = _utc_naive(changes[key])
    if "title" in changes and changes["title"] is None:
        del changes["title"]
    if "body" in changes and changes["body"] is None:
        del changes["body"]

    changed = False
    for key, value in changes.items():
        if getattr(post, key) != value:
            setattr(post, key, value)
            changed = True
    if post.event_ends_at is not None and post.event_starts_at is not None and post.event_ends_at < post.event_starts_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="שעת הסיום לפני שעת ההתחלה")
    if changed:
        post.edited_at = datetime.utcnow()
        session.add(post)
        session.commit()
        session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


@router.delete("/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_own_post(post_id, current_user, session)
    if post.comment_count > 0:
        # יש תגובות - משאירים "הפוסט נמחק" כדי לא לשבור את הדיון
        post.deleted_at = datetime.utcnow()
        post.title = ""
        post.body = ""
        post.place_private = None
        session.add(post)
        session.commit()
        return
    _hard_delete_post(post, session)
    session.commit()


@router.put("/posts/{post_id}/vote", response_model=PostRead)
def vote_post(
    post_id: int,
    payload: VoteIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפוסט לא נמצא")
    if post.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="אי אפשר להצביע על פוסט שלך")

    vote = session.get(ForumVote, (post.id, current_user.id))
    if payload.value == 0 and vote is not None:
        session.delete(vote)
    elif payload.value == 1 and vote is None:
        session.add(ForumVote(post_id=post.id, user_id=current_user.id))
    session.flush()
    # מחשבים מחדש מהטבלה כדי שהניקוד לא "יזלוג" בהצבעות מקבילות
    post.score = _recount(ForumVote, post, session)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


@router.put("/posts/{post_id}/rsvp", response_model=PostRead)
def rsvp(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if post.deleted_at is not None or post.event_starts_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="האירוע לא נמצא")
    if post.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="את/ה המארגן/ת של האירוע")
    if (post.event_ends_at or post.event_starts_at) < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="האירוע כבר עבר")
    if session.get(ForumRsvp, (post.id, current_user.id)) is None:
        session.add(ForumRsvp(post_id=post.id, user_id=current_user.id))
        try:
            session.flush()
        except IntegrityError:
            session.rollback()
    post.going_count = _recount(ForumRsvp, post, session)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


@router.delete("/posts/{post_id}/rsvp", response_model=PostRead)
def cancel_rsvp(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    row = session.get(ForumRsvp, (post.id, current_user.id))
    if row is not None:
        session.delete(row)
        session.flush()
        post.going_count = _recount(ForumRsvp, post, session)
        session.add(post)
        session.commit()
        session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


@router.get("/posts/{post_id}/attendees", response_model=list[Attendee])
def list_attendees(
    post_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # רק המארגן/ת רואה מי מגיע/ה ואת המיילים שלהם (כתוב ליד כפתור ההגעה)
    post = _get_own_post(post_id, current_user, session)
    if post.event_starts_at is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="האירוע לא נמצא")
    rows = session.exec(
        select(ForumRsvp, User)
        .join(User, User.id == ForumRsvp.user_id)
        .where(ForumRsvp.post_id == post.id)
        .order_by(ForumRsvp.created_at.asc())
    ).all()
    return [
        Attendee(display_name=_name(u), email=u.email, avatar_icon=u.avatar_icon, created_at=r.created_at)
        for r, u in rows
    ]


@router.put("/posts/{post_id}/save", response_model=PostRead)
def save_post(
    post_id: int,
    payload: FlagIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    row = session.get(ForumSave, (post.id, current_user.id))
    if payload.value and row is None:
        session.add(ForumSave(post_id=post.id, user_id=current_user.id))
    elif not payload.value and row is not None:
        session.delete(row)
    session.commit()
    return _serialize_posts([post], current_user, session)[0]


@router.put("/posts/{post_id}/pin", response_model=PostRead)
def pin_post(
    post_id: int,
    payload: FlagIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="רק מנהלת יכולה לנעוץ")
    post.pinned_at = datetime.utcnow() if payload.value else None
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


@router.put("/posts/{post_id}/hide", response_model=PostRead)
def hide_post(
    post_id: int,
    payload: FlagIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if not _is_admin(current_user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="רק מנהלת יכולה להסתיר")
    post.hidden_at = datetime.utcnow() if payload.value else None
    if not payload.value:
        # שחרור אחרי בדיקה: הדיווחים הקיימים נסגרים כדי שלא יסתירו שוב מיד
        for r in session.exec(
            select(ForumReport).where(
                ForumReport.target_type == "post", ForumReport.target_id == post.id, ForumReport.resolved_at.is_(None)
            )
        ).all():
            r.resolved_at = datetime.utcnow()
            session.add(r)
    session.add(post)
    session.commit()
    session.refresh(post)
    return _serialize_posts([post], current_user, session)[0]


# ---------------------------------------------------------------------------
# תגובות
# ---------------------------------------------------------------------------


def _get_visible_comment(comment_id: int, user: User, session: Session) -> tuple[ForumComment, ForumPost]:
    comment = session.get(ForumComment, comment_id)
    if comment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
    try:
        post = _get_visible_post(comment.post_id, user, session)
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
    return comment, post


@router.post("/posts/{post_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def create_comment(
    post_id: int,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    post = _get_visible_post(post_id, current_user, session)
    if post.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="הפוסט לא נמצא")
    _rate_limit(ForumComment, current_user, COMMENTS_PER_HOUR, session)

    parent = None
    reply_to_user_id = None
    if payload.parent_id is not None:
        target = session.get(ForumComment, payload.parent_id)
        if target is None or target.post_id != post.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
        if target.parent_id is None:
            parent = target
        else:
            # תשובה לתשובה: נשארת באותו שרשור, עם "בתגובה ל־"
            parent = session.get(ForumComment, target.parent_id)
            reply_to_user_id = target.user_id

    comment = ForumComment(
        post_id=post.id,
        user_id=current_user.id,
        parent_id=parent.id if parent else None,
        reply_to_user_id=reply_to_user_id,
        body=payload.body,
    )
    session.add(comment)
    if parent is not None:
        parent.reply_count += 1
        session.add(parent)
    post.comment_count += 1
    session.add(post)
    session.commit()
    session.refresh(comment)
    return _serialize_comments([comment], current_user, session)[0]


@router.patch("/comments/{comment_id}", response_model=CommentRead)
def update_comment(
    comment_id: int,
    payload: CommentUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    comment, _ = _get_visible_comment(comment_id, current_user, session)
    if comment.user_id != current_user.id or comment.deleted_at is not None or comment.hidden_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")
    if payload.body != comment.body:
        comment.body = payload.body
        comment.edited_at = datetime.utcnow()
        session.add(comment)
        session.commit()
        session.refresh(comment)
    return _serialize_comments([comment], current_user, session)[0]


def _hard_delete_comment(comment: ForumComment, session: Session) -> None:
    for r in session.exec(
        select(ForumReport).where(ForumReport.target_type == "comment", ForumReport.target_id == comment.id)
    ).all():
        session.delete(r)
    session.flush()
    session.delete(comment)


@router.delete("/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_comment(
    comment_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    comment, post = _get_visible_comment(comment_id, current_user, session)
    if comment.user_id != current_user.id or comment.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="התגובה לא נמצאה")

    if comment.parent_id is None and comment.reply_count > 0:
        comment.deleted_at = datetime.utcnow()
        comment.body = ""
        session.add(comment)
        session.commit()
        return

    parent = session.get(ForumComment, comment.parent_id) if comment.parent_id else None
    _hard_delete_comment(comment, session)
    post.comment_count = max(0, post.comment_count - 1)
    if parent is not None:
        parent.reply_count = max(0, parent.reply_count - 1)
        if parent.deleted_at is not None and parent.reply_count == 0:
            # התשובה האחרונה מתחת לתגובה שנמחקה - אין יותר מה לשמור
            session.flush()
            _hard_delete_comment(parent, session)
            post.comment_count = max(0, post.comment_count - 1)
        else:
            session.add(parent)
    session.add(post)
    session.commit()


# ---------------------------------------------------------------------------
# דיווחים
# ---------------------------------------------------------------------------


@router.post("/reports", status_code=status.HTTP_202_ACCEPTED)
def report(
    payload: ReportIn,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if payload.target_type == "post":
        target = _get_visible_post(payload.target_id, current_user, session)
        text = f"{target.title}\n\n{target.body}"
    else:
        target, _ = _get_visible_comment(payload.target_id, current_user, session)
        text = target.body
    if target.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="אי אפשר לדווח על תוכן שלך")

    session.add(
        ForumReport(
            target_type=payload.target_type,
            target_id=payload.target_id,
            reporter_id=current_user.id,
            reason=payload.reason.strip(),
        )
    )
    try:
        session.commit()
    except IntegrityError:
        # כבר דיווחת על זה - לא סופרים פעמיים
        session.rollback()
        return {"status": "already_reported"}

    open_reports = session.exec(
        select(func.count()).select_from(ForumReport).where(
            ForumReport.target_type == payload.target_type,
            ForumReport.target_id == payload.target_id,
            ForumReport.resolved_at.is_(None),
        )
    ).one()
    hidden = False
    if open_reports >= REPORTS_TO_HIDE and target.hidden_at is None:
        target.hidden_at = datetime.utcnow()
        session.add(target)
        session.commit()
        hidden = True
    _send_report_email(current_user, payload.target_type, payload.target_id, text, payload.reason, hidden)
    return {"status": "reported"}
