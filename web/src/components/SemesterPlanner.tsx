import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, IconButton } from '@/components/ui'
import { formatGrade } from '@/lib/grades'
import { isMandatoryCategory } from '@/lib/requirements'
import { planSemester } from '@/lib/planner'
import type { PlanEntry, SemesterLetter } from '@/lib/planner'
import { parseSemester, semesterName, semesterToAdd } from '@/lib/semesters'
import { useCreateSemester, useDeleteSemester, useMoveCourseToSemester, useSelectCatalogCourse, useSemesters } from '@/lib/queries'
import type { CatalogCourseRead, CourseRead, SemesterRead } from '@/lib/types'
import './SemesterPlanner.css'

const byMandatoryFirst = (a: PlanEntry, b: PlanEntry) =>
  Number(isMandatoryCategory(b.course.category ?? '')) - Number(isMandatoryCategory(a.course.category ?? ''))

/** "לא משובץ" - קורסים מתוכננים בלי סמסטר (למשל שנוספו מהקטלוג) */
const UNASSIGNED = 'unassigned'

/** מסך התכנון של התואר: סמסטרים בשיטת האו"פ (2027א / 2027ב / 2027ג), הקורסים שכבר שובצו בכל אחד,
 * ומתחתם מה אפשר לקחת באותו סמסטר. "+" מוסיף את הקורס כמתוכנן ומשבץ אותו ישר בסמסטר שנבחר. */
export function SemesterPlanner({ degreeId, catalog, courses }: { degreeId: number; catalog: CatalogCourseRead[]; courses: CourseRead[] }) {
  const { data: semesters, isLoading } = useSemesters(degreeId)
  const createSemester = useCreateSemester(degreeId)
  const deleteSemester = useDeleteSemester(degreeId)
  const moveCourse = useMoveCourseToSemester()
  const select = useSelectCatalogCourse(degreeId)
  const [selected, setSelected] = useState<number | typeof UNASSIGNED | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  const list = semesters ?? []
  const planned = courses.filter((c) => c.status === 'planned')
  const inSemester = (id: number) => planned.filter((c) => c.semester_id === id)
  const unassigned = planned.filter((c) => !c.semester_id || !list.some((s) => s.id === c.semester_id))
  const toAdd = semesterName(semesterToAdd(list.map((s) => s.name), new Date()))

  // ברירת מחדל: הסמסטר הראשון בתכנון
  const current = selected === UNASSIGNED ? (unassigned.length ? UNASSIGNED : null) : list.find((s) => s.id === selected) ?? null
  const active = current ?? list[0] ?? (unassigned.length ? UNASSIGNED : null)

  // ההודעה "נוסף ל..." נעלמת אחרי כמה שניות
  useEffect(() => {
    if (!added) return
    const t = setTimeout(() => setAdded(null), 4000)
    return () => clearTimeout(t)
  }, [added])

  async function addSemester() {
    const sem = await createSemester.mutateAsync({ name: toAdd })
    setSelected(sem.id)
  }

  function removeSemester(sem: SemesterRead) {
    if (!confirm(`למחוק את ${sem.name} מהתכנון? הקורסים שבו יעברו ל"לא משובץ".`)) return
    deleteSemester.mutate(sem.id)
    setSelected(null)
  }

  if (isLoading) return null

  if (!active) {
    return (
      <Card className="sp__card">
        <EmptyState title="עוד אין סמסטרים בתכנון" subtitle={`מוסיפים סמסטר, ורואים אילו קורסים נפתחים בו ומה כבר אפשר לקחת.`} />
        <div className="sp__empty-actions">
          <button type="button" className="ui-button ui-button--primary" disabled={createSemester.isPending} onClick={addSemester}>
            + תכנון {toAdd}
          </button>
        </div>
      </Card>
    )
  }

  const activeSemester = active === UNASSIGNED ? null : active
  const scheduled = activeSemester ? inSemester(activeSemester.id) : unassigned
  const credits = scheduled.reduce((sum, c) => sum + c.credits, 0)
  const letter = activeSemester ? parseSemester(activeSemester.name)?.letter ?? null : null
  const targets = [...list.filter((s) => s.id !== activeSemester?.id).map((s) => ({ id: s.id as number | null, name: s.name })), ...(activeSemester ? [{ id: null, name: 'לא משובץ' }] : [])]

  async function add(entry: PlanEntry) {
    if (!activeSemester) return
    await select.mutateAsync({ id: entry.course.id, payload: { status: 'planned', semester_id: activeSemester.id } })
    setAdded(`${entry.course.name} נוסף ל־${activeSemester.name}`)
  }

  return (
    <div className="sp">
      <div className="sp__tabs" role="radiogroup" aria-label="סמסטר">
        {list.map((s) => {
          const load = inSemester(s.id).reduce((sum, c) => sum + c.credits, 0)
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={activeSemester?.id === s.id}
              className={`sp__tab${activeSemester?.id === s.id ? ' sp__tab--active' : ''}`}
              onClick={() => setSelected(s.id)}
            >
              {s.name} <span className="sp__tab-sub">{formatGrade(load)} נ"ז</span>
            </button>
          )
        })}
        {unassigned.length > 0 && (
          <button
            type="button"
            role="radio"
            aria-checked={active === UNASSIGNED}
            className={`sp__tab${active === UNASSIGNED ? ' sp__tab--active' : ''}`}
            onClick={() => setSelected(UNASSIGNED)}
          >
            לא משובץ <span className="sp__tab-sub">{unassigned.length}</span>
          </button>
        )}
        <button type="button" className="sp__tab sp__tab--add" disabled={createSemester.isPending} onClick={addSemester}>
          + {toAdd}
        </button>
      </div>

      <Card className="sp__card">
        <div className="sp__group">
          <h3>{activeSemester ? `בתכנון ל־${activeSemester.name}` : 'לא משובץ'}</h3>
          <span className="sp__count">
            {scheduled.length === 1 ? 'קורס אחד' : `${scheduled.length} קורסים`} · {formatGrade(credits)} נ"ז
          </span>
          {activeSemester && <IconButton icon="delete" tone="danger" label={`מחיקת ${activeSemester.name} מהתכנון`} onClick={() => removeSemester(activeSemester)} />}
        </div>
        {scheduled.length === 0 ? (
          <p className="sp__hint sp__hint--inside">עוד אין קורסים בסמסטר הזה. מוסיפים מהרשימה למטה.</p>
        ) : (
          <ul className="sp__scheduled">
            {scheduled.map((c) => (
              <li key={c.id} className="sp-row">
                <div className="sp-row__body">
                  <Link to={`/courses/${c.id}`} className="sp-row__title sp-row__link">
                    {c.name}
                  </Link>
                  <p className="sp-row__meta">
                    {c.course_code ? `${c.course_code} · ` : ''}
                    {c.credits} נ"ז{c.category ? ` · ${c.category}` : ''}
                  </p>
                </div>
                {targets.length > 0 && (
                  <select
                    className="sp-row__move"
                    aria-label={`העברת ${c.name}`}
                    value=""
                    onChange={(e) => moveCourse.mutate({ courseId: c.id, semesterId: e.target.value === 'none' ? null : Number(e.target.value) })}
                  >
                    <option value="" disabled hidden>
                      העברה ל…
                    </option>
                    {targets.map((t) => (
                      <option key={t.id ?? 'none'} value={t.id ?? 'none'}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="sp__added" role="status" aria-live="polite">
        {added}
      </p>

      {activeSemester ? (
        <Suggestions key={activeSemester.id} semesterName={activeSemester.name} letter={letter} catalog={catalog} courses={courses} onAdd={add} busy={select.isPending} />
      ) : (
        <p className="sp__hint">קורסים שנוספו מהקטלוג בלי סמסטר. בוחרים לכל אחד לאיזה סמסטר להעביר אותו.</p>
      )}
    </div>
  )
}

/** מה אפשר לקחת בסמסטר: מה שנפתח בו ושיש לך את הידע הקודם אליו */
function Suggestions({
  semesterName,
  letter,
  catalog,
  courses,
  onAdd,
  busy,
}: {
  semesterName: string
  letter: SemesterLetter | null
  catalog: CatalogCourseRead[]
  courses: CourseRead[]
  onAdd: (entry: PlanEntry) => void
  busy: boolean
}) {
  const plan = planSemester(letter, catalog, courses)
  const ready = [...plan.ready].sort(byMandatoryFirst)
  const missing = [...plan.missing].sort(byMandatoryFirst)

  return (
    <>
      <Card className="sp__card">
        <div className="sp__group">
          <h3>אפשר לקחת ב־{semesterName}</h3>
          <span className="sp__count">{ready.length} קורסים</span>
        </div>
        <p className="sp__hint sp__hint--inside">
          {letter ? `קורסים שנפתחים בסמסטר ${letter}` : 'קורסים מהקטלוג'} ושיש לך את הידע הקודם שהם דורשים, לפי מה שסיימת או לומדת עכשיו.
        </p>
        {ready.length === 0 ? (
          <EmptyState title="אין קורסים פתוחים בשבילך בסמסטר הזה" />
        ) : (
          <ShowMore>
            {ready.map((e) => (
              <PlanRow key={e.course.id} entry={e} semesterName={semesterName} onAdd={() => onAdd(e)} busy={busy} />
            ))}
          </ShowMore>
        )}
      </Card>

      {(missing.length > 0 || plan.unknown.length > 0) && (
        <Card className="sp__card sp__card--folded">
          {missing.length > 0 && (
            <details className="sp__more">
              <summary>
                חסר ידע קודם <span className="sp__count">{missing.length}</span>
              </summary>
              {missing.map((e) => (
                <PlanRow key={e.course.id} entry={e} semesterName={semesterName} onAdd={() => onAdd(e)} busy={busy} />
              ))}
            </details>
          )}
          {plan.unknown.length > 0 && (
            <details className="sp__more">
              <summary>
                לא ידוע אם נפתחים בסמסטר הזה <span className="sp__count">{plan.unknown.length}</span>
              </summary>
              {plan.unknown.map((e) => (
                <PlanRow key={e.course.id} entry={e} semesterName={semesterName} onAdd={() => onAdd(e)} busy={busy} />
              ))}
            </details>
          )}
        </Card>
      )}

      {letter && plan.notOffered > 0 && (
        <p className="sp__hint">
          {plan.notOffered} קורסים מהקטלוג לא נפתחים בסמסטר {letter}. קורסים שכבר הוספת לא מופיעים כאן.
        </p>
      )}
    </>
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

function PlanRow({ entry, semesterName, onAdd, busy }: { entry: PlanEntry; semesterName: string; onAdd: () => void; busy: boolean }) {
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
          {course.course_code ? `${course.course_code} · ` : ''}{course.credits} נ"ז{course.category ? ` · ${course.category}` : ''}
          {entry.status === 'unknown' && course.info?.schedule_label ? ` · ${course.info.schedule_label}` : ''}
        </p>
        {warning && (
          <p className={`sp-row__warn sp-row__warn--${warning.tone}`} title={warning.text}>
            {warning.label && <strong>{warning.label}: </strong>}
            {warning.text}
          </p>
        )}
      </div>
      <button type="button" className="sp-row__add" disabled={busy} onClick={onAdd} aria-label={`הוספת ${course.name} ל־${semesterName}`} title={`הוספה ל־${semesterName}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}
