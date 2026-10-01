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
  /** האם חלון ההסבר של ההתחברות הראשונה כבר הוצג */
  intro_seen: boolean
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
  min_assignments_count: number | null
  min_assignments_weight: number | null
  assignments_shield: boolean
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

export interface ExamRead {
  id: number
  course_id: number
  date_time: string
  location: string | null
  notes: string | null
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
