from datetime import datetime
from typing import Any


def apply_done(row: Any, data: dict[str, Any]) -> None:
    """מעדכן completed_at כשמסמנים/מבטלים "בוצע" (פריט קורס או תזכורת)."""
    if "is_done" not in data or data["is_done"] is None:
        return
    if data["is_done"] and not row.is_done:
        row.completed_at = datetime.utcnow()
    elif not data["is_done"] and row.is_done:
        row.completed_at = None
