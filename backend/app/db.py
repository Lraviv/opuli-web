from sqlmodel import SQLModel, Session, create_engine

from .config import settings

# echo=False כדי לא להציף את הקונסולה; אפשר להחליף ל-True בזמן דיבוג מקומי
#
# connect_args={"check_same_thread": False} נדרש רק ל-SQLite (משמש בפיתוח
# מקומי כשאין Docker/Postgres זמינים - ראו .env) כדי לאפשר שימוש מכמה
# thread-ים כמו ש-FastAPI עושה. לא משפיע כשמתחברים ל-Postgres בייצור.
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
# pool_pre_ping: חיבורים דרך ה-pooler של Supabase יכולים להיסגר מהצד שלהם בזמן
# שהשרת רדום - בודקים חיבור לפני שימוש במקום להיכשל בבקשה הראשונה.
engine = create_engine(settings.database_url, echo=False, connect_args=_connect_args, pool_pre_ping=True)


def create_db_and_tables() -> None:
    """יוצר את כל הטבלאות אם הן לא קיימות עדיין.

    לפיתוח מקומי מהיר זה מספיק. כשמתחברים למסד "אמיתי" (Neon וכו') עדיף
    לעבור להרצת מיגרציות Alembic (ראו תיקיית alembic/) כדי לשמור היסטוריה
    מסודרת של שינויים בסכמה.
    """
    from . import models  # noqa: F401  (מוודא שכל המודלים נטענו לפני create_all)

    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
