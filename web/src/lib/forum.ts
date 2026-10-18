// עזרים לעמוד הקהילה (פורום): סוגי פוסטים ותאריכי אירועים
import type { ForumCategory } from './types'

export const FORUM_CATEGORIES: { id: ForumCategory; label: string; filterLabel: string }[] = [
  { id: 'tip', label: 'עצה', filterLabel: 'עצות' },
  { id: 'question', label: 'שאלה', filterLabel: 'שאלות' },
  { id: 'study', label: 'מפגש לימוד', filterLabel: 'מפגשי לימוד' },
  { id: 'party', label: 'מסיבה ואירוע', filterLabel: 'מסיבות ואירועים' },
  { id: 'community', label: 'קהילה', filterLabel: 'קהילה' },
]

export const CATEGORY_LABEL: Record<ForumCategory, string> = Object.fromEntries(
  FORUM_CATEGORIES.map((c) => [c.id, c.label]),
) as Record<ForumCategory, string>

export function isEventCategory(c: ForumCategory): boolean {
  return c === 'study' || c === 'party'
}

export const MAX_TITLE = 120
export const MAX_BODY = 4000

/** יום וחודש לקופסת התאריך: { day: "23", month: "אוק׳" } */
export function eventDayParts(iso: string): { day: string; month: string } {
  const d = new Date(iso)
  const month = d.toLocaleDateString('he-IL', { month: 'short' }).replace(/\.$/, '׳')
  return { day: String(d.getDate()), month }
}

const pad = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "יום ה׳ · 19:00 עד 21:00" (שעון מקומי). סיום ביום אחר מקבל גם תאריך. */
export function formatEventWhen(startsIso: string, endsIso: string | null): string {
  const s = new Date(startsIso)
  const weekday = s.toLocaleDateString('he-IL', { weekday: 'short' })
  let out = `${weekday} · ${hm(s)}`
  if (endsIso) {
    const e = new Date(endsIso)
    const sameDay = e.toDateString() === s.toDateString()
    out += sameDay ? ` עד ${hm(e)}` : ` עד ${e.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })} ${hm(e)}`
  }
  return out
}

export function isEventOver(startsIso: string, endsIso: string | null, now = Date.now()): boolean {
  return new Date(endsIso ?? startsIso).getTime() < now
}

/** "2026-10-23" + "19:00" (שעון מקומי) -> ISO ב-UTC לשרת */
export function localToIso(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString()
}

/** כל המיילים של המגיעים, מוכנים להדבקה בשדה "אל" */
export function emailList(attendees: { email: string }[]): string {
  return attendees.map((a) => a.email).join(', ')
}
