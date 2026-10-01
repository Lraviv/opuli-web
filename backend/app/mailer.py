"""שליחת מיילים למשתמשים דרך Resend (HTTP API - Render בחינם חוסם SMTP יוצא)."""

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)
RESEND_URL = "https://api.resend.com/emails"


def mail_enabled() -> bool:
    return bool(settings.resend_api_key)


def send_email(to: str, subject: str, html: str) -> bool:
    """שולח מייל. מחזיר False (ורושם ללוג) אם השליחה נכשלה - בלי לזרוק."""
    if not mail_enabled():
        return False
    try:
        res = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.mail_from_email, "to": [to], "subject": subject, "html": html},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        log.warning("send_email failed: %s", exc)
        return False
    if res.status_code >= 300:
        # למשל 403 מ-Resend כשאין דומיין מאומת והנמען אינו בעל החשבון
        log.warning("send_email rejected (%s): %s", res.status_code, res.text[:300])
        return False
    return True
