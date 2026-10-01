from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from .models import CourseItemType, CourseStatus


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    # ה-ID token ("credential") שהכפתור של Google מחזיר לדפדפן
    credential: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserRead(BaseModel):
    id: int
    email: EmailStr
    display_name: str | None
    accent_color: str | None
    theme_mode: str | None
    avatar_icon: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """עדכון פרטי/הגדרות המשתמש/ת - PATCH /me (שם תצוגה, צבע ראשי, מצב תצוגה, אייקון)."""

    display_name: str | None = None
    accent_color: str | None = None
    theme_mode: str | None = None
    avatar_icon: str | None = Field(default=None, max_length=16)


# ---------------------------------------------------------------------------
# תארים
# ---------------------------------------------------------------------------


class DegreeCreate(BaseModel):
    name: str
    institution: str | None = None
    target_credits: float | None = None
    icon: str | None = Field(default=None, max_length=16)
    # מפתח תבנית אופציונלי (ראו GET /degree-templates) - אם מסופק, קטלוג
    # הקורסים של התבנית נטען אוטומטית לתואר החדש בזמן היצירה.
    template: str | None = None


class DegreeUpdate(BaseModel):
    name: str | None = None
    institution: str | None = None
    target_credits: float | None = None
    icon: str | None = Field(default=None, max_length=16)


class DegreeRead(BaseModel):
    id: int
    name: str
    institution: str | None
    target_credits: float | None
    icon: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DegreeTemplateRead(BaseModel):
    key: str
    name: str
    institution: str
    target_credits: float
    course_count: int


# ---------------------------------------------------------------------------
# קטלוג קורסים
# ---------------------------------------------------------------------------


class CatalogCourseCreate(BaseModel):
    name: str
    credits: float
    category: str | None = None
    recommended_semester: str | None = None
    notes: str | None = None


class CatalogCourseUpdate(BaseModel):
    name: str | None = None
    credits: float | None = None
    category: str | None = None
    recommended_semester: str | None = None
    notes: str | None = None


class CatalogCourseRead(BaseModel):
    id: int
    degree_id: int
    name: str
    credits: float
    category: str | None
    recommended_semester: str | None
    notes: str | None
    # True אם המשתמש כבר בחר את הקורס הזה (יש Course שמצביע לכאן)
    already_selected: bool = False

    model_config = ConfigDict(from_attributes=True)


class CatalogCourseSelect(BaseModel):
    """גוף הבקשה ל-POST /catalog-courses/{id}/select - בחירת קורס מהקטלוג."""

    status: CourseStatus = CourseStatus.planned
    semester: str | None = None
    grade: float | None = None


# ---------------------------------------------------------------------------
# קורסים אישיים
# ---------------------------------------------------------------------------


class CourseCreate(BaseModel):
    """הוספת קורס ידנית (לא מהקטלוג)."""

    name: str
    credits: float
    degree_id: int | None = None
    semester: str | None = None
    semester_id: int | None = None
    status: CourseStatus = CourseStatus.planned
    category: str | None = None
    grade: float | None = None


class CourseUpdate(BaseModel):
    name: str | None = None
    credits: float | None = None
    semester: str | None = None
    semester_id: int | None = None
    status: CourseStatus | None = None
    category: str | None = None
    grade: float | None = None


class CourseRead(BaseModel):
    id: int
    degree_id: int | None
    catalog_course_id: int | None
    name: str
    credits: float
    semester: str | None
    semester_id: int | None
    status: CourseStatus
    category: str | None
    grade: float | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# פריטי התקדמות (שיעורים / מטלות)
# ---------------------------------------------------------------------------


class CourseItemCreate(BaseModel):
    type: CourseItemType
    title: str
    due_date: datetime | None = None
    order: int | None = None
    # רלוונטי בעיקר למטלות - כמה אחוזים מהציון הסופי של הקורס המטלה שווה
    weight_percent: float | None = None
    # הציון שהתקבל בפועל במטלה (0-100), בנפרד מ-weight_percent
    grade: float | None = None
    notes: str | None = None
    # רלוונטי לשיעורים - מתי השיעור נצפה
    watched_at: datetime | None = None


class CourseItemUpdate(BaseModel):
    type: CourseItemType | None = None
    title: str | None = None
    due_date: datetime | None = None
    is_done: bool | None = None
    order: int | None = None
    weight_percent: float | None = None
    grade: float | None = None
    notes: str | None = None
    watched_at: datetime | None = None


class CourseItemRead(BaseModel):
    id: int
    course_id: int
    type: CourseItemType
    title: str
    due_date: datetime | None
    is_done: bool
    order: int | None
    weight_percent: float | None
    grade: float | None
    notes: str | None
    watched_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# מבחנים ותזכורות
# ---------------------------------------------------------------------------


class ExamReminderRead(BaseModel):
    id: int
    offset_minutes: int
    sent_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


class ExamCreate(BaseModel):
    date_time: datetime
    location: str | None = None
    notes: str | None = None
    # בדקות לפני המבחן; None = להשתמש בברירת המחדל (יום + שעתיים לפני)
    reminder_offsets_minutes: list[int] | None = None


class ExamUpdate(BaseModel):
    date_time: datetime | None = None
    location: str | None = None
    notes: str | None = None
    # אם מסופק, מחליף את כל התזכורות הקיימות (שעדיין לא נשלחו) בחדשות
    reminder_offsets_minutes: list[int] | None = None


class ExamRead(BaseModel):
    id: int
    course_id: int
    date_time: datetime
    location: str | None
    notes: str | None
    reminders: list[ExamReminderRead] = []

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# טוקני Push
# ---------------------------------------------------------------------------


class PushTokenCreate(BaseModel):
    expo_push_token: str
    device_info: str | None = None


class PushTokenRead(BaseModel):
    id: int
    expo_push_token: str
    device_info: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# סמסטרים (לוח תכנון)
# ---------------------------------------------------------------------------


class SemesterCreate(BaseModel):
    name: str
    sort_order: int | None = None


class SemesterUpdate(BaseModel):
    name: str | None = None
    sort_order: int | None = None


class SemesterRead(BaseModel):
    id: int
    degree_id: int
    name: str
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MoveCourseToSemester(BaseModel):
    """גוף הבקשה ל-PUT /courses/{id}/semester - הזזת קורס בין סמסטרים בלוח התכנון."""

    semester_id: int | None = None
