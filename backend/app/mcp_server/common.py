"""עזרים משותפים לכלי ה-MCP: זמנים מקומיים, זיהוי קורס לפי שם, קישורים."""

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from mcp.server.mcpserver.exceptions import ToolError
from sqlmodel import Session, select

from ..config import settings
from ..models import Course

LOCAL_TZ = ZoneInfo("Asia/Jerusalem")
TERMS = {"a": "א", "b": "ב", "special": "מיוחד"}  # Exam.term -> מועד
_WEEKDAYS = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]  # לפי datetime.weekday()


def now_local() -> datetime:
    return datetime.now(LOCAL_TZ)


def to_local(dt: datetime | None) -> str | None:
    """datetime מהמסד (UTC בלי אזור זמן) -> ISO בשעון ישראל, בלי offset."""
    if dt is None:
        return None
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return aware.astimezone(LOCAL_TZ).strftime("%Y-%m-%dT%H:%M")


def to_local_display(dt: datetime | None) -> str | None:
    """לתצוגה ולאימות מול הסטודנטית: "יום ראשון 14.2.2027 09:00"."""
    if dt is None:
        return None
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    local = aware.astimezone(LOCAL_TZ)
    return f"יום {_WEEKDAYS[local.weekday()]} {local.day}.{local.month}.{local.year} {local:%H:%M}"


def course_url(course_id: int) -> str:
    return f"{settings.web_url.rstrip('/')}/courses/{course_id}"


def norm(text: str) -> str:
    # מאחדים רווחים ומרכאות עבריות (״/"/׳) כדי ש"ממ״ן" ו-"ממ"ן" יתאימו
    text = text.replace("״", '"').replace("׳", "'").casefold()
    return re.sub(r"\s+", " ", text).strip()


def resolve_course(session: Session, user_id: int, ref: str) -> Course:
    """קורס של המשתמשת לפי מזהה, קוד קורס או שם (מלא או חלקי).

    יותר מהתאמה אחת -> שגיאה עם המועמדים, כדי שה-AI ישאל במקום לנחש.
    """
    ref = str(ref).strip()
    courses = session.exec(select(Course).where(Course.user_id == user_id)).all()
    if not courses:
        raise ToolError("אין לך עדיין קורסים ב-OpuLi.")

    if ref.isdigit():
        by_id = [c for c in courses if c.id == int(ref)]
        if by_id:
            return by_id[0]

    key = norm(ref)
    for matcher in (
        lambda c: c.course_code is not None and norm(c.course_code) == key,
        lambda c: norm(c.name) == key,
        lambda c: key in norm(c.name),
    ):
        matches = [c for c in courses if matcher(c)]
        if len(matches) == 1:
            return matches[0]
        if len(matches) > 1:
            names = ", ".join(f"{c.name} (id {c.id})" for c in matches[:10])
            raise ToolError(f"יש יותר מקורס אחד שמתאים ל-\"{ref}\": {names}. צריך לבחור אחד מהם.")

    raise ToolError(f"לא נמצא קורס בשם \"{ref}\". אפשר לקרוא ל-get_overview כדי לראות את רשימת הקורסים.")


def parse_local(value: str, *, default_time: str = "09:00") -> datetime:
    """זמן מקומי בישראל ("2027-02-14T09:00" / "2027-02-14 09:00" / "2027-02-14")
    -> datetime ב-UTC בלי אזור זמן, כמו שנשמר במסד. בלי שעה -> default_time."""
    text = str(value).strip().replace(" ", "T", 1)
    if len(text) == 10:
        text = f"{text}T{default_time}"
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise ToolError(f"תאריך לא תקין: \"{value}\". הפורמט הוא YYYY-MM-DD או YYYY-MM-DDTHH:MM (שעון ישראל).")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def validation_message(exc: Exception) -> str:
    """הודעה קצרה מ-ValidationError של pydantic (או כל שגיאה אחרת)."""
    errors = getattr(exc, "errors", None)
    if callable(errors):
        first = errors()[0]
        field = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
        message = str(first.get("msg", "ערך לא תקין")).removeprefix("Value error, ")
        return f"{field}: {message}" if field else message
    return str(exc)
