from contextlib import AsyncExitStack, asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import create_db_and_tables
from .routers.ai_tokens import router as ai_tokens_router
from .routers.auth import me_router, router as auth_router
from .routers.calendar import router as calendar_router
from .routers.course_structure import router as course_structure_router
from .routers.courses import router as courses_router
from .routers.degrees import router as degrees_router
from .routers.exams import router as exams_router
from .routers.feedback import router as feedback_router
from .routers.forum import router as forum_router
from .routers.internal import router as internal_router
from .routers.oauth import router as oauth_router
from .routers.planner import router as planner_router
from .routers.push_tokens import router as push_tokens_router
from .routers.semesters import router as semesters_router
from .routers.reminders import router as reminders_router
from .routers.study_topics import router as study_topics_router
from .routers.tips import router as tips_router
from .scheduler import start_scheduler, stop_scheduler

# שרת ה-MCP (חיבור Claude / ChatGPT) - נטען רק כשהוא מודלק
mcp_app = None
if settings.mcp_enabled:
    from .mcp_server import build_mcp_app

    mcp_app = build_mcp_app()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # בייצור הסכמה מנוהלת ע"י מיגרציות (alembic upgrade head רץ לפני השרת -
    # ראו Dockerfile); create_all היה יוצר טבלאות שאלמביק לא מכיר.
    if not settings.is_production:
        create_db_and_tables()
    # בבדיקות (tests/conftest.py) ה-scheduler לא רץ - הוא לא רלוונטי לבדיקות
    # API, וה-AsyncIOScheduler לא בנוי לתמוך בכמה TestClient/event loop-ים
    # שונים באותו תהליך.
    import os
    if os.environ.get("DISABLE_SCHEDULER") != "1":
        start_scheduler()
    async with AsyncExitStack() as stack:
        if mcp_app is not None:
            await stack.enter_async_context(mcp_app.lifespan())
        yield
    if os.environ.get("DISABLE_SCHEDULER") != "1":
        stop_scheduler()


app = FastAPI(title="OpuLi API", version="0.1.0", lifespan=lifespan)

# בפיתוח "*"; בייצור CORS_ORIGINS = כתובת האתר ב-Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth_router)
app.include_router(me_router)
app.include_router(degrees_router)
app.include_router(courses_router)
app.include_router(course_structure_router)
app.include_router(exams_router)
app.include_router(push_tokens_router)
app.include_router(semesters_router)
app.include_router(reminders_router)
app.include_router(feedback_router)
app.include_router(study_topics_router)
app.include_router(tips_router)
app.include_router(forum_router)
app.include_router(planner_router)
app.include_router(calendar_router)
app.include_router(internal_router)
app.include_router(ai_tokens_router)
app.include_router(oauth_router)

if mcp_app is not None:
    # אחרון: מה שלא נתפס ע"י הראוטרים של FastAPI עובר לאפליקציית ה-MCP -
    # /mcp, ה-metadata ב-/.well-known/, ושרת ההרשאות: /authorize /token /register /revoke
    app.mount("/", mcp_app)
