"""בניית קובץ iCalendar (RFC 5545) - בלי תלויות חיצוניות.

כל הזמנים בשרת נשמרים כ-UTC "נאיבי". מבחנים ותזכורות נכתבים עם Z (UTC).
מטלות נכתבות כאירוע של יום שלם בתאריך ההגשה המקומי (ישראל). מפגשים קבועים
נכתבים בזמן "צף" (בלי אזור זמן) - שעון קיר, כך שהיומן מציג אותם בשעה שהוזנה.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

LOCAL_TZ = ZoneInfo("Asia/Jerusalem")
PRODID = "-//OpuLi//Study Planner//HE"
# RFC 5545: ראשון=SU ... שבת=SA; אצלנו weekday 0=ראשון
ICS_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]


def escape_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
        .replace("\r", "\\n")
    )


def fold_line(line: str) -> str:
    """מקפל שורות ארוכות מ-75 בתים (לא תווים - עברית היא 2 בתים לתו ב-UTF-8)."""
    out: list[str] = []
    current = ""
    current_bytes = 0
    limit = 75
    for ch in line:
        size = len(ch.encode("utf-8"))
        if current_bytes + size > limit:
            out.append(current)
            current = " " + ch
            current_bytes = 1 + size
            limit = 75
        else:
            current += ch
            current_bytes += size
    out.append(current)
    return "\r\n".join(out)


def fmt_utc(dt: datetime) -> str:
    """datetime נאיבי ב-UTC (או aware) -> 20261005T093000Z."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.strftime("%Y%m%dT%H%M%SZ")


def utc_to_local_date(dt: datetime) -> date:
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return aware.astimezone(LOCAL_TZ).date()


@dataclass
class TimedEvent:
    uid: str
    summary: str
    start_utc: datetime
    end_utc: datetime
    location: str | None = None
    description: str | None = None
    alarm_minutes_before: int | None = None


@dataclass
class AllDayEvent:
    uid: str
    summary: str
    day: date
    description: str | None = None


@dataclass
class WeeklyEvent:
    uid: str
    summary: str
    weekday: int  # 0=ראשון
    start_time: str  # "HH:MM" שעון קיר
    end_time: str
    first_date: date  # תאריך המופע הראשון (כבר מיושר ליום בשבוע)
    interval_weeks: int = 1
    until: date | None = None
    location: str | None = None


def first_occurrence(weekday: int, anchor: date) -> date:
    """המופע הראשון של weekday (0=ראשון) בתאריך anchor או אחריו."""
    # python: Monday=0 ... Sunday=6 -> נמיר ל-0=ראשון
    anchor_weekday = (anchor.weekday() + 1) % 7
    return anchor + timedelta(days=(weekday - anchor_weekday) % 7)


def build_calendar(
    name: str,
    timed: list[TimedEvent],
    all_day: list[AllDayEvent],
    weekly: list[WeeklyEvent],
    now: datetime | None = None,
) -> str:
    stamp = fmt_utc(now or datetime.now(timezone.utc))
    lines: list[str] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_text(name)}",
        "X-WR-TIMEZONE:Asia/Jerusalem",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]

    for ev in timed:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{ev.uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{fmt_utc(ev.start_utc)}",
            f"DTEND:{fmt_utc(ev.end_utc)}",
            f"SUMMARY:{escape_text(ev.summary)}",
        ]
        if ev.location:
            lines.append(f"LOCATION:{escape_text(ev.location)}")
        if ev.description:
            lines.append(f"DESCRIPTION:{escape_text(ev.description)}")
        if ev.alarm_minutes_before:
            lines += [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:{escape_text(ev.summary)}",
                f"TRIGGER:-PT{ev.alarm_minutes_before}M",
                "END:VALARM",
            ]
        lines.append("END:VEVENT")

    for ev in all_day:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{ev.uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{ev.day.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(ev.day + timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{escape_text(ev.summary)}",
            "TRANSP:TRANSPARENT",
        ]
        if ev.description:
            lines.append(f"DESCRIPTION:{escape_text(ev.description)}")
        lines.append("END:VEVENT")

    for ev in weekly:
        start = ev.start_time.replace(":", "") + "00"
        end = ev.end_time.replace(":", "") + "00"
        day = ev.first_date.strftime("%Y%m%d")
        rrule = f"RRULE:FREQ=WEEKLY;INTERVAL={ev.interval_weeks};BYDAY={ICS_WEEKDAYS[ev.weekday]}"
        if ev.until:
            rrule += f";UNTIL={ev.until.strftime('%Y%m%d')}T235959"
        lines += [
            "BEGIN:VEVENT",
            f"UID:{ev.uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{day}T{start}",
            f"DTEND:{day}T{end}",
            rrule,
            f"SUMMARY:{escape_text(ev.summary)}",
        ]
        if ev.location:
            lines.append(f"LOCATION:{escape_text(ev.location)}")
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")
    return "\r\n".join(fold_line(line) for line in lines) + "\r\n"
