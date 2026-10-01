// לוגיקת דרישות התואר - חישוב נ"ז לכל קטגוריה והצעה מהקטלוג. זהה באפליקציה (opu-li/src/lib/requirements.ts).

import type { CatalogCourseRead, CourseRead } from './types'

export interface RowStats {
  done: number
  current: number
  planned: number
  /** קורסי חובה בקטלוג שעוד לא נבחרו */
  unselectedMandatory: number
}

export const isMandatoryCategory = (category: string) => category.trim().startsWith('חובה')

export function statsFor(category: string, courses: CourseRead[], catalog: CatalogCourseRead[]): RowStats {
  const inCat = courses.filter((c) => (c.category ?? '').trim() === category)
  const sum = (status: CourseRead['status']) => inCat.filter((c) => c.status === status).reduce((s, c) => s + c.credits, 0)
  const unselectedMandatory = isMandatoryCategory(category)
    ? catalog.filter((c) => (c.category ?? '').trim() === category && !c.already_selected).length
    : 0
  return { done: sum('done'), current: sum('current'), planned: sum('planned'), unselectedMandatory }
}

/** קטגוריות הקטלוג לפי סדר הופעה, עם דרישה מוצעת: בקטגוריית חובה - סכום נ"ז הקורסים בה; בשאר - ריק. */
export function suggestFromCatalog(catalog: CatalogCourseRead[]): { category: string; min_credits: number | null }[] {
  const order: string[] = []
  const sums = new Map<string, number>()
  for (const c of catalog) {
    const cat = (c.category ?? '').trim()
    if (!cat) continue
    if (!sums.has(cat)) order.push(cat)
    sums.set(cat, (sums.get(cat) ?? 0) + c.credits)
  }
  return order.map((category) => ({ category, min_credits: isMandatoryCategory(category) ? sums.get(category)! : null }))
}
