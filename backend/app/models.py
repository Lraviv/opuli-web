from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import UniqueConstraint
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
    # טוקן סודי לכתובת מנוי היומן (/calendar/feed/{token}.ics). ריק = אין מנוי פעיל
    calendar_token: Optional[str] = Field(default=None, index=True, unique=True)
    # תזכורות במייל - כל סוג נשלט בנפרד ממסך הפרופיל (ברירת מחדל: פעיל)
    email_notify_assignments: bool = Field(default=True)
    email_notify_exams: bool = Field(default=True)
    email_notify_reminders: bool = Field(default=True)
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
    # ---- כללי הציון של הקורס (מחשבון ציון + זכאות לבחינה) - הכול אופציונלי ----
    # משקל הבחינה באחוזים. ריק = 100 פחות סכום משקלי המטלות
    exam_weight: Optional[float] = None
    # ציון מינימום בבחינה כדי לעבור את הקורס. ריק = 60 בצד הלקוח
    min_exam_grade: Optional[float] = None
    # הציון הסופי המינימלי כדי לעבור את הקורס. ריק = 60 בצד הלקוח.
    # קורס שהושלם עם ציון נמוך ממנו לא נספר בנ"ז ובממוצע
    pass_grade: Optional[float] = None
    # זכאות לבחינה: מספר מטלות מינימלי שהוגשו ו/או משקל מינימלי שהוגש
    min_assignments_count: Optional[int] = None
    min_assignments_weight: Optional[float] = None
    # מטלות "מגן": ציון המטלות נכלל רק אם הוא משפר את הציון
    assignments_shield: bool = Field(default=False)
    # מספר הקורס במוסד (למשל "20407") - יחד עם המוסד של התואר מזהה את הקורס
    # המשותף לכל הסטודנטים (ראו SharedCourse ולשונית העצות)
    course_code: Optional[str] = None
    shared_course_id: Optional[int] = Field(default=None, foreign_key="shared_courses.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AssignmentKind(str, Enum):
    mmn = "mmn"  # ממ"ן - מטלת מנחה
    mmh = "mmh"  # ממ"ח - מטלת מחשב
    other = "other"


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
    # רלוונטי למטלות: ממ"ן / ממ"ח / אחר, והאם המטלה חובה
    kind: Optional[AssignmentKind] = None
    is_mandatory: bool = Field(default=False)
    # מתי נשלחה תזכורת במייל על המטלה (יום לפני ההגשה). ריק = עוד לא נשלחה
    email_sent_at: Optional[datetime] = None


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
    # מועד הבחינה: "a" (מועד א'), "b" (מועד ב'), "special" (מועד מיוחד). ריק = לא צוין
    term: Optional[str] = None
    # מתי נשלחה תזכורת במייל על המבחן (יום לפני). ריק = עוד לא נשלחה
    email_sent_at: Optional[datetime] = None


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
    # מתי נשלחה התזכורת במייל (בזמן התזכורת). ריק = עוד לא נשלחה
    email_sent_at: Optional[datetime] = None


class Semester(SQLModel, table=True):
    """סמסטר בלוח התכנון (backlog-style) של תואר - ראו degree/[id]/plan.tsx במובייל."""

    __tablename__ = "semesters"

    id: Optional[int] = Field(default=None, primary_key=True)
    degree_id: int = Field(foreign_key="degrees.id", index=True)
    name: str
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class DegreeRequirement(SQLModel, table=True):
    """יעד נ"ז לקטגוריה בתואר (למשל "חובה - מדעי המחשב": 42). ההתאמה לקורסים לפי Course.category."""

    __tablename__ = "degree_requirements"

    id: Optional[int] = Field(default=None, primary_key=True)
    degree_id: int = Field(foreign_key="degrees.id", index=True)
    category: str
    min_credits: Optional[float] = None
    sort_order: int = Field(default=0)


class Link(SQLModel, table=True):
    """קישור אישי - כללי (course_id ריק, מוצג בבית) או של קורס מסוים."""

    __tablename__ = "links"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    course_id: Optional[int] = Field(default=None, foreign_key="courses.id", index=True)
    title: str
    url: str
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ClassSession(SQLModel, table=True):
    """מפגש קבוע של קורס (מפגש הנחיה / הרצאה / תרגול) - חוזר כל interval_weeks שבועות.

    weekday: 0=ראשון ... 6=שבת. השעות הן שעון קיר מקומי ("18:00"), לא UTC.
    start_date/end_date (YYYY-MM-DD, אופציונליים) תוחמים את הסמסטר; start_date
    הוא גם העוגן לחישוב "כל שבועיים".
    """

    __tablename__ = "class_sessions"

    id: Optional[int] = Field(default=None, primary_key=True)
    course_id: int = Field(foreign_key="courses.id", index=True)
    weekday: int
    start_time: str
    end_time: str
    title: Optional[str] = None
    location: Optional[str] = None
    interval_weeks: int = Field(default=1)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SharedCourse(SQLModel, table=True):
    """קורס "אמיתי" במוסד, משותף לכל הסטודנטים שלומדים אותו - מזוהה לפי מוסד + מספר קורס.

    כל Course אישי עם course_code מקושר לכאן (shared_course_id), וזה מה שמחבר
    סטודנטים שונים לאותו דיון עצות.
    """

    __tablename__ = "shared_courses"
    __table_args__ = (UniqueConstraint("institution", "code", name="uq_shared_courses_institution_code"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    # שם מוסד מנורמל (ראו tips.normalize_institution). ריק = לא צוין מוסד בתואר
    institution: str = Field(default="")
    code: str
    # שם הקורס כפי שהופיע אצל הסטודנט/ית הראשון/ה שקישר/ה אותו
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CoursePost(SQLModel, table=True):
    """תגובה בלשונית העצות של קורס משותף. parent_id ריק = תגובה ראשית, אחרת תשובה בשרשור.

    השרשור הוא ברמה אחת: תשובה לתשובה נשמרת תחת אותה תגובה ראשית, עם
    reply_to_user_id כדי להציג "בתגובה ל־שם".
    """

    __tablename__ = "course_posts"

    id: Optional[int] = Field(default=None, primary_key=True)
    shared_course_id: int = Field(foreign_key="shared_courses.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    parent_id: Optional[int] = Field(default=None, foreign_key="course_posts.id", index=True)
    reply_to_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    body: str
    # מחושבים מראש כדי שהמיון יהיה שאילתה פשוטה - מתעדכנים יחד עם הצבעה/תשובה
    score: int = Field(default=0)
    reply_count: int = Field(default=0)
    # הודעה רשמית של מנהלת: מוצגת בשם "צוות OpuLi", ונעוצה מופיעה ראשונה
    as_team: bool = Field(default=False)
    pinned_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    edited_at: Optional[datetime] = None
    # תגובה ראשית שנמחקה ויש לה תשובות נשארת כ"התגובה נמחקה" כדי לשמור על השרשור
    deleted_at: Optional[datetime] = None


class CoursePostVote(SQLModel, table=True):
    """הצבעה אנונימית על תגובה: user_id נשמר רק כדי למנוע הצבעה כפולה, ולא נחשף ב-API."""

    __tablename__ = "course_post_votes"

    post_id: int = Field(foreign_key="course_posts.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    value: int  # 1 או -1
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ForumPost(SQLModel, table=True):
    """פוסט בפורום הקהילה של מוסד (עצה, שאלה, מפגש לימוד, מסיבה/אירוע, קהילה).

    הפורום משותף לכל הסטודנטים באותו מוסד (מנורמל, ראו tips.normalize_institution).
    למפגשים ולאירועים יש גם תאריך ומקום; הכתובת המדויקת (place_private) נחשפת
    רק לכותב/ת ולמי שאישר/ה הגעה.
    """

    __tablename__ = "forum_posts"

    id: Optional[int] = Field(default=None, primary_key=True)
    institution: str = Field(index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    # tip / question / study / party / community
    category: str = Field(index=True)
    title: str
    body: str
    # תגית קורס אופציונלית - לסינון "פוסטים על הקורס הזה"
    shared_course_id: Optional[int] = Field(default=None, foreign_key="shared_courses.id", index=True)
    event_starts_at: Optional[datetime] = None
    event_ends_at: Optional[datetime] = None
    # עיר או "זום" - גלוי לכולם
    place_public: Optional[str] = None
    # כתובת או קישור מדויק - רק לכותב/ת ולמגיעים
    place_private: Optional[str] = None
    # מחושבים מראש כדי שהמיון יהיה שאילתה פשוטה
    score: int = Field(default=0)
    comment_count: int = Field(default=0)
    going_count: int = Field(default=0)
    pinned_at: Optional[datetime] = None
    # מוסתר ע"י מנהלת או אוטומטית אחרי כמה דיווחים
    hidden_at: Optional[datetime] = None
    # פוסט רשמי של מנהלת: מוצג בשם "צוות OpuLi" במקום שם הכותבת
    as_team: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class ForumComment(SQLModel, table=True):
    """תגובה על פוסט בפורום. שרשור ברמה אחת, כמו בלשונית העצות."""

    __tablename__ = "forum_comments"

    id: Optional[int] = Field(default=None, primary_key=True)
    post_id: int = Field(foreign_key="forum_posts.id", index=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    parent_id: Optional[int] = Field(default=None, foreign_key="forum_comments.id", index=True)
    reply_to_user_id: Optional[int] = Field(default=None, foreign_key="users.id")
    body: str
    reply_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    edited_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    hidden_at: Optional[datetime] = None


class ForumVote(SQLModel, table=True):
    """הצבעה בעד (אנונימית) על פוסט. user_id רק למניעת כפילות, לא נחשף ב-API."""

    __tablename__ = "forum_votes"

    post_id: int = Field(foreign_key="forum_posts.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ForumRsvp(SQLModel, table=True):
    """אישור הגעה למפגש/אירוע. השם והמייל נחשפים רק למארגן/ת (כותב/ת הפוסט)."""

    __tablename__ = "forum_rsvps"

    post_id: int = Field(foreign_key="forum_posts.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ForumSave(SQLModel, table=True):
    __tablename__ = "forum_saves"

    post_id: int = Field(foreign_key="forum_posts.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ForumReport(SQLModel, table=True):
    """דיווח על פוסט או תגובה. כל משתמש/ת מדווח/ת פעם אחת על כל יעד."""

    __tablename__ = "forum_reports"
    __table_args__ = (
        UniqueConstraint("target_type", "target_id", "reporter_id", name="uq_forum_reports_target_reporter"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    # "post" / "comment"
    target_type: str
    target_id: int = Field(index=True)
    reporter_id: int = Field(foreign_key="users.id")
    reason: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    resolved_at: Optional[datetime] = None


class AiToken(SQLModel, table=True):
    """טוקן גישה של אפליקציית AI (Claude, ChatGPT וכו') לשרת ה-MCP.

    הטוקן עצמו מוצג פעם אחת ביצירה; נשמר רק ה-hash שלו (SHA-256), כך שדליפה
    של המסד לא חושפת טוקנים. kind: personal = טוקן אישי שנוצר בפרופיל.
    scopes מופרדים ברווח (opuli.read / opuli.write).
    """

    __tablename__ = "ai_tokens"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    token_hash: str = Field(index=True, unique=True)
    # תחילת הטוקן לתצוגה ברשימה ("opl_ab12…"), כדי לזהות אותו בלי לחשוף אותו
    token_prefix: str
    kind: str = Field(default="personal")
    name: str
    client_id: Optional[str] = None
    scopes: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
