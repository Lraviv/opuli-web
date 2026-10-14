"""שליחת מיילים למשתמשים ב-SMTP (תזכורות). מוגדר דרך SMTP_* במשתני הסביבה."""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

logger = logging.getLogger(__name__)


def is_email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_user and settings.smtp_password)


def send_email(to: str, subject: str, html: str, text: str) -> bool:
    """שולח מייל אחד. מחזיר False (ולא זורק) אם השליחה נכשלה, כדי שהקורא ינסה שוב בפעם הבאה."""
    msg = EmailMessage()
    msg["From"] = settings.email_from or settings.smtp_user
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    try:
        context = ssl.create_default_context()
        if settings.smtp_port == 465:
            with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, context=context, timeout=20) as smtp:
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        else:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                smtp.starttls(context=context)
                smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError):
        logger.exception("Sending email to user failed")
        return False
