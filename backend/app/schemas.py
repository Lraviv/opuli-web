import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field, field_validator, model_validator

from .models import AssignmentKind, CourseItemType, CourseStatus
from .ou_course_info import get_course_info
from .tips import code_from_catalog_notes


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
    # טוקן מנוי היומן (אם נוצר) - הכתובת המלאה נבנית בצד הלקוח
    calendar_token: str | None = None
    email_notify_assignments: bool = True
    email_notify_exams: bool = True
    email_notify_reminders: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    """עדכון פרטי/הגדרות המשתמש/ת - PATCH /me (שם תצוגה, צבע ראשי, מצב תצוגה, אייקון)."""

    display_name: str | None = None
    accent_color: str | None = None
    theme_mode: str | None = None
    avatar_icon: str | None = Field(default=None, max_length=16)
    email_notify_assignments: bool | None = None
    email_notify_exams: bool | None = None
    email_notify_reminders: bool | None = None


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
    # דרישות התואר מהתבנית - משמשות גם להצעה בתואר קיים שעוד אין לו דרישות
    requirements: list["TemplateRequirement"] = []


class TemplateRequirement(BaseModel):
    category: str
    min_credits: float | None


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


class CourseInfoRead(BaseModel):
    """מתי הקורס נפתח, דרישות קדם ונושא - לפי רשימת הקורסים של האו"פ (ראו app/ou_course_info.py)."""

    semesters: list[str]
    every_year: bool
    schedule_label: str
    # None = לא ידוע (דף הקורס לא נקרא)
    has_prerequisites: bool | None
    subjects: list[str]
    required_knowledge: list[str]
    recommended_knowledge: list[str]


def _course_info(code: str | None) -> CourseInfoRead | None:
    info = get_course_info(code)
    if info is None:
        return None
    return CourseInfoRead(
        semesters=list(info.semesters),
        every_year=info.every_year,
        schedule_label=info.schedule_label,
        has_prerequisites=info.has_prerequisites,
        subjects=list(info.subjects),
        required_knowledge=list(info.required_knowledge),
        recommended_knowledge=list(info.recommended_knowledge),
    )


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

    @computed_field
    @property
    def course_code(self) -> str | None:
        # מספר הקורס מהתבנית (נשמר ב-notes) - בשביל חיפוש לפי מספר ותצוגה בשורה
        return code_from_catalog_notes(self.notes)

    @computed_field
    @property
    def info(self) -> CourseInfoRead | None:
        return _course_info(code_from_catalog_notes(self.notes))


class CatalogCourseSelect(BaseModel):
    """גוף הבקשה ל-POST /catalog-courses/{id}/select - בחירת קורס מהקטלוג."""

    status: CourseStatus = CourseStatus.planned
    semester: str | None = None
    # שיבוץ ישר לסמסטר בלוח התכנון (מ"+" במסך התכנון). חייב להיות סמסטר של אותו תואר
    semester_id: int | None = None
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
    exam_weight: float | None = Field(default=None, ge=0, le=100)
    min_exam_grade: float | None = Field(default=None, ge=0, le=100)
    pass_grade: float | None = Field(default=None, ge=0, le=100)
    min_assignments_count: int | None = Field(default=None, ge=0, le=50)
    min_assignments_weight: float | None = Field(default=None, ge=0, le=100)
    assignments_shield: bool = False
    course_code: str | None = Field(default=None, max_length=20)


class CourseUpdate(BaseModel):
    name: str | None = None
    credits: float | None = None
    semester: str | None = None
    semester_id: int | None = None
    status: CourseStatus | None = None
    category: str | None = None
    grade: float | None = None
    exam_weight: float | None = Field(default=None, ge=0, le=100)
    min_exam_grade: float | None = Field(default=None, ge=0, le=100)
    pass_grade: float | None = Field(default=None, ge=0, le=100)
    min_assignments_count: int | None = Field(default=None, ge=0, le=50)
    min_assignments_weight: float | None = Field(default=None, ge=0, le=100)
    assignments_shield: bool | None = None
    course_code: str | None = Field(default=None, max_length=20)


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
    exam_weight: float | None = None
    min_exam_grade: float | None = None
    pass_grade: float | None = None
    min_assignments_count: int | None = None
    min_assignments_weight: float | None = None
    assignments_shield: bool = False
    course_code: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def info(self) -> CourseInfoRead | None:
        return _course_info(self.course_code)


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
    # רלוונטי למטלות - ממ"ן / ממ"ח / אחר, והאם חובה
    kind: AssignmentKind | None = None
    is_mandatory: bool = False


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
    kind: AssignmentKind | None = None
    is_mandatory: bool | None = None


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
    kind: AssignmentKind | None = None
    is_mandatory: bool = False

    model_config = ConfigDict(from_attributes=True)


class BatchAssignmentCreate(BaseModel):
    """יצירת סדרת מטלות ממוספרות - למשל ממ"ן 11 עד ממ"ן 15."""

    kind: AssignmentKind
    count: int = Field(gt=0, le=20)
    # המספר הראשון בסדרה. ריק = ברירת מחדל לפי הסוג (ממ"ן 11, ממ"ח 01)
    start_number: int | None = Field(default=None, ge=0, le=99)
    weight_percent: float | None = Field(default=None, ge=0, le=100)
    is_mandatory: bool = False
    # תאריך ההגשה של המטלה הראשונה, וכל כמה שבועות הבאה אחריה. ריק = בלי תאריכים
    first_due_date: datetime | None = None
    interval_weeks: int | None = Field(default=None, ge=1, le=12)


# ---------------------------------------------------------------------------
# מבחנים ותזכורות
# ---------------------------------------------------------------------------


class ExamReminderRead(BaseModel):
    id: int
    offset_minutes: int
    sent_at: datetime | None

    model_config = ConfigDict(from_attributes=True)


ExamTerm = Literal["a", "b", "special"]


class ExamCreate(BaseModel):
    date_time: datetime
    location: str | None = None
    notes: str | None = None
    term: ExamTerm | None = None
    # בדקות לפני המבחן; None = להשתמש בברירת המחדל (יום + שעתיים לפני)
    reminder_offsets_minutes: list[int] | None = None


class ExamUpdate(BaseModel):
    date_time: datetime | None = None
    location: str | None = None
    notes: str | None = None
    term: ExamTerm | None = None
    # אם מסופק, מחליף את כל התזכורות הקיימות (שעדיין לא נשלחו) בחדשות
    reminder_offsets_minutes: list[int] | None = None


class ExamRead(BaseModel):
    id: int
    course_id: int
    date_time: datetime
    location: str | None
    notes: str | None
    term: str | None = None
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


# ---------------------------------------------------------------------------
# חומר לימוד (נושאים לסימון בכל קורס)
# ---------------------------------------------------------------------------


class StudyTopicCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class StudyTopicBatchCreate(BaseModel):
    """הדבקת רשימה - כל מחרוזת היא נושא. שורות ריקות מסוננות בשרת."""

    titles: list[str] = Field(min_length=1, max_length=200)


class StudyTopicUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    is_done: bool | None = None


class StudyTopicRead(BaseModel):
    id: int
    course_id: int
    title: str
    is_done: bool
    order: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# דרישות תואר (יעד נ"ז לכל קטגוריה)
# ---------------------------------------------------------------------------


class DegreeRequirementWrite(BaseModel):
    category: str = Field(min_length=1, max_length=120)
    min_credits: float | None = Field(default=None, ge=0, le=500)

    @field_validator("category")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("קטגוריה ריקה")
        return v


class DegreeRequirementsReplace(BaseModel):
    """PUT /degrees/{id}/requirements - מחליף את כל רשימת הדרישות, לפי הסדר שנשלח."""

    requirements: list[DegreeRequirementWrite] = Field(max_length=50)

    @model_validator(mode="after")
    def _unique_categories(self) -> "DegreeRequirementsReplace":
        names = [r.category for r in self.requirements]
        if len(names) != len(set(names)):
            raise ValueError("כל קטגוריה יכולה להופיע פעם אחת")
        return self


class DegreeRequirementRead(BaseModel):
    id: int
    degree_id: int
    category: str
    min_credits: float | None
    sort_order: int

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# קישורים אישיים
# ---------------------------------------------------------------------------

_SCHEME_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.-]*:")


def normalize_url(raw: str) -> str:
    """מוסיפה https:// כשאין פרוטוקול, ומאפשרת רק http/https (חוסם javascript: וכו')."""
    url = raw.strip()
    if not url:
        raise ValueError("כתובת ריקה")
    if url.startswith("//"):
        url = "https:" + url
    elif not _SCHEME_RE.match(url) or re.match(r"^[^/:]+:\d", url):
        # "example.com" / "localhost:3000" - בלי פרוטוקול
        url = "https://" + url
    scheme = url.split(":", 1)[0].lower()
    if scheme not in ("http", "https"):
        raise ValueError("אפשר לשמור רק קישורי http/https")
    if any(c.isspace() for c in url):
        raise ValueError("כתובת לא תקינה")
    host = url.split("://", 1)[1].split("/", 1)[0] if "://" in url else ""
    if not host:
        raise ValueError("כתובת לא תקינה")
    return url


class LinkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1, max_length=2000)
    course_id: int | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("כותרת ריקה")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v: str) -> str:
        return normalize_url(v)


class LinkUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    url: str | None = Field(default=None, min_length=1, max_length=2000)
    sort_order: int | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("כותרת ריקה")
        return v

    @field_validator("url")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        return None if v is None else normalize_url(v)


class LinkRead(BaseModel):
    id: int
    course_id: int | None
    title: str
    url: str
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# מפגשים קבועים (מערכת שעות)
# ---------------------------------------------------------------------------

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _check_time(v: str) -> str:
    v = v.strip()
    if not _TIME_RE.match(v):
        raise ValueError("שעה בפורמט HH:MM")
    return v


def _check_date(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    date.fromisoformat(v)  # זורק ValueError אם לא תקין
    return v


class _SessionFields(BaseModel):
    @field_validator("start_time", "end_time", check_fields=False)
    @classmethod
    def _times(cls, v: str | None) -> str | None:
        return None if v is None else _check_time(v)

    @field_validator("start_date", "end_date", check_fields=False)
    @classmethod
    def _dates(cls, v: str | None) -> str | None:
        return _check_date(v)


class ClassSessionCreate(_SessionFields):
    weekday: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    title: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    interval_weeks: int = Field(default=1, ge=1, le=4)
    start_date: str | None = None
    end_date: str | None = None

    @model_validator(mode="after")
    def _order(self) -> "ClassSessionCreate":
        if self.end_time <= self.start_time:
            raise ValueError("שעת הסיום חייבת להיות אחרי שעת ההתחלה")
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("תאריך הסיום לפני תאריך ההתחלה")
        if self.interval_weeks > 1 and not self.start_date:
            # בלי תאריך עוגן אי אפשר לדעת באיזה שבוע מתחיל ה"כל שבועיים"
            raise ValueError("במפגש שאינו שבועי צריך תאריך התחלה")
        return self


class ClassSessionUpdate(_SessionFields):
    weekday: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = None
    end_time: str | None = None
    title: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=200)
    interval_weeks: int | None = Field(default=None, ge=1, le=4)
    start_date: str | None = None
    end_date: str | None = None


class ClassSessionRead(BaseModel):
    id: int
    course_id: int
    weekday: int
    start_time: str
    end_time: str
    title: str | None
    location: str | None
    interval_weeks: int
    start_date: str | None
    end_date: str | None

    model_config = ConfigDict(from_attributes=True)


class CalendarTokenRead(BaseModel):
    token: str
    # נתיב יחסי לשרת ה-API - הקליינט מצמיד אותו לכתובת ה-API שלו
    path: str


# ---------------------------------------------------------------------------
# טוקנים לאפליקציות AI (שרת ה-MCP)
# ---------------------------------------------------------------------------


class AiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    # opuli.read / opuli.write (write כולל read)
    scopes: list[str] = Field(default_factory=lambda: ["opuli.read"], min_length=1)
    # None = בלי תפוגה
    expires_in_days: int | None = Field(default=90, ge=1, le=365)


class AiTokenRead(BaseModel):
    id: int
    name: str
    kind: str
    token_prefix: str
    scopes: list[str]
    created_at: datetime
    expires_at: datetime | None
    last_used_at: datetime | None


class AiTokenCreated(AiTokenRead):
    # הטוקן המלא - מוחזר רק ביצירה, ולא נשמר בשרת
    token: str
