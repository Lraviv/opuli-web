from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class CourseStatus(str, Enum):
    done = "done"
    current = "current"
    planned = "planned"


class CourseItemType(str, Enum):
    lesson = "lesson"
    assignment = "assignment"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    # למשתמשים שנרשמו רק עם Google: סימון שלא תואם לשום סיסמה (ראו security.py)
    password_hash: str
    # מזהה המשתמש הקבוע אצל Google ("sub" בטוקן) - נשאר גם אם כתובת ה-Gmail משתנה
    google_sub: Optional[str] = Field(default=None, index=True, unique=True)
    display_name: Optional[str] = None
    # צבע ראשי (hex, למשל "#2563EB") שנבחר במסך הפרופיל - ברירת מחדל נקבעת בצד הלקוח
    accent_color: Optional[str] = None
    # מצב תצוגה מועדף: "system" (ברירת מחדל, לפי המכשיר/דפדפן) / "light" / "dark"
    theme_mode: Optional[str] = None
    # אייקון פרופיל (אימוג'י, למשל "🦊") שנבחר במסך הפרופיל. ריק = האות הראשונה של השם
    avatar_icon: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Degree(SQLModel, table=True):
    __tablename__ = "degrees"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    name: str
    institution: Optional[str] = None
    target_credits: Optional[float] = None
    # אייקון התואר (אימוג'י, למשל "💻"). ריק = ברירת מחדל בצד הלקוח
    icon: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CatalogCourse(SQLModel, table=True):
    """קורס ב"תפריט" של תואר - עדיין לא בהכרח נלקח ע"י המשתמש."""

    __tablename__ = "catalog_courses"

    id: Optional[int] = Field(default=None, primary_key=True)
    degree_id: int = Field(foreign_key="degrees.id", index=True)
    name: str
    credits: float
    category: Optional[str] = None
    recommended_semester: Optional[str] = None
    notes: Optional[str] = None


class Course(SQLModel, table=True):
    """קורס אישי שהמשתמש בפועל עושה - הושלם / בתהליך / מתוכנן."""

    __tablename__ = "courses"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    degree_id: Optional[int] = Field(default=None, foreign_key="degrees.id")
    catalog_course_id: Optional[int] = Field(default=None, foreign_key="catalog_courses.id")
    name: str
    credits: float
    semester: Optional[str] = None
    # קישור לרשומת Semester (לוח תכנון סמסטרים) - בנפרד מ-semester שהוא תווית טקסט חופשית ישנה
    semester_id: Optional[int] = Field(default=None, foreign_key="semesters.id")
    status: CourseStatus = Field(default=CourseStatus.planned)
    category: Optional[str] = None
    grade: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CourseItem(SQLModel, table=True):
    """שיעור או מטלה בתוך קורס."""

    __tablename__ = "course_items"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    type: CourseItemType
    title: str
    due_date: Optional[datetime] = None
    is_done: bool = Field(default=False)
    completed_at: Optional[datetime] = None
    order: Optional[int] = None
    # רלוונטי בעיקר למטלות (type=assignment): כמה אחוזים מהציון הסופי של
    # הקורס המטלה הזו שווה (למשל 10 = 10% מהציון). לא רלוונטי לשיעורים.
    weight_percent: Optional[float] = None
    # הציון שהתקבל בפועל במטלה הזו (0-100) - בנפרד מ-Course.grade שהוא הציון
    # הסופי הכולל של הקורס, ובנפרד מ-weight_percent שהוא כמה המטלה "שווה".
    grade: Optional[float] = None
    notes: Optional[str] = None
    # רלוונטי לשיעורים (type=lesson): מתי השיעור נצפה בפועל
    watched_at: Optional[datetime] = None


class StudyTopic(SQLModel, table=True):
    """נושא בחומר הלימוד של קורס (למשל "פרק 3 - מטריצות") - רשימת סימון להכנה למבחן."""

    __tablename__ = "study_topics"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    title: str
    is_done: bool = Field(default=False)
    # סדר התצוגה - נשמר כפי שהוזן (סדר הסילבוס)
    order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Exam(SQLModel, table=True):
    __tablename__ = "exams"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    date_time: datetime
    location: Optional[str] = None
    notes: Optional[str] = None


class ExamReminder(SQLModel, table=True):
    __tablename__ = "exam_reminders"

    id: Optional[int] = Field(default=None, primary_key=True)
    exam_id: int = Field(foreign_key="exams.id", index=True)
    offset_minutes: int
    sent_at: Optional[datetime] = None


class PushToken(SQLModel, table=True):
    __tablename__ = "push_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    expo_push_token: str
    device_info: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class UserReminder(SQLModel, table=True):
    __tablename__ = "user_reminders"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    title: str
    due_date: Optional[datetime] = None
    is_done: bool = Field(default=False)
    completed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Semester(SQLModel, table=True):
    """סמסטר בלוח התכנון (backlog-style) של תואר - ראו degree/[id]/plan.tsx במובייל."""

    __tablename__ = "semesters"

    id: Optional[int] = Field(default=None, primary_key=True)
    degree_id: int = Field(foreign_key="degrees.id", index=True)
    name: str
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
