from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_JWT_SECRET = "change-me-to-a-random-secret"
_DEFAULT_INTERNAL_SECRET = "change-me-internal-secret"


class Settings(BaseSettings):
    """הגדרות האפליקציה, נטענות מתוך משתני סביבה / קובץ .env."""

    database_url: str = "postgresql+psycopg://student:student@localhost:5432/student_app"
    jwt_secret: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30

    # סוד משותף שמאמת את הקורא ל-/internal/check-reminders (הטריגר החיצוני
    # שמפעיל את בדיקת התזכורות - ראו מסמך האיפיון, סעיף אירוח). זה לא JWT של
    # משתמש: זהו endpoint שרת-לשרת, אז מגינים עליו עם כותרת סודית פשוטה.
    internal_secret: str = _DEFAULT_INTERNAL_SECRET

    # ברירת מחדל לתזכורות מבחן, בדקות לפני המבחן: יום לפני + שעתיים לפני
    default_exam_reminder_offsets_minutes: list[int] = [24 * 60, 2 * 60]

    # כתובת ה-API של Expo לשליחת Push (קבוע, לא באמת צריך לשנות)
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    # "development" / "production". בייצור: בלי create_all (הסכמה מנוהלת ע"י
    # alembic upgrade head בעליית השרת), ובלי סודות ברירת מחדל.
    environment: str = "development"

    # מקורות (origins) שמורשים לקרוא ל-API מהדפדפן, מופרדים בפסיקים, למשל
    # "https://opuli.vercel.app". "*" = כולם (לפיתוח בלבד).
    cors_origins: str = "*"

    # OAuth Client ID של Google (מ-Google Cloud Console) - מזהה ציבורי, לא סוד.
    # ריק = התחברות עם Google כבויה. חייב להיות זהה ל-VITE_GOOGLE_CLIENT_ID באתר.
    google_client_id: str = ""

    # משוב/באגים ממסך הפרופיל נשלחים במייל דרך Resend (HTTP API - Render בחינם
    # חוסם SMTP יוצא). ריק = הטופס מחזיר 503. בלי דומיין מאומת ב-Resend אפשר
    # לשלוח רק מ-onboarding@resend.dev ורק לכתובת של בעל החשבון ב-Resend.
    resend_api_key: str = ""
    feedback_to_email: str = "lihirweb@gmail.com"
    feedback_from_email: str = "OpuLi Feedback <onboarding@resend.dev>"

    # מיילים של מנהלות הפורום (מופרדים בפסיקים): יכולות לנעוץ ולהסתיר פוסטים.
    # דיווחים על פוסטים נשלחים ל-feedback_to_email דרך Resend.
    admin_emails: str = ""

    # תזכורות במייל למשתמשים - נשלחות ב-SMTP (למשל Gmail עם App Password, או
    # Brevo). Resend לא מתאים כאן: בלי דומיין מאומת הוא שולח רק לבעל החשבון.
    # smtp_host ריק = תזכורות המייל כבויות (שום דבר לא נשלח ולא מסומן כנשלח).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    # כתובת השולח, למשל "OpuLi <opuli.app@gmail.com>". ריק = smtp_user
    email_from: str = ""
    # כתובת האתר לקישורים בתוך המיילים
    web_url: str = "https://opuli.web.app"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @field_validator("database_url")
    @classmethod
    def _use_psycopg_driver(cls, url: str) -> str:
        # Supabase/Neon נותנים "postgresql://..." או "postgres://..." - SQLAlchemy
        # צריך לדעת להשתמש ב-psycopg 3 (הדרייבר שמותקן), אחרת הוא מחפש psycopg2.
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @model_validator(mode="after")
    def _require_real_secrets_in_production(self) -> "Settings":
        if self.is_production:
            if self.jwt_secret == _DEFAULT_JWT_SECRET or self.internal_secret == _DEFAULT_INTERNAL_SECRET:
                raise ValueError("בייצור חובה להגדיר JWT_SECRET ו-INTERNAL_SECRET אמיתיים")
            if self.database_url.startswith("sqlite"):
                raise ValueError("בייצור DATABASE_URL חייב להצביע על Postgres")
        return self

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
