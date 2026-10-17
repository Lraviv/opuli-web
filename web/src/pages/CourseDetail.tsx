import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { GradeInput } from '@/components/GradeInput'
import { CourseItemRow } from '@/components/CourseItemRow'
import { StudyTopics } from '@/components/StudyTopics'
import { AssignmentsPanel } from '@/components/AssignmentsPanel'
import { GradeCalculator } from '@/components/GradeCalculator'
import { LinksBar } from '@/components/LinksBar'
import { CourseTips } from '@/components/CourseTips'
import { CourseOverview } from '@/components/CourseOverview'
import { CourseEditForm } from '@/components/CourseEditForm'
import type { CourseView } from '@/components/CourseOverview'
import { MoreMenu, StatusMenu } from '@/components/StatusMenu'
import { PageSkeleton } from '@/components/Skeleton'
import { isFailedCourse } from '@/lib/grades'
import { useAddCourseItem, useBatchAddLessons, useCourseItems, useCourses, useCourseTips, useDegree, useDeleteCourse, useUpdateCourse } from '@/lib/queries'
import { courseSiteUrl } from '@/lib/links'
import type { CourseItemRead, CourseStatus } from '@/lib/types'
import './CourseDetail.css'

// הטאב במסך הקורסים שבו מופיע קורס בכל סטטוס
const STATUS_TAB: Record<CourseStatus, string> = { done: 'done', current: 'current', planned: 'plan' }

const VIEWS: { id: CourseView; label: string }[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'study', label: 'לימוד' },
  { id: 'grade', label: 'מטלות וציון' },
  { id: 'tips', label: 'עצות' },
]

function parseView(raw: string | null): CourseView {
  return VIEWS.some((v) => v.id === raw) ? (raw as CourseView) : 'overview'
}

export default function CourseDetail() {
  const { courseId } = useParams()
  const id = Number(courseId)
  const navigate = useNavigate()

  const { data: courses, isLoading: coursesLoading } = useCourses()
  const course = courses?.find((c) => c.id === id)
  const { degree } = useDegree(course?.degree_id ?? undefined)
  const { data: items, isLoading: itemsLoading } = useCourseItems(id)
  // אותו מפתח שאילתה כמו ברירת המחדל של לשונית העצות - בשביל המספר שעל הלשונית
  const { data: tips } = useCourseTips(id, 'top', 20)
  const [params, setParams] = useSearchParams()
  const view = parseView(params.get('view'))

  const updateCourse = useUpdateCourse()
  const deleteCourse = useDeleteCourse()
  const [rulesOpen, setRulesOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [studyView, setStudyView] = useState<'lessons' | 'topics'>('lessons')

  function changeView(next: CourseView) {
    const p = new URLSearchParams()
    if (next !== 'overview') p.set('view', next)
    setParams(p, { replace: true })
  }

  async function handleDeleteCourse() {
    if (!course || !confirm(`למחוק את הקורס "${course.name}"?`)) return
    await deleteCourse.mutateAsync(id)
    navigate(`/courses?tab=${STATUS_TAB[course.status]}`)
  }

  if (coursesLoading || itemsLoading) return <PageSkeleton variant="detail" />
  if (!course) {
    return (
      <Card>
        <EmptyState title="הקורס לא נמצא" subtitle="ייתכן שהוא נמחק" />
        <Link to="/courses" className="cd-back">
          → לרשימת הקורסים
        </Link>
      </Card>
    )
  }

  const lessons = (items ?? []).filter((i) => i.type === 'lesson')
  const assignments = (items ?? []).filter((i) => i.type === 'assignment')

  return (
    <div>
      <div className="cd-topbar">
        <Link to={`/courses?tab=${STATUS_TAB[course.status]}`} className="cd-back">
          → הקורסים שלי
        </Link>
        <MoreMenu
          label="עוד פעולות לקורס"
          items={[
            { label: 'עריכת קורס', onSelect: () => setEditing(true) },
            { label: 'מחיקת קורס', danger: true, onSelect: handleDeleteCourse },
          ]}
        />
      </div>

      <header className="cd-header">
        <h1>{course.name}</h1>
        <p className="cd-header__meta">
          {course.credits} נ"ז
          {course.category ? ` · ${course.category}` : ''}
          {course.course_code ? ` · ${course.course_code}` : ''}
        </p>
        <div className="cd-header__status">
          <StatusMenu status={course.status} onChange={(status) => updateCourse.mutate({ id, payload: { status } })} />
          {course.status === 'done' && (
            <label className="cd-grade">
              ציון סופי
              <GradeInput key={course.grade ?? ''} course={course} />
            </label>
          )}
          {isFailedCourse(course) && <span className="failed-pill">לא עבר</span>}
        </div>
      </header>

      {editing && <CourseEditForm key={course.id} course={course} onDone={() => setEditing(false)} />}

      <LinksBar courseId={id} title="קישורים לקורס" compact siteUrl={courseSiteUrl(degree?.institution, course.course_code)} />

      <div className="cd-tabs" role="tablist" aria-label="אזורי הקורס">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`cd-tab${view === v.id ? ' cd-tab--active' : ''}`}
            onClick={() => changeView(v.id)}
          >
            {v.label}
            {v.id === 'tips' && tips?.linked && tips.total > 0 && <span className="cd-tab__count">{tips.total}</span>}
          </button>
        ))}
      </div>

      {view === 'overview' && <CourseOverview course={course} lessons={lessons} assignments={assignments} onGo={changeView} />}

      {view === 'study' && (
        <>
          <div className="cd-segmented" role="radiogroup" aria-label="מה להציג">
            {(
              [
                ['lessons', 'שיעורים'],
                ['topics', 'חומר ללימוד'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={studyView === value}
                className={`cd-segmented__item${studyView === value ? ' cd-segmented__item--on' : ''}`}
                onClick={() => setStudyView(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* בטלפון מוצג רק החלק שנבחר; במחשב שניהם זה לצד זה */}
          <div className={`cd-pair cd-pair--show-${studyView}`}>
            <div className="cd-pair__lessons">
              <LessonsSection courseId={id} lessons={lessons} />
            </div>
            <div className="cd-pair__topics">
              <StudyTopics courseId={id} />
            </div>
          </div>
        </>
      )}

      {view === 'grade' && (
        <div className="cd-cols">
          <div className="cd-cols__main">
            <AssignmentsPanel course={course} assignments={assignments} onEditRules={() => setRulesOpen(true)} />
          </div>
          <div className="cd-cols__side">
            <GradeCalculator course={course} assignments={assignments} rulesOpen={rulesOpen} onRulesOpenChange={setRulesOpen} />
          </div>
        </div>
      )}

      {view === 'tips' && <CourseTips course={course} />}
    </div>
  )
}

/** רשימת השיעורים; טפסי ההוספה נפתחים רק מהכפתור */
function LessonsSection({ courseId, lessons }: { courseId: number; lessons: CourseItemRead[] }) {
  const addItem = useAddCourseItem(courseId)
  const batchAddLessons = useBatchAddLessons(courseId)
  const [adding, setAdding] = useState(false)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonCount, setLessonCount] = useState('12')
  const watched = lessons.filter((l) => l.is_done).length

  async function handleAddLesson(e: FormEvent) {
    e.preventDefault()
    if (!lessonTitle.trim()) return
    await addItem.mutateAsync({ type: 'lesson', title: lessonTitle.trim() })
    setLessonTitle('')
  }

  async function handleBatchLessons(e: FormEvent) {
    e.preventDefault()
    const count = Number(lessonCount)
    if (!count || count <= 0) return
    await batchAddLessons.mutateAsync(count)
    setAdding(false)
  }

  return (
    <div className="cd-section">
      <div className="cd-section-header">
        <h2>
          שיעורים
          {lessons.length > 0 && (
            <span className="cd-section-header__count">
              {' '}
              · {watched}/{lessons.length} נצפו
            </span>
          )}
        </h2>
        <button type="button" className="cd-ghost" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          {adding ? 'סגירה' : '+ הוספת שיעורים'}
        </button>
      </div>
      <Card>
        {adding && (
          <div className="cd-lesson-forms">
            <form className="cd-inline-form" onSubmit={handleAddLesson}>
              <Input placeholder="שיעור חדש" aria-label="כותרת שיעור" value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} />
              <Button type="submit" variant="secondary" disabled={addItem.isPending}>
                הוספה
              </Button>
            </form>
            <form className="cd-inline-form" onSubmit={handleBatchLessons}>
              <Input
                type="number"
                min={1}
                max={100}
                aria-label="מספר שיעורים ליצירה"
                value={lessonCount}
                onChange={(e) => setLessonCount(e.target.value)}
                style={{ maxWidth: 90, minWidth: 70 }}
              />
              <Button type="submit" variant="secondary" disabled={batchAddLessons.isPending}>
                יצירת שיעורים ממוספרים
              </Button>
            </form>
          </div>
        )}
        {lessons.length === 0 ? (
          !adding && <EmptyState title="אין שיעורים" subtitle="אפשר ליצור רשימת שיעורים ממוספרת בבת אחת" />
        ) : (
          lessons.map((item) => <CourseItemRow key={item.id} item={item} />)
        )}
      </Card>
    </div>
  )
}
