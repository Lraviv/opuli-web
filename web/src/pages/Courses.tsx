import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { NewSemesterForm, SemesterBoard } from '@/components/SemesterBoard'
import { GradeInput } from '@/components/GradeInput'
import { isFailedCourse } from '@/lib/grades'
import { SkeletonList } from '@/components/Skeleton'
import { useCourses, useCreateCourse, useDegrees } from '@/lib/queries'
import type { CourseStatus } from '@/lib/types'
import './Courses.css'

// מסך הקורסים = ניהול הקורסים האישיים: רשימות לפי סטטוס, הוספה ידנית (המקום
// היחיד), ולוח תכנון הסמסטרים. בחירה מהקטלוג נעשית במסך התואר.
// בלי 'planned': קורסים מתוכננים מנוהלים דרך טאב "תכנון" (לוח הסמסטרים),
// שמציג אותם מאורגנים לפי סמסטר ולא כרשימה שטוחה - ראו mobile/courses/index.tsx
type ListTab = CourseStatus | 'plan'
const TAB_ITEMS: { key: ListTab; label: string }[] = [
  { key: 'current', label: 'בתהליך' },
  { key: 'plan', label: 'תכנון' },
  { key: 'done', label: 'הושלם' },
]
const STATUS_COLOR: Record<CourseStatus, string> = {
  done: 'var(--color-success)',
  current: 'var(--color-primary)',
  planned: 'var(--color-warning)',
}

export default function Courses() {
  const [searchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as ListTab) ?? 'current'
  const [tab, setTab] = useState<ListTab>(TAB_ITEMS.some((t) => t.key === initialTab) ? initialTab : 'current')
  const [search, setSearch] = useState('')

  const { data: degrees } = useDegrees()
  const coursesQuery = useCourses({ status: tab === 'plan' ? undefined : tab })
  const createCourse = useCreateCourse()
  const { data: allCourses } = useCourses()
  const tabCount = (key: ListTab) => (allCourses ?? []).filter((c) => c.status === (key === 'plan' ? 'planned' : key)).length

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [credits, setCredits] = useState('')
  const [semester, setSemester] = useState('')

  const filteredCourses = useMemo(() => {
    const all = coursesQuery.data ?? []
    const q = search.trim()
    if (!q) return all
    return all.filter((c) => c.name.includes(q) || (c.semester ?? '').includes(q))
  }, [coursesQuery.data, search])

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !credits) return
    await createCourse.mutateAsync({
      name: name.trim(),
      credits: Number(credits),
      semester: semester.trim() || null,
      status: tab === 'plan' ? 'planned' : tab,
      degree_id: degrees?.[0]?.id ?? null,
    })
    setName('')
    setCredits('')
    setSemester('')
    setShowForm(false)
  }

  const catalogLink = degrees && degrees.length > 0 ? `/degrees/${degrees[0].id}#catalog` : null

  return (
    <div>
      <div className="courses-header">
        <h1>הקורסים שלי</h1>
        <div className="courses-actions">
          {catalogLink && (
            <Link to={catalogLink} className="ui-button ui-button--secondary">
              + מהקטלוג
            </Link>
          )}
          <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'ביטול' : '+ קורס ידני'}
          </Button>
        </div>
      </div>

      {showForm && (
        <form className="courses-add" onSubmit={handleAdd}>
          <Input placeholder="שם קורס" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <Input
            className="courses-add__credits"
            placeholder="נ״ז"
            aria-label="נקודות זכות"
            type="number"
            step="0.5"
            min={0}
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            required
          />
          {tab !== 'plan' && (
            <Input placeholder="סמסטר (לא חובה)" value={semester} onChange={(e) => setSemester(e.target.value)} />
          )}
          <Button type="submit" disabled={createCourse.isPending}>
            {tab === 'plan' ? 'הוספה לתכנון' : tab === 'done' ? 'הוספה להושלם' : 'הוספה לבתהליך'}
          </Button>
        </form>
      )}

      <div className="courses-tabs" role="tablist">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`courses-tab${tab === t.key ? ' courses-tab--active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            <span className="courses-tab__count">{tabCount(t.key)}</span>
          </button>
        ))}
      </div>

      {tab === 'plan' && degrees && degrees.length > 0 && <NewSemesterForm degreeId={degrees[0].id} />}

      {!(tab === 'plan' && !degrees?.length) && (
        <Input
          type="search"
          className="courses-search"
          placeholder={tab === 'plan' ? 'חיפוש קורס בתכנון…' : 'חיפוש קורס…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {tab === 'plan' ? (
        degrees && degrees.length > 0 ? (
          <SemesterBoard degreeId={degrees[0].id} search={search} />
        ) : (
          <EmptyState title="הוסיפו תואר כדי לתכנן סמסטרים" />
        )
      ) : (
        <>
          <Card>
            {coursesQuery.isLoading ? (
              <SkeletonList rows={4} pill={false} />
            ) : !filteredCourses || filteredCourses.length === 0 ? (
              <EmptyState
                title={search.trim() ? 'לא נמצאו קורסים תואמים לחיפוש' : 'אין כאן קורסים עדיין'}
                subtitle={search.trim() ? undefined : 'אפשר לבחור קורס מהקטלוג במסך התואר, או להוסיף ידנית למעלה'}
              />
            ) : (
              filteredCourses.map((course) => {
                return (
                  <div key={course.id} className="courses-row">
                    <Link to={`/courses/${course.id}`} className="courses-row__link">
                      <span className="courses-dot" style={{ background: STATUS_COLOR[course.status] }} />
                      <div style={{ flex: 1 }}>
                        <p className="courses-row__title">{course.name}</p>
                        {course.semester && <p className="courses-row__subtitle">{course.semester}</p>}
                      </div>
                      <span className="courses-row__meta">{course.credits} נ"ז</span>
                    </Link>
                    {course.status === 'done' && <GradeInput key={course.grade ?? ''} course={course} />}
                    {isFailedCourse(course) && <span className="failed-pill">לא עבר</span>}
                  </div>
                )
              })
            )}
          </Card>

        </>
      )}
    </div>
  )
}
