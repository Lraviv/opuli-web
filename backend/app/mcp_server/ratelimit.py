"""הגבלת קצב לנתיבים של חיבור ה-AI: /mcp, /register, /authorize, /token, /revoke.

נשמר בזיכרון של כל מופע (Cloud Run יכול להריץ כמה), כך שהמגבלה בפועל היא
לכל מופע. זה מספיק כדי לעצור לולאה של AI שקורא לכלי שוב ושוב, או סקריפט
שרושם אלפי אפליקציות - לא כהגנה מפני התקפה מבוזרת.
"""

import hashlib
import json
import time
from collections import defaultdict, deque
from dataclasses import dataclass


@dataclass(frozen=True)
class Limit:
    requests: int
    per_seconds: int


# נתיב -> מגבלה לכל כתובת IP
IP_LIMITS = {
    "/register": Limit(10, 3600),
    "/authorize": Limit(60, 600),
    "/token": Limit(60, 600),
    "/revoke": Limit(60, 600),
}
# קריאות ל-/mcp: לכל טוקן (שיחה רגילה עם AI = עשרות קריאות, לא מאות)
TOKEN_LIMIT = Limit(120, 60)
# /mcp בלי טוקן תקין - רק כדי שלא יציפו את בדיקת הטוקנים במסד
ANON_MCP_LIMIT = Limit(60, 60)


class SlidingWindow:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: Limit, now: float | None = None) -> int:
        """רושם בקשה. מחזיר 0 אם מותר, אחרת כמה שניות לחכות."""
        now = time.monotonic() if now is None else now
        hits = self._hits[key]
        while hits and hits[0] <= now - limit.per_seconds:
            hits.popleft()
        if len(hits) >= limit.requests:
            return max(1, int(hits[0] + limit.per_seconds - now) + 1)
        hits.append(now)
        if len(self._hits) > 50_000:
            self._prune(now)
        return 0

    def _prune(self, now: float) -> None:
        longest = max([l.per_seconds for l in IP_LIMITS.values()] + [TOKEN_LIMIT.per_seconds])
        for key in [k for k, v in self._hits.items() if not v or v[-1] <= now - longest]:
            del self._hits[key]

    def reset(self) -> None:
        self._hits.clear()


window = SlidingWindow()


def _header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


def client_ip(scope) -> str:
    # Cloud Run מוסיף את כתובת הלקוח האמיתית בסוף X-Forwarded-For; ערכים
    # מוקדמים יותר הלקוח יכול לזייף, אז לוקחים את האחרון
    forwarded = _header(scope, b"x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


def check(scope) -> int:
    """0 אם הבקשה מותרת, אחרת שניות עד שאפשר לנסות שוב."""
    path = scope.get("path", "")
    if path in IP_LIMITS:
        return window.hit(f"ip:{path}:{client_ip(scope)}", IP_LIMITS[path])
    if path.rstrip("/") == "/mcp":
        auth = _header(scope, b"authorization") or ""
        if auth.lower().startswith("bearer ") and len(auth) > 7:
            token_key = hashlib.sha256(auth[7:].strip().encode()).hexdigest()
            return window.hit(f"token:{token_key}", TOKEN_LIMIT)
        return window.hit(f"anon-mcp:{client_ip(scope)}", ANON_MCP_LIMIT)
    return 0


async def too_many_requests(send, retry_after: int) -> None:
    body = json.dumps(
        {"error": "rate_limited", "error_description": f"Too many requests, retry in {retry_after}s"}
    ).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 429,
            "headers": [
                (b"content-type", b"application/json"),
                (b"retry-after", str(retry_after).encode()),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
