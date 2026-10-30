from pydantic import ValidationError
from sqlmodel import Session

from ..models import ClassSession
from ..schemas import ClassSessionCreate, ClassSessionUpdate


class InvalidSession(ValueError):
    pass


def create_class_session(session: Session, course_id: int, payload: ClassSessionCreate) -> ClassSession:
    class_session = ClassSession(course_id=course_id, **payload.model_dump())
    session.add(class_session)
    session.commit()
    session.refresh(class_session)
    return class_session


def update_class_session(session: Session, class_session: ClassSession, payload: ClassSessionUpdate) -> ClassSession:
    """זורק InvalidSession (עם הודעה בעברית) אם הצירוף הסופי לא תקין."""
    data = payload.model_dump(exclude_unset=True)
    # שדות חובה: null מפורש לא מנקה אותם
    for required in ("weekday", "start_time", "end_time", "interval_weeks"):
        if required in data and data[required] is None:
            del data[required]
    merged = {**class_session.model_dump(), **data}
    # בודקים את הצירוף הסופי עם אותם כללים כמו ביצירה (סדר שעות, עוגן לכל-שבועיים)
    try:
        ClassSessionCreate.model_validate({k: merged[k] for k in ClassSessionCreate.model_fields})
    except ValidationError as exc:
        raise InvalidSession(exc.errors()[0].get("msg", "ערכים לא תקינים").removeprefix("Value error, ")) from exc
    for field, value in data.items():
        setattr(class_session, field, value)
    session.add(class_session)
    session.commit()
    session.refresh(class_session)
    return class_session
