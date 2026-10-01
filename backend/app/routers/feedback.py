"""משוב ודיווח באגים מהמשתמשים - נשלח במייל למפתחת דרך Resend."""

import html
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import settings
from app.deps import get_current_user
from app.models import User

router = APIRouter(prefix="/feedback", tags=["Feedback"])

RESEND_URL = "https://api.resend.com/emails"
CATEGORY_LABEL = {"bug": "באג", "idea": "רעיון", "other": "אחר"}


class FeedbackCreate(BaseModel):
    category: Literal["bug", "idea", "other"] = "other"
    message: str = Field(min_length=3, max_length=5000)
    page: str | None = Field(default=None, max_length=300)


@router.post("", status_code=status.HTTP_202_ACCEPTED)
def send_feedback(
    body: FeedbackCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    if not settings.resend_api_key or not settings.feedback_to_email:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "שליחת משוב לא מוגדרת כרגע")

    label = CATEGORY_LABEL[body.category]
    name = current_user.display_name or current_user.email
    user_agent = request.headers.get("user-agent", "")
    esc = html.escape
    html_body = (
        f"<div dir='rtl' style='font-family:sans-serif'>"
        f"<p><b>סוג:</b> {label}</p>"
        f"<p><b>מאת:</b> {esc(name)} &lt;{esc(current_user.email)}&gt; (משתמש #{current_user.id})</p>"
        f"<p><b>הודעה:</b></p><p style='white-space:pre-wrap'>{esc(body.message)}</p>"
        f"<hr><p style='color:#888;font-size:12px'>עמוד: {esc(body.page or '-')}<br>דפדפן: {esc(user_agent)}</p>"
        f"</div>"
    )

    try:
        res = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={
                "from": settings.feedback_from_email,
                "to": [settings.feedback_to_email],
                "reply_to": current_user.email,
                "subject": f"[OpuLi · {label}] {body.message[:60]}",
                "html": html_body,
            },
            timeout=10,
        )
    except httpx.HTTPError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "שליחת המשוב נכשלה, נסו שוב")
    if res.status_code >= 300:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "שליחת המשוב נכשלה, נסו שוב")
    return {"status": "sent"}
