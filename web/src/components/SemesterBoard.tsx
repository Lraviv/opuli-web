import { useState } from 'react'
import type { DragEvent, FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, IconButton } from '@/components/ui'
import { useCourses, useCreateSemester, useDeleteSemester, useMoveCourseToSemester, useSemesters, useUpdateSemester } from '@/lib/queries'
import type { CourseRead, SemesterRead } from '@/lib/types'
import './SemesterBoard.css'

const DRAG_TYPE = 'application/x-opuli-course'

/** לוח תכנון סמסטרים לתואר נתון - מוצג בטאב "תכנון" של מסך הקורסים (ראו
 * mobile/src/components/semester-plan-board.tsx). כל סמסטר הוא מקטע ברוחב מלא;
 * מעבירים קורס בגרירה למקטע אחר, או דרך תפריט "העבר ל…" (מקלדת/מובייל).
 * קורס בלי שיבוץ מופיע תמיד ב"לא משובץ", גם כשעוד אין סמסטרים. */
export function SemesterBoard({ degreeId, search = '' }: { degreeId: number; search?: string }) {
  const { data: semesters } = useSemesters(degreeId)
  const { data: courses } = useCourses({ degree_id: degreeId })
  const moveCourse = useMoveCourseToSemester()
  const updateSemester = useUpdateSemester(degreeId)
  const deleteSemester = useDeleteSemester(degreeId)

  const query = search.trim().toLowerCase()
  const matches = (...fields: (string | null)[]) => !query || fields.some((f) => f?.toLowerCase().includes(query))
  const semesterList = semesters ?? []
  const planned = (courses ?? []).filter((c) => c.status === 'planned' && matches(c.name, c.category))
  const unassigned = planned.filter((c) => !c.semester_id || !semesterList.some((s) => s.id === c.semester_id))

  if (query && planned.length === 0) return <EmptyState title="לא נמצאו קורסים תואמים בתכנון" />

  const move = (courseId: number, semesterId: number | null) => moveCourse.mutate({ courseId, semesterId })

  // הזזת סמסטר מקום אחד למעלה/למטה: כותבים מחדש sort_order רציף לכולם (ייתכנו
  // כפילויות ישנות), ושולחים עדכון רק לסמסטרים שהמיקום שלהם השתנה
  const reorder = (index: number, delta: -1 | 1) => {
    const target = index + delta
    if (target < 0 || target >= semesterList.length) return
    const next = [...semesterList]
    ;[next[index], next[target]] = [next[target], next[index]]
    next.forEach((sem, i) => {
      if (sem.sort_order !== i + 1) updateSemester.mutate({ id: sem.id, payload: { sort_order: i + 1 } })
    })
  }

  const remove = (sem: SemesterRead) => {
    if (!confirm(`למחוק את "${sem.name}"? הקורסים שבו יחזרו ל"לא משובץ".`)) return
    deleteSemester.mutate(sem.id)
  }

  return (
    <div className="sb-board">
      <Section title="לא משובץ" semesterId={null} courses={unassigned} semesters={semesterList} onMove={move} />
      {semesterList.map((sem, i) => (
        <Section
          key={sem.id}
          title={sem.name}
          semesterId={sem.id}
          courses={planned.filter((c) => c.semester_id === sem.id)}
          semesters={semesterList}
          onMove={move}
          actions={
            <span className="sb-section__actions">
              <IconButton icon="up" label={`הזזת ${sem.name} למעלה`} disabled={i === 0} onClick={() => reorder(i, -1)} />
              <IconButton
                icon="down"
                label={`הזזת ${sem.name} למטה`}
                disabled={i === semesterList.length - 1}
                onClick={() => reorder(i, 1)}
              />
              <IconButton icon="delete" tone="danger" label={`מחיקת ${sem.name}`} onClick={() => remove(sem)} />
            </span>
          }
        />
      ))}
    </div>
  )
}

function Section({
  title,
  semesterId,
  courses,
  semesters,
  onMove,
  actions,
}: {
  title: string
  semesterId: number | null
  courses: CourseRead[]
  semesters: SemesterRead[]
  onMove: (courseId: number, semesterId: number | null) => void
  actions?: ReactNode
}) {
  const [dragOver, setDragOver] = useState(false)
  const credits = courses.reduce((sum, c) => sum + c.credits, 0)
  const isInbox = semesterId === null

  function handleDragOver(e: DragEvent) {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const [courseId, fromId] = e.dataTransfer.getData(DRAG_TYPE).split(':')
    if (fromId !== String(semesterId)) onMove(Number(courseId), semesterId)
  }

  // יעדים ל"העבר ל…" - כל המקטעים חוץ מהנוכחי
  const targets: { id: number | null; name: string }[] = [
    ...(isInbox ? [] : [{ id: null, name: 'לא משובץ' }]),
    ...semesters.filter((s) => s.id !== semesterId).map((s) => ({ id: s.id, name: s.name })),
  ]

  return (
    <section
      className={`sb-section${isInbox ? ' sb-section--inbox' : ''}${dragOver ? ' sb-section--over' : ''}`}
      aria-label={title}
      onDragOver={handleDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
      }}
      onDrop={handleDrop}
    >
      <header className="sb-section__header">
        <h3>{title}</h3>
        <span className="sb-section__count">{courses.length === 1 ? 'קורס אחד' : `${courses.length} קורסים`}</span>
        <span className="sb-section__load">{credits} נ״ז</span>
        {actions}
      </header>

      {courses.length === 0 ? (
        <p className="sb-section__empty">
          {isInbox ? 'כל הקורסים המתוכננים משובצים' : 'גררו לכאן קורס כדי לשבץ אותו בסמסטר'}
        </p>
      ) : (
        <ul className="sb-list">
          {courses.map((c) => (
            <li
              key={c.id}
              className="sb-course"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_TYPE, `${c.id}:${semesterId}`)
                e.dataTransfer.effectAllowed = 'move'
              }}
            >
              <span className="sb-course__grip" aria-hidden>
                ⋮⋮
              </span>
              <Link to={`/courses/${c.id}`} className="sb-course__name" draggable={false}>
                {c.name}
              </Link>
              <span className="sb-course__credits">{c.credits} נ״ז</span>
              {targets.length > 0 && (
                <select
                  className="sb-course__move"
                  aria-label={`העברת ${c.name}`}
                  value=""
                  onChange={(e) => onMove(c.id, e.target.value === 'none' ? null : Number(e.target.value))}
                >
                  <option value="" disabled hidden>
                    העבר ל…
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
    </section>
  )
}

const SEASONS = ['סתיו', 'חורף', 'אביב', 'קיץ'] as const

/** הוספת סמסטר - מוצג במסך הקורסים מעל החיפוש, יחד עם שאר פעולות היצירה.
 * בוחרים עונה ושנה, והשם נבנה מהם (למשל "סמסטר אביב 2027"). */
export function NewSemesterForm({ degreeId }: { degreeId: number }) {
  const createSemester = useCreateSemester(degreeId)
  const [season, setSeason] = useState('')
  const [year, setYear] = useState(() => String(new Date().getFullYear()))

  const validYear = /^\d{4}$/.test(year.trim())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!season || !validYear) return
    await createSemester.mutateAsync({ name: `סמסטר ${season} ${year.trim()}` })
    setSeason('')
  }

  return (
    <form className="sb-new" onSubmit={handleSubmit}>
      <select className="ui-input sb-new__season" aria-label="עונת הסמסטר" value={season} onChange={(e) => setSeason(e.target.value)}>
        <option value="" disabled>
          בחרו עונה
        </option>
        {SEASONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <input
        className="ui-input sb-new__year"
        aria-label="שנה"
        inputMode="numeric"
        maxLength={4}
        value={year}
        onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
      />
      <button type="submit" className="ui-button ui-button--secondary" disabled={createSemester.isPending || !season || !validYear}>
        + הוספת סמסטר
      </button>
    </form>
  )
}
