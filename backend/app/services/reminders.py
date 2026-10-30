from datetime import datetime
from typing import Any

from sqlmodel import Session

from ..models import UserReminder
from .completion import apply_done


def create_reminder(session: Session, user_id: int, title: str, due_date: datetime | None) -> UserReminder:
    reminder = UserReminder(user_id=user_id, title=title, due_date=due_date)
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return reminder


def update_reminder(session: Session, reminder: UserReminder, data: dict[str, Any]) -> UserReminder:
    apply_done(reminder, data)
    for field, value in data.items():
        setattr(reminder, field, value)
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return reminder
