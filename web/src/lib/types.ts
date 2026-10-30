// טיפוסי ה-API - תואמים 1:1 לסכמות ה-Pydantic ב-backend/app/schemas.py

export type CourseStatus = 'done' | 'current' | 'planned'
export type CourseItemType = 'lesson' | 'assignment'
export type ThemeModePreference = 'system' | 'light' | 'dark'
/** ממ"ן = מטלת מנחה, ממ"ח = מטלת מחשב */
export type AssignmentKind = 'mmn' | 'mmh' | 'other'

export interface UserRead {
  id: number
  email: string
  display_name: string | null
  accent_color: string | null
  theme_mode: string | null
  avatar_icon: string | null
  calendar_token: string | null
  email_notify_assignments: boolean
  email_notify_exams: boolean
  email_notify_reminders: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface DegreeRead {
  id: number
  name: string
  institution: string | null
  target_credits: number | null
  icon: string | null
  created_at: string
}

export interface DegreeTemplateRead {
  key: string
  name: string
  institution: string
  target_credits: number
  course_count: number
  /** דרישות התואר לפי הידיעון (חובה = סכום הקורסים, null = אין יעד ידוע) */
  requirements: { category: string; min_credits: number | null }[]
}

/** מתי הקורס נפתח, דרישות קדם ונושא - לפי רשימת הקורסים של האו"פ (null לקורס שלא ברשימה) */
export interface CourseInfo {
  /** אותיות הסמסטרים שבהם הקורס נפתח כל שנה, ריק אם אין דפוס קבוע */
  semesters: string[]
  every_year: boolean
  /** ריק לקורס שלא ברשימת הקורסים של המחלקה */
  schedule_label: string
  /** null = לא ידוע (דף הקורס באתר האו"פ לא נקרא) */
  has_prerequisites: boolean | null
  subjects: string[]
  /** הידע הקודם מדף הקורס באתר האו"פ */
  required_knowledge: string[]
  recommended_knowledge: string[]
}

export interface CatalogCourseRead {
  id: number
  degree_id: number
  name: string
  credits: number
  category: string | null
  recommended_semester: string | null
  notes: string | null
  already_selected: boolean
  /** מספר הקורס מהתבנית, null בקורס שנוסף ידנית */
  course_code: string | null
  info: CourseInfo | null
}

export interface CourseRead {
  id: number
  degree_id: number | null
  catalog_course_id: number | null
  name: string
  credits: number
  semester: string | null
  semester_id: number | null
  status: CourseStatus
  category: string | null
  grade: number | null
  /** כללי הציון של הקורס - ריק = ברירת מחדל (ראו lib/grades.ts) */
  exam_weight: number | null
  min_exam_grade: number | null
  /** הציון הסופי המינימלי לעבור את הקורס - ריק = 60 */
  pass_grade: number | null
  min_assignments_count: number | null
  min_assignments_weight: number | null
  assignments_shield: boolean
  /** מספר הקורס במוסד (למשל "20407") - מחבר ללשונית העצות המשותפת */
  course_code: string | null
  info: CourseInfo | null
  created_at: string
}

export interface CourseItemRead {
  id: number
  course_id: number
  type: CourseItemType
  title: string
  due_date: string | null
  is_done: boolean
  order: number | null
  weight_percent: number | null
  grade: number | null
  notes: string | null
  watched_at: string | null
  kind: AssignmentKind | null
  is_mandatory: boolean
}

export interface ExamReminderRead {
  id: number
  offset_minutes: number
  sent_at: string | null
}

export type ExamTerm = 'a' | 'b' | 'special'

export interface ExamRead {
  id: number
  course_id: number
  date_time: string
  location: string | null
  notes: string | null
  /** מועד א' / ב' / מיוחד - ריק = לא צוין */
  term: ExamTerm | null
  reminders: ExamReminderRead[]
}

export interface UserReminderRead {
  id: number
  user_id: number
  title: string
  due_date: string | null
  is_done: boolean
  completed_at: string | null
  created_at: string
}

export interface SemesterRead {
  id: number
  degree_id: number
  name: string
  sort_order: number
  created_at: string
}

export interface StudyTopicRead {
  id: number
  course_id: number
  title: string
  is_done: boolean
  order: number
}

export interface DegreeRequirementRead {
  id: number
  degree_id: number
  category: string
  min_credits: number | null
  sort_order: number
}

export interface LinkRead {
  id: number
  course_id: number | null
  title: string
  url: string
  sort_order: number
  created_at: string
}

/** מפגש קבוע. weekday: 0=ראשון. שעות בשעון קיר ("18:00"), תאריכים YYYY-MM-DD. */
export interface ClassSessionRead {
  id: number
  course_id: number
  weekday: number
  start_time: string
  end_time: string
  title: string | null
  location: string | null
  interval_weeks: number
  start_date: string | null
  end_date: string | null
}

// ---------------------------------------------------------------------------
// עצות מסטודנטים (לשונית בקורס)
// ---------------------------------------------------------------------------

export type TipSort = 'top' | 'new' | 'old'

export interface TipRead {
  id: number
  parent_id: number | null
  /** null = התגובה נמחקה */
  author: { display_name: string; avatar_icon: string | null } | null
  reply_to_name: string | null
  body: string
  created_at: string
  edited: boolean
  deleted: boolean
  score: number
  /** ההצבעה של המשתמש/ת המחובר/ת בלבד: 1, -1 או 0 */
  my_vote: number
  is_mine: boolean
  /** הודעה רשמית של צוות OpuLi */
  official: boolean
  pinned: boolean
  reply_count: number
  replies: TipRead[]
}

export interface TipsPage {
  /** false = לקורס אין מספר קורס, ולכן אין לו דיון משותף */
  linked: boolean
  /** מנהלת OpuLi - יכולה לפרסם בשם הצוות ולנעוץ */
  is_admin: boolean
  course: { code: string; institution: string; name: string; participants: number } | null
  total: number
  items: TipRead[]
}

/** מבנה קורס שסטודנטים אחרים הזינו (מטלות, משקלים וכללי ציון - בלי תאריכים וציונים) */
export interface SharedStructureRead {
  assignments: { title: string; kind: AssignmentKind | null; weight_percent: number | null; is_mandatory: boolean }[]
  rules: {
    exam_weight: number | null
    min_exam_grade: number | null
    pass_grade: number | null
    min_assignments_count: number | null
    min_assignments_weight: number | null
    assignments_shield: boolean
  }
  /** כמה סטודנטים (חוץ ממך) משתמשים במבנה הזה */
  students: number
  entered_by: string
}

// ---------------------------------------------------------------------------
// קהילה (פורום)
// ---------------------------------------------------------------------------

export type ForumCategory = 'tip' | 'question' | 'study' | 'party' | 'community'
export type ForumSort = 'new' | 'top'

export interface ForumAuthor {
  display_name: string
  avatar_icon: string | null
}

export interface ForumEvent {
  starts_at: string
  ends_at: string | null
  place_public: string | null
  /** הכתובת המדויקת - רק למארגן/ת ולמי שאישר/ה הגעה */
  place_private: string | null
  going_count: number
  i_am_going: boolean
}

export interface ForumPost {
  id: number
  category: ForumCategory
  title: string
  body: string
  author: ForumAuthor | null
  course: { code: string; name: string } | null
  event: ForumEvent | null
  score: number
  voted: boolean
  saved: boolean
  comment_count: number
  is_mine: boolean
  /** פוסט רשמי של צוות OpuLi */
  official: boolean
  pinned: boolean
  hidden: boolean
  edited: boolean
  deleted: boolean
  created_at: string
}

export interface ForumFeed {
  linked: boolean
  institution: string | null
  is_admin: boolean
  total: number
  items: ForumPost[]
}

export interface ForumComment {
  id: number
  parent_id: number | null
  author: ForumAuthor | null
  reply_to_name: string | null
  body: string
  created_at: string
  edited: boolean
  deleted: boolean
  is_mine: boolean
  replies: ForumComment[]
}

export interface ForumPostDetail {
  post: ForumPost
  comments: ForumComment[]
}

export interface ForumAttendee {
  display_name: string
  email: string
  avatar_icon: string | null
  created_at: string
}

export interface ForumCourseActivity {
  course_id: number
  name: string
  post_count: number
}

export interface ForumPostCreate {
  category: ForumCategory
  title: string
  body: string
  course_id?: number | null
  event_starts_at?: string | null
  event_ends_at?: string | null
  place_public?: string | null
  place_private?: string | null
  /** למנהלות בלבד */
  as_team?: boolean
  pin?: boolean
  all_institutions?: boolean
}

// --- חיבור AI (שרת MCP) ---

export type AiScope = 'opuli.read' | 'opuli.write'

/** טוקן אישי - לכלים שלא תומכים בהתחברות אוטומטית */
export interface AiTokenRead {
  id: number
  name: string
  kind: string
  token_prefix: string
  scopes: AiScope[]
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

export interface AiTokenCreated extends AiTokenRead {
  /** הטוקן המלא - מוצג פעם אחת בלבד */
  token: string
}

/** אפליקציה שהתחברה דרך עמוד האישור (Claude, ChatGPT…) */
export interface AiConnectionRead {
  id: string
  name: string
  scopes: AiScope[]
  connected_at: string
  last_used_at: string | null
}

export interface OAuthRequestRead {
  client_name: string
  redirect_host: string
  /** שם אפליקציה מוכרת לפי הדומיין, או null כשהדומיין לא מוכר */
  known_app: string | null
  scopes: AiScope[]
  expires_at: string
}
