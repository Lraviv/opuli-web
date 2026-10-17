import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, EmptyState, Pill } from '@/components/ui'
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
    <div className="dd-section" id="planner">
      <div className="dd-section-header">
        <h2>בחירת קורסים לסמסטר</h2>
      </div>
      <Card className="sp">
        <div className="sp__tabs" role="tablist" aria-label="סמסטר">
          {SEMESTER_LETTERS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={semester === s}
              className={`sp__tab${semester === s ? ' sp__tab--active' : ''}`}
              onClick={() => setSemester(s)}
            >
              סמסטר {s} <span className="sp__tab-sub">{SEMESTER_NAMES[s]}</span>
            </button>
          ))}
        </div>

        <div className="sp__body">
          <p className="sp__hint">לפי הקורסים שסיימת או לומדת עכשיו. קורסים שכבר הוספת לתואר לא מופיעים כאן.</p>

          <h3 className="sp__group">
            אפשר לקחת <span className="sp__count">{ready.length}</span>
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

          {missing.length > 0 && (
            <>
              <h3 className="sp__group">
                חסר ידע קודם <span className="sp__count">{missing.length}</span>
              </h3>
              <ShowMore key={`missing-${semester}`}>
                {missing.map((e) => (
                  <PlanRow key={e.course.id} entry={e} onAdd={() => add(e)} busy={select.isPending} />
                ))}
              </ShowMore>
            </>
          )}

          {plan.unknown.length > 0 && (
            <details className="sp__more">
              <summary>
                לא ידוע אם נפתחים בסמסטר הזה <span className="sp__count">{plan.unknown.length}</span>
              </summary>
              {plan.unknown.map((e) => (
                <PlanRow key={e.course.id} entry={e} onAdd={() => add(e)} busy={select.isPending} />
              ))}
            </details>
          )}

          {plan.notOffered > 0 && <p className="sp__hint">{plan.notOffered} קורסים מהקטלוג לא נפתחים בסמסטר {semester}.</p>}
        </div>
      </Card>
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
  return (
    <div className="dd-row sp__row">
      <div>
        <p className="dd-row__title">{course.name}</p>
        <p className="dd-row__meta">
          {course.credits} נ"ז{course.category ? ` · ${course.category}` : ''}
          {entry.status === 'unknown' && course.info?.schedule_label ? ` · ${course.info.schedule_label}` : ''}
        </p>
        {missing.length > 0 && (
          <p className="sp__note sp__note--missing">
            <strong>חסר:</strong> {missing.join(' · ')}
          </p>
        )}
        {toCheck.length > 0 && (
          <p className="sp__note">
            <strong>לבדוק:</strong> {toCheck.join(' · ')}
          </p>
        )}
        {prerequisitesUnlisted && (
          <div className="sp__pill">
            <Pill tone="warning">דורש ידע קודם - כדאי לבדוק בדף הקורס</Pill>
          </div>
        )}
        {course.info?.has_prerequisites === null && entry.status !== 'unknown' && (
          <p className="sp__note">לא ידוע אם דורש ידע קודם</p>
        )}
      </div>
      <Button variant="secondary" disabled={busy} onClick={onAdd}>
        הוספה
      </Button>
    </div>
  )
}
