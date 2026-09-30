"""שליחת התראות Push דרך שירות ה-Push של Expo.

לא משתמשים בחבילת expo-server-sdk-python כדי לא להוסיף תלות חיצונית -
זו קריאת HTTP פשוטה ומתועדת היטב:
https://docs.expo.dev/push-notifications/sending-notifications/

הערה: לשם פשטות בגרסה זו לא מפרקים את תשובת הבאץ' של Expo (שיכולה להכיל
הצלחה/כישלון לכל הודעה בנפרד) - מסתפקים בכך שהבקשה כולה הצליחה (200).
שיפור עתידי: לטפל בקודי שגיאה פר-טוקן (כמו DeviceNotRegistered) ולמחוק
טוקנים לא תקפים מהמסד.
"""

import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 100  # Expo ממליץ לא לשלוח יותר מ-100 הודעות בבקשה אחת


def send_expo_push_messages(messages: list[dict]) -> bool:
    """שולח רשימת הודעות Push. מחזיר True אם כל הבאצ'ים נשלחו בהצלחה."""
    if not messages:
        return True

    all_ok = True
    with httpx.Client(timeout=10.0) as client:
        for i in range(0, len(messages), _CHUNK_SIZE):
            chunk = messages[i : i + _CHUNK_SIZE]
            try:
                response = client.post(
                    settings.expo_push_url,
                    json=chunk,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                    },
                )
                response.raise_for_status()
            except httpx.HTTPError:
                logger.exception("שליחת Push ל-Expo נכשלה עבור באץ' של %d הודעות", len(chunk))
                all_ok = False

    return all_ok


def build_exam_reminder_message(expo_push_token: str, course_name: str, minutes_until: int) -> dict:
    if minutes_until >= 60:
        hours = round(minutes_until / 60, 1)
        when_text = f"בעוד כ-{hours:g} שעות"
    else:
        when_text = f"בעוד כ-{minutes_until} דקות"

    return {
        "to": expo_push_token,
        "title": "תזכורת למבחן",
        "body": f"מבחן ב{course_name} {when_text}",
        "sound": "default",
        "data": {"type": "exam_reminder"},
    }
