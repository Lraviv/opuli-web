from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select
from datetime import datetime
from typing import List, Optional

from app.db import get_session
from app.models import UserReminder
from app.deps import get_current_user
from app.services.reminders import create_reminder as create_reminder_service
from app.services.reminders import update_reminder as update_reminder_service

router = APIRouter(prefix="/reminders", tags=["Reminders"])

class ReminderCreate(BaseModel):
    title: str
    due_date: Optional[datetime] = None

class ReminderUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[datetime] = None
    is_done: Optional[bool] = None

@router.get("/", response_model=List[UserReminder])
def get_reminders(
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user)
):
    statement = select(UserReminder).where(UserReminder.user_id == current_user.id).order_by(UserReminder.created_at.desc())
    return session.exec(statement).all()

@router.post("/", response_model=UserReminder, status_code=status.HTTP_201_CREATED)
def create_reminder(
    reminder_in: ReminderCreate,
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user)
):
    return create_reminder_service(session, current_user.id, reminder_in.title, reminder_in.due_date)

@router.patch("/{reminder_id}", response_model=UserReminder)
def update_reminder(
    reminder_id: int,
    reminder_in: ReminderUpdate,
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user)
):
    db_reminder = session.get(UserReminder, reminder_id)
    if not db_reminder or db_reminder.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    
    return update_reminder_service(session, db_reminder, reminder_in.dict(exclude_unset=True))

@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reminder(
    reminder_id: int,
    session: Session = Depends(get_session),
    current_user = Depends(get_current_user)
):
    db_reminder = session.get(UserReminder, reminder_id)
    if not db_reminder or db_reminder.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Reminder not found")
        
    session.delete(db_reminder)
    session.commit()
    return None
