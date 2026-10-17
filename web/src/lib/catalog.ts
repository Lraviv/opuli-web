// סינון וקיבוץ של קטלוג התואר - פונקציות טהורות (בלי React), נבדקות ב-npm test.
import type { CatalogCourseRead, CourseRead } from './types'

export type CatalogState = 'all' | 'unselected' | 'selected'

export interface CatalogFilter {
  query: string
  category: string | null
  state: CatalogState
  /** אות סמסטר (א / ב / ג) - רק קורסים שנפתחים בו */
  semester: string | null
  /** רק קורסים שידוע שאין להם דרישות קדם */
  noPrerequisites: boolean
}

export const EMPTY_FILTER: CatalogFilter = { query: '', category: null, state: 'all', semester: null, noPrerequisites: false }

/** כותרת הקבוצה לקורסים בלי קטגוריה */
export const NO_CATEGORY = 'בלי קטגוריה'

export const categoryOf = (c: { category: string | null }) => c.category?.trim() || NO_CATEGORY

export function isFiltered(f: CatalogFilter): boolean {
  return f.query.trim() !== '' || f.category != null || f.state !== 'all' || f.semester != null || f.noPrerequisites
}

export function matchesFilter(c: CatalogCourseRead, f: CatalogFilter): boolean {
  const q = f.query.trim().toLowerCase()
  if (q && !(c.name.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q) || c.info?.subjects.some((s) => s.toLowerCase().includes(q)))) {
    return false
  }
  if (f.category != null && categoryOf(c) !== f.category) return false
  if (f.state === 'selected' && !c.already_selected) return false
  if (f.state === 'unselected' && c.already_selected) return false
  if (f.semester != null && !c.info?.semesters.includes(f.semester)) return false
  if (f.noPrerequisites && c.info?.has_prerequisites !== false) return false
  return true
}

/** הקטגוריות לפי סדר ההופעה הראשונה בקטלוג (כך הן מסודרות בתבנית) */
export function catalogCategories(catalog: CatalogCourseRead[]): string[] {
  return [...new Set(catalog.map(categoryOf))]
}

/** אותיות הסמסטרים שמופיעות בקטלוג, בסדר א-ב-ג */
export function catalogSemesters(catalog: CatalogCourseRead[]): string[] {
  return [...new Set(catalog.flatMap((c) => c.info?.semesters ?? []))].sort((a, b) => a.localeCompare(b, 'he'))
}

export interface CatalogGroup {
  category: string
  courses: CatalogCourseRead[]
  /** כמה מכל הקורסים בקטגוריה (לא רק המסוננים) כבר נבחרו */
  selected: number
  total: number
}

export function groupCatalog(catalog: CatalogCourseRead[], f: CatalogFilter): CatalogGroup[] {
  return catalogCategories(catalog)
    .map((category) => {
      const all = catalog.filter((c) => categoryOf(c) === category)
      return {
        category,
        courses: all.filter((c) => matchesFilter(c, f)),
        selected: all.filter((c) => c.already_selected).length,
        total: all.length,
      }
    })
    .filter((g) => g.courses.length > 0)
}

/** בטלפון קבוצה פתוחה מראש רק אם היא חובה ויש בה קורסים שעוד לא נבחרו */
export function openByDefault(g: CatalogGroup): boolean {
  return g.category.startsWith('חובה') && g.selected < g.total
}

/** הקורס האישי שנוצר מקורס הקטלוג (האחרון, אם בחרו אותו יותר מפעם אחת) */
export function selectedCourse(catalogId: number, courses: CourseRead[]): CourseRead | undefined {
  return courses.filter((c) => c.catalog_course_id === catalogId).at(-1)
}
