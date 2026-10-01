// פריסת הלו"ז השבועי - פונקציות טהורות. כל התאריכים כאן לפי שעון **מקומי**
// (לא toISOString, שמחזיר UTC ומזיז את "היום" אחרי 21:00 בישראל).
// אותה לוגיקה קיימת גם באפליקציה (opu-li/src/lib/schedule.ts).

import type { ClassSessionRead } from './types'

export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']

const pad = (n: number) => String(n).padStart(2, '0')

/** Date -> "YYYY-MM-DD" לפי שעון מקומי */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** "YYYY-MM-DD" -> Date בחצות מקומית */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  r.setDate(r.getDate() + days)
  return r
}

/** יום ראשון של השבוע שבו נמצא d (שבוע ישראלי: א'-ש') */
export function startOfWeek(d: Date): Date {
  return addDays(d, -d.getDay())
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
}

/** מספר השבועות בין שני ימי ראשון (עיגול - חסין למעברי שעון קיץ/חורף) */
function weeksBetween(a: Date, b: Date): number {
  return Math.round((startOfWeek(b).getTime() - startOfWeek(a).getTime()) / (7 * 24 * 60 * 60 * 1000))
}

/** המופע הראשון של weekday (0=ראשון) בתאריך anchor או אחריו - זהה ל-first_occurrence בשרת (app/ical.py) */
export function firstOccurrence(weekday: number, anchor: Date): Date {
  return addDays(anchor, (weekday - anchor.getDay() + 7) % 7)
}

export function sessionOccursOn(
  session: Pick<ClassSessionRead, 'weekday' | 'interval_weeks' | 'start_date' | 'end_date'>,
  day: Date,
): boolean {
  if (day.getDay() !== session.weekday) return false
  const key = dateKey(day)
  if (session.start_date && key < session.start_date) return false
  if (session.end_date && key > session.end_date) return false
  if (session.interval_weeks > 1) {
    if (!session.start_date) return false
    // הספירה מתחילה מהמופע הראשון אחרי תאריך ההתחלה, כמו בקובץ היומן
    const first = firstOccurrence(session.weekday, parseDateKey(session.start_date))
    const diff = weeksBetween(first, day)
    if (diff % session.interval_weeks !== 0) return false
  }
  return true
}

export type AgendaKind = 'session' | 'exam' | 'assignment' | 'lesson' | 'reminder'

export interface AgendaItem {
  key: string
  kind: AgendaKind
  title: string
  courseId: number | null
  courseName: string | null
  /** שעה להצגה ("18:00"), null לאירוע של יום שלם */
  time: string | null
  endTime?: string | null
  location?: string | null
  done?: boolean
  mandatory?: boolean
  /** מזהה המקור (פריט/מבחן/תזכורת) - לפעולות כמו סימון הוגש */
  sourceId: number
}

export const AGENDA_KIND_LABEL: Record<AgendaKind, string> = {
  session: 'מפגש',
  exam: 'מבחן',
  assignment: 'הגשה',
  lesson: 'שיעור',
  reminder: 'תזכורת',
}

export interface AgendaSources {
  sessions: ClassSessionRead[]
  exams: { id: number; course_id: number; date_time: string; location: string | null }[]
  assignments: { id: number; course_id: number; title: string; due_date: string | null; is_done: boolean; is_mandatory?: boolean }[]
  lessons?: { id: number; course_id: number; title: string; due_date: string | null; is_done: boolean }[]
  reminders: { id: number; title: string; due_date?: string | null; is_done: boolean }[]
  courseName: (courseId: number) => string | null
}

const timeOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** בונה את סדר היום לכל אחד מהימים (key = dateKey). בכל יום: קודם פריטים עם שעה, לפי השעה. */
export function buildAgenda(days: Date[], src: AgendaSources): Map<string, AgendaItem[]> {
  const map = new Map<string, AgendaItem[]>()
  for (const d of days) map.set(dateKey(d), [])
  const push = (key: string, item: AgendaItem) => map.get(key)?.push(item)

  for (const day of days) {
    const key = dateKey(day)
    for (const s of src.sessions) {
      if (!sessionOccursOn(s, day)) continue
      push(key, {
        key: `session-${s.id}-${key}`,
        kind: 'session',
        title: s.title || 'מפגש',
        courseId: s.course_id,
        courseName: src.courseName(s.course_id),
        time: s.start_time,
        endTime: s.end_time,
        location: s.location,
        sourceId: s.id,
      })
    }
  }

  for (const e of src.exams) {
    const d = new Date(e.date_time)
    push(dateKey(d), {
      key: `exam-${e.id}`,
      kind: 'exam',
      title: 'מבחן',
      courseId: e.course_id,
      courseName: src.courseName(e.course_id),
      time: timeOf(d),
      location: e.location,
      sourceId: e.id,
    })
  }

  for (const a of src.assignments) {
    if (!a.due_date) continue
    push(dateKey(new Date(a.due_date)), {
      key: `assignment-${a.id}`,
      kind: 'assignment',
      title: a.title,
      courseId: a.course_id,
      courseName: src.courseName(a.course_id),
      time: null,
      done: a.is_done,
      mandatory: a.is_mandatory,
      sourceId: a.id,
    })
  }

  for (const l of src.lessons ?? []) {
    if (!l.due_date) continue
    push(dateKey(new Date(l.due_date)), {
      key: `lesson-${l.id}`,
      kind: 'lesson',
      title: l.title,
      courseId: l.course_id,
      courseName: src.courseName(l.course_id),
      time: null,
      done: l.is_done,
      sourceId: l.id,
    })
  }

  for (const r of src.reminders) {
    if (!r.due_date) continue
    const d = new Date(r.due_date)
    push(dateKey(d), {
      key: `reminder-${r.id}`,
      kind: 'reminder',
      title: r.title,
      courseId: null,
      courseName: null,
      time: timeOf(d),
      done: r.is_done,
      sourceId: r.id,
    })
  }

  for (const items of map.values()) {
    items.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time)
      if (a.time) return -1
      if (b.time) return 1
      return 0
    })
  }
  return map
}

// צבע קבוע לכל קורס (לפי ה-id), כדי שאותו קורס ייראה אותו דבר בכל המסכים
const COURSE_COLORS = ['#3C87F7', '#F5A524', '#2FB344', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#6366F1']
export function courseColor(courseId: number | null): string {
  if (courseId == null) return 'var(--color-text-secondary)'
  return COURSE_COLORS[courseId % COURSE_COLORS.length]
}

export function formatWeekRange(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const sameMonth = weekStart.getMonth() === end.getMonth()
  const startText = weekStart.toLocaleDateString('he-IL', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })
  const endText = end.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
  return `${startText}–${endText}`
}
