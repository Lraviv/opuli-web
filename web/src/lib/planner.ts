// עוזר בחירת קורסים לסמסטר: אילו קורסים מהקטלוג נפתחים בסמסטר שנבחר והאם יש את הידע הקודם שהם דורשים.
// מבוסס על info של כל קורס (מתי נפתח + ידע קודם מדף הקורס באו"פ, ראו backend/app/ou_course_info.py).

import type { CatalogCourseRead, CourseRead } from './types'

export type SemesterLetter = 'א' | 'ב' | 'ג'
export const SEMESTER_LETTERS: SemesterLetter[] = ['א', 'ב', 'ג']
export const SEMESTER_NAMES: Record<SemesterLetter, string> = { א: 'סתיו', ב: 'אביב', ג: 'קיץ' }

export type PlanStatus =
  /** נפתח בסמסטר ואין ידע קודם חסר */
  | 'ready'
  /** נפתח בסמסטר אבל חסר ידע קודם */
  | 'missing'
  /** לא ידוע אם נפתח בסמסטר (אין לו דפוס קבוע או שאין מידע) */
  | 'unknown'

export interface PlanEntry {
  course: CatalogCourseRead
  status: PlanStatus
  /** פריטי "ידע קודם דרוש" שלא מצאנו בקורסים שסיימת או שאת לומדת עכשיו */
  missing: string[]
  /** פריטים כלליים שאי אפשר לבדוק אוטומטית (למשל "שני קורסים במתמטיקה") */
  toCheck: string[]
  /** הקורס מסומן "דורש ידע קודם" אבל לא ידוע מה בדיוק */
  prerequisitesUnlisted: boolean
}

export interface SemesterPlan {
  ready: PlanEntry[]
  missing: PlanEntry[]
  unknown: PlanEntry[]
  /** קורסים שלא נפתחים בסמסטר הזה */
  notOffered: number
}

const CODE_RE = /\d{5}/g

/** מנרמל שם קורס להשוואה: בלי סוגריים, מספרי קורס, "הקורס" ופיסוק */
export function normalizeName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\d{5}/g, ' ')
    .replace(/^\s*(צמד הקורסים|הקורסים|הקורס)\s+/, '')
    .replace(/[.,:;"'״׳\-–]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

interface Taken {
  names: string[]
  codes: Set<string>
}

function partSatisfied(part: string, taken: Taken): boolean {
  const codes = part.match(CODE_RE) ?? []
  if (codes.some((code) => taken.codes.has(code))) return true
  const name = normalizeName(part)
  if (name.length < 3) return false
  // השוואה במילים שלמות, כדי ש"אלגוריתמים" לא יתאים ל"מבוא לאלגוריתמים"; כל צד יכול להכיל את השני
  // ("מבוא לאלגוריתמים" מתקיים ב"מבני נתונים ומבוא לאלגוריתמים", גם אחרי ו' החיבור)
  const contains = (whole: string, part: string) => ` ${whole} `.includes(` ${part} `) || ` ${whole} `.includes(` ו${part} `)
  return taken.names.some((n) => contains(name, n) || contains(n, name))
}

/** פריט כמו "X או Y" מתקיים אם אחת החלופות מתקיימת; חלופה "X + Y" דורשת את כולם */
function itemSatisfied(item: string, taken: Taken): boolean {
  return item.split(/\s+או\s+/).some((alt) =>
    alt
      .split(/\s*\+\s*/)
      .filter((p) => p.trim())
      .every((p) => partSatisfied(p, taken)),
  )
}

function takenFrom(courses: { name: string; course_code?: string | null }[]): Taken {
  return {
    names: courses.map((c) => normalizeName(c.name)).filter(Boolean),
    codes: new Set(courses.map((c) => c.course_code).filter((c): c is string => !!c)),
  }
}

function catalogCode(c: CatalogCourseRead): string | null {
  return c.notes?.match(CODE_RE)?.[0] ?? null
}

export function planSemester(semester: SemesterLetter, catalog: CatalogCourseRead[], myCourses: CourseRead[]): SemesterPlan {
  // מה שסיימת או לומדת עכשיו ייחשב כידע קודם לסמסטר הבא
  const taken = takenFrom(myCourses.filter((c) => c.status === 'done' || c.status === 'current'))
  const known = takenFrom([...myCourses, ...catalog.map((c) => ({ name: c.name, course_code: catalogCode(c) }))])

  const plan: SemesterPlan = { ready: [], missing: [], unknown: [], notOffered: 0 }
  for (const course of catalog) {
    if (course.already_selected) continue
    const info = course.info
    if (info?.every_year && !info.semesters.includes(semester)) {
      plan.notOffered++
      continue
    }
    const missing: string[] = []
    const toCheck: string[] = []
    for (const item of info?.required_knowledge ?? []) {
      if (itemSatisfied(item, taken)) continue
      // פריט שאף חלק ממנו לא מוכר כשם קורס הוא דרישה כללית (למשל "שני קורסים במתמטיקה")
      const isCourse = item.split(/\s+או\s+|\s*\+\s*/).some((p) => partSatisfied(p, known))
      ;(isCourse ? missing : toCheck).push(item)
    }
    const entry: PlanEntry = {
      course,
      status: !info?.every_year ? 'unknown' : missing.length > 0 ? 'missing' : 'ready',
      missing,
      toCheck,
      prerequisitesUnlisted: info?.has_prerequisites === true && info.required_knowledge.length === 0,
    }
    plan[entry.status].push(entry)
  }
  return plan
}
