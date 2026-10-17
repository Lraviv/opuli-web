import { useState } from 'react'
import type { ReactNode } from 'react'
import { Card, EmptyState } from '@/components/ui'
import { isMandatoryCategory } from '@/lib/requirements'
import { planSemester, SEMESTER_LETTERS, SEMESTER_NAMES } from '@/lib/planner'
import type { PlanEntry, SemesterLetter } from '@/lib/planner'
import { useSelectCatalogCourse } from '@/lib/queries'
import type { CatalogCourseRead, CourseRead } from '@/lib/types'
import './SemesterPlanner.css'

const byMandatoryFirst = (a: PlanEntry, b: PlanEntry) =>
  Number(isMandatoryCategory(b.course.category ?? '')) - Number(isMandatoryCategory(a.course.category ?? ''))

/** עוזר בחירת קורסים לסמסטר: מה נפתח בסמסטר שנבחר ומה כבר אפשר לקחת לפי הקורסים שסיימת או לומדת עכשיו. */
export function SemesterPlanner({ degreeId, catalog, courses }: { degreeId: number; catalog: CatalogCourseRead[]; courses: CourseRead[] }) {
  const [semester, setSemester] = useState<SemesterLetter>('א')
  const select = useSelectCatalogCourse(degreeId)
  const plan = planSemester(semester, catalog, courses)
  const ready = [...plan.ready].sort(byMandatoryFirst)
  const missing = [...plan.missing].sort(byMandatoryFirst)

  const add = (entry: PlanEntry) => select.mutate({ id: entry.course.id, payload: { status: 'planned' } })

  return (
    <div className="sp">
      <div className="sp__tabs" role="radiogroup" aria-label="סמסטר">
        {SEMESTER_LETTERS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={semester === s}
            className={`sp__tab${semester === s ? ' sp__tab--active' : ''}`}
            onClick={() => setSemester(s)}
          >
            סמסטר {s} <span className="sp__tab-sub">{SEMESTER_NAMES[s]}</span>
          </button>
        ))}
      </div>
      <p className="sp__hint">קורסים שנפתחים בסמסטר {semester} ושיש לך את הידע הקודם שהם דורשים, לפי מה שסיימת או לומדת עכשיו.</p>

      <Card className="sp__card">
        <h3 className="sp__group">
          אפשר לקחת <span className="sp__count">{ready.length} קורסים</span>
        </h3>
        {ready.length === 0 ? (
          <EmptyState title="אין קורסים פתוחים בשבילך בסמסטר הזה" />
        ) : (
          <ShowMore key={`ready-${semester}`}>
            {ready.map((e) => (
              <PlanRow key={e.course.id} entry={e} onAdd={() => add(e)} busy={select.isPending} />
            ))}
          </ShowMore>
        )}
      </Card>

      {(missing.length > 0 || plan.unknown.length > 0) && (
        <Card className="sp__card sp__card--folded">
          {missing.length > 0 && (
            <details className="sp__more" key={`missing-${semester}`}>
              <summary>
                חסר ידע קודם <span className="sp__count">{missing.length}</span>
              </summary>
              {missing.map((e) => (
                <PlanRow key={e.course.id} entry={e} onAdd={() => add(e)} busy={select.isPending} />
              ))}
            </details>
          )}
          {plan.unknown.length > 0 && (
            <details className="sp__more" key={`unknown-${semester}`}>
              <summary>
                לא ידוע אם נפתחים בסמסטר הזה <span className="sp__count">{plan.unknown.length}</span>
              </summary>
              {plan.unknown.map((e) => (
                <PlanRow key={e.course.id} entry={e} onAdd={() => add(e)} busy={select.isPending} />
              ))}
            </details>
          )}
        </Card>
      )}

      {plan.notOffered > 0 && <p className="sp__hint">{plan.notOffered} קורסים מהקטלוג לא נפתחים בסמסטר {semester}. קורסים שכבר הוספת לא מופיעים כאן.</p>}
    </div>
  )
}

const PREVIEW = 6

/** מציג את השורות הראשונות, ועוד כפתור להצגת כל השאר */
function ShowMore({ children }: { children: ReactNode[] }) {
  const [open, setOpen] = useState(false)
  const shown = open ? children : children.slice(0, PREVIEW)
  return (
    <>
      {shown}
      {children.length > PREVIEW && (
        <button type="button" className="sp__show-more" onClick={() => setOpen(!open)}>
          {open ? 'הצגת פחות' : `הצגת כל ${children.length}`}
        </button>
      )}
    </>
  )
}

function PlanRow({ entry, onAdd, busy }: { entry: PlanEntry; onAdd: () => void; busy: boolean }) {
  const { course, missing, toCheck, prerequisitesUnlisted } = entry
  // שורת אזהרה אחת במקום כמה פסקאות: מה חסר, מה לבדוק, או שלא ידוע
  const warning =
    missing.length > 0
      ? { tone: 'danger', label: 'חסר', text: missing.join(' · ') }
      : toCheck.length > 0
        ? { tone: 'warning', label: 'לבדוק', text: toCheck.join(' · ') }
        : prerequisitesUnlisted
          ? { tone: 'warning', label: 'דורש ידע קודם', text: 'כדאי לבדוק בדף הקורס' }
          : course.info?.has_prerequisites === null && entry.status !== 'unknown'
            ? { tone: 'muted', label: '', text: 'לא ידוע אם דורש ידע קודם' }
            : null
  return (
    <div className="sp-row">
      <div className="sp-row__body">
        <p className="sp-row__title">{course.name}</p>
        <p className="sp-row__meta">
          {course.credits} נ"ז{course.category ? ` · ${course.category}` : ''}
          {entry.status === 'unknown' && course.info?.schedule_label ? ` · ${course.info.schedule_label}` : ''}
        </p>
        {warning && (
          <p className={`sp-row__warn sp-row__warn--${warning.tone}`} title={warning.text}>
            {warning.label && <strong>{warning.label}: </strong>}
            {warning.text}
          </p>
        )}
      </div>
      <button type="button" className="sp-row__add" disabled={busy} onClick={onAdd} aria-label={`הוספת ${course.name} כמתוכנן`} title="הוספה כמתוכנן">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}
