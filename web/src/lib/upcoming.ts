// "מה מחכה לי": רשימה אחת של מטלות, מבחנים, תזכורות ומפגשים, מסודרת לפי זמן
// ומחולקת לקבוצות (באיחור / היום / השבוע / בהמשך / בלי תאריך).
// פונקציות טהורות, לפי שעון מקומי - משמשות את עמוד הבית ואת סקירת הקורס.

import { addDays, dateKey, examTitle, sessionOccursOn } from './schedule.ts'
import type { ClassSessionRead } from './types'

export type UpcomingKind = 'assignment' | 'exam' | 'reminder' | 'session'
export type Horizon = 'overdue' | 'today' | 'week' | 'later' | 'undated'

export interface UpcomingEntry {
  key: string
  kind: UpcomingKind
  title: string
  courseId: number | null
  /** null = תזכורת בלי תאריך */
  date: Date | null
  /** יש שעה להציג (מבחן, תזכורת, מפגש). למטלה מציגים רק תאריך */
  hasTime: boolean
  location: string | null
  /** משקל המטלה ב-%, כשיש */
  weight: number | null
  sourceId: number
  horizon: Horizon
}

export const HORIZON_ORDER: Horizon[] = ['overdue', 'today', 'week', 'later', 'undated']

export const HORIZON_LABEL: Record<Horizon, string> = {
  overdue: 'באיחור',
  today: 'היום',
  week: 'בשבוע הקרוב',
  later: 'בהמשך',
  undated: 'בלי תאריך',
}

export const UPCOMING_KIND_LABEL: Record<UpcomingKind, string> = {
  assignment: 'מטלה',
  exam: 'מבחן',
  reminder: 'תזכורת',
  session: 'מפגש',
}

/** היום = אותו יום בלוח השנה; השבוע = שבעת הימים הבאים; באיחור = לפני תחילת היום */
export function horizonOf(date: Date | null, now: Date): Horizon {
  if (!date) return 'undated'
  const todayStart = addDays(now, 0)
  if (date < todayStart) return 'overdue'
  if (dateKey(date) === dateKey(now)) return 'today'
  if (date < addDays(now, 8)) return 'week'
  return 'later'
}

export interface UpcomingSources {
  assignments: { id: number; course_id: number; title: string; due_date: string | null; is_done: boolean; weight_percent?: number | null }[]
  exams: { id: number; course_id: number; date_time: string; location: string | null; term?: string | null }[]
  reminders?: { id: number; title: string; due_date: string | null; is_done: boolean }[]
  sessions?: Pick<ClassSessionRead, 'id' | 'course_id' | 'weekday' | 'interval_weeks' | 'start_date' | 'end_date' | 'start_time' | 'title' | 'location'>[]
}

/** כמה ימים קדימה מחפשים את המפגש הבא של כל מפגש קבוע */
const SESSION_LOOKAHEAD_DAYS = 35

function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = addDays(day, 0)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/**
 * כל מה שפתוח: מטלות שלא הוגשו (כולל באיחור), מבחנים מהיום והלאה, תזכורות פתוחות,
 * והמופע הבא של כל מפגש קבוע. ממוין לפי זמן; פריטים בלי תאריך בסוף.
 */
export function collectUpcoming(src: UpcomingSources, now: Date): UpcomingEntry[] {
  const out: Omit<UpcomingEntry, 'horizon'>[] = []
  const todayStart = addDays(now, 0)

  for (const a of src.assignments) {
    if (a.is_done || !a.due_date) continue
    out.push({ key: `assignment-${a.id}`, kind: 'assignment', title: a.title, courseId: a.course_id, date: new Date(a.due_date), hasTime: false, location: null, weight: a.weight_percent ?? null, sourceId: a.id })
  }
  for (const e of src.exams) {
    const d = new Date(e.date_time)
    // מבחן של היום נשאר עד סוף היום, גם אחרי שעת ההתחלה
    if (d < todayStart) continue
    out.push({ key: `exam-${e.id}`, kind: 'exam', title: examTitle(e.term), courseId: e.course_id, date: d, hasTime: true, location: e.location, weight: null, sourceId: e.id })
  }
  for (const r of src.reminders ?? []) {
    if (r.is_done) continue
    out.push({ key: `reminder-${r.id}`, kind: 'reminder', title: r.title, courseId: null, date: r.due_date ? new Date(r.due_date) : null, hasTime: !!r.due_date, location: null, weight: null, sourceId: r.id })
  }
  for (const s of src.sessions ?? []) {
    for (let i = 0; i < SESSION_LOOKAHEAD_DAYS; i++) {
      const day = addDays(now, i)
      if (!sessionOccursOn(s, day)) continue
      const start = atTime(day, s.start_time)
      // מפגש של היום שכבר התחיל לפני יותר משעתיים - מדלגים למופע הבא
      if (start.getTime() < now.getTime() - 2 * 60 * 60 * 1000) continue
      out.push({ key: `session-${s.id}-${dateKey(day)}`, kind: 'session', title: s.title || 'מפגש', courseId: s.course_id, date: start, hasTime: true, location: s.location, weight: null, sourceId: s.id })
      break
    }
  }

  out.sort((a, b) => {
    if (!a.date || !b.date) return a.date ? -1 : b.date ? 1 : 0
    return a.date.getTime() - b.date.getTime()
  })
  return out.map((e) => ({ ...e, horizon: horizonOf(e.date, now) }))
}

/** קבוצות לפי HORIZON_ORDER, בלי קבוצות ריקות */
export function groupByHorizon(entries: UpcomingEntry[]): { horizon: Horizon; entries: UpcomingEntry[] }[] {
  return HORIZON_ORDER.map((horizon) => ({ horizon, entries: entries.filter((e) => e.horizon === horizon) })).filter((g) => g.entries.length > 0)
}

/** כמה ימים מהיום (לפי לוח השנה) עד date: 0 = היום, 1 = מחר */
export function daysUntil(date: Date, now: Date): number {
  return Math.round((addDays(date, 0).getTime() - addDays(now, 0).getTime()) / 86400000)
}

/** "היום" / "מחר" / "עוד 4 ימים" / "לפני 2 ימים" */
export function relativeDays(date: Date, now: Date): string {
  const n = daysUntil(date, now)
  if (n === 0) return 'היום'
  if (n === 1) return 'מחר'
  if (n === -1) return 'אתמול'
  return n > 0 ? `עוד ${n} ימים` : `לפני ${-n} ימים`
}

// [יחיד, רבים, נקבה?] - בשביל ההתאמה של "מחכה / מחכות / מחכים"
const COUNT_WORDS: Record<'assignment' | 'exam' | 'reminder', [string, string, boolean]> = {
  assignment: ['מטלה אחת', 'מטלות', true],
  exam: ['מבחן אחד', 'מבחנים', false],
  reminder: ['תזכורת אחת', 'תזכורות', true],
}

/** שורת הסיכום בעמוד הבית: מה מחכה בשבעת הימים הקרובים (כולל מה שבאיחור), בלי מפגשים קבועים */
export function weekSummary(entries: UpcomingEntry[]): string {
  const soon = entries.filter((e) => e.kind !== 'session' && (e.horizon === 'overdue' || e.horizon === 'today' || e.horizon === 'week'))
  const counted = (['assignment', 'exam', 'reminder'] as const)
    .map((kind) => ({ kind, n: soon.filter((e) => e.kind === kind).length }))
    .filter((c) => c.n > 0)
  if (counted.length === 0) return 'השבוע הקרוב פנוי, אין מטלות או מבחנים קרובים'
  const parts = counted.map(({ kind, n }) => (n === 1 ? COUNT_WORDS[kind][0] : `${n} ${COUNT_WORDS[kind][1]}`))
  const last = parts[parts.length - 1]
  // "ו-2 תזכורות" עם מקף לפני ספרה, "ומבחן אחד" בלי
  const list = parts.length === 1 ? last : `${parts.slice(0, -1).join(', ')} ו${/^\d/.test(last) ? '-' : ''}${last}`
  const feminine = counted.every((c) => COUNT_WORDS[c.kind][2])
  const verb = counted.length === 1 && counted[0].n === 1 ? 'מחכה' : feminine ? 'מחכות' : 'מחכים'
  const overdue = soon.filter((e) => e.horizon === 'overdue').length
  return `בשבוע הקרוב ${verb} לך ${list}${overdue ? ` (${overdue} באיחור)` : ''}`
}
