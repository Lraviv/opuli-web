// עזרים קטנים לפריטי קורס (מטלות/שיעורים)

import type { CourseItemRead } from './types'

// מספר אופציונלי משדה טקסט: ריק = null, לא-מספר/מחוץ לטווח = undefined (לא תקין)
export function parseOptionalNumber(value: string, max = 100): number | null | undefined {
  const t = value.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 && n <= max ? n : undefined
}

/** האם מועד ההגשה כבר עבר (לפי היום, לא לפי השעה - הגשה "היום" עוד לא באיחור) */
export function isOverdue(item: Pick<CourseItemRead, 'due_date' | 'is_done'>): boolean {
  if (!item.due_date || item.is_done) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(item.due_date).getTime() < today.getTime()
}
