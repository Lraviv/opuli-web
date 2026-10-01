import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, DateInput, EmptyState, IconButton, Input, Pill } from '@/components/ui'
import { GradeInput } from '@/components/GradeInput'
import { CourseItemRow } from '@/components/CourseItemRow'
import { StudyTopics } from '@/components/StudyTopics'
import { AssignmentsPanel } from '@/components/AssignmentsPanel'
import { GradeCalculator } from '@/components/GradeCalculator'
import { ClassSessions } from '@/components/ClassSessions'
import { LinksBar } from '@/components/LinksBar'
import { PageSkeleton } from '@/components/Skeleton'
import {
  useAddCourseItem,
  useBatchAddLessons,
  useCourseExams,
  useCourseItems,
  useCourses,
  useCreateExam,
  useDeleteCourse,
  useDeleteExam,
  useUpdateCourse,
} from '@/lib/queries'
import type { CourseStatus } from '@/lib/types'
import './CourseDetail.css'

const STATUS_LABEL: Record<CourseStatus, string> = { done: 'הושלם', current: 'בתהליך', planned: 'מתוכנן' }
// הטאב במסך הקורסים שבו מופיע קורס בכל סטטוס
const STATUS_TAB: Record<CourseStatus, string> = { done: 'done', current: 'current', planned: 'plan' }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function CourseDetail() {
  const { courseId } = useParams()
  const id = Number(courseId)
  const navigate = useNavigate()

  const { data: courses, isLoading: coursesLoading } = useCourses()
  const course = courses?.find((c) => c.id === id)
  const { data: items, isLoading: itemsLoading } = useCourseItems(id)
  const { exams } = useCourseExams(id)

  const updateCourse = useUpdateCourse()
  const deleteCourse = useDeleteCourse()
  const addItem = useAddCourseItem(id)
  const batchAddLessons = useBatchAddLessons(id)
  const createExam = useCreateExam(id)
  const deleteExam = useDeleteExam()

  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonCount, setLessonCount] = useState('12')
  const [examDate, setExamDate] = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)

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
  }

  async function handleAddExam(e: FormEvent) {
    e.preventDefault()
    if (!examDate) return
    await createExam.mutateAsync({ date_time: new Date(examDate).toISOString() })
    setExamDate('')
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
  const lessonsWatched = lessons.filter((l) => l.is_done).length

  return (
    <div>
      <Link to={`/courses?tab=${STATUS_TAB[course.status]}`} className="cd-back">
        → חזרה לקורסים
      </Link>
      <div className="cd-header">
        <div>
          <h1>{course.name}</h1>
          <p>
            {course.credits} נ"ז
            {course.category ? ` · ${course.category}` : ''}
          </p>
          <div className="cd-status-row">
            {(['planned', 'current', 'done'] as CourseStatus[]).map((s) => (
              <Button
                key={s}
                variant={course.status === s ? 'primary' : 'secondary'}
                onClick={() => updateCourse.mutate({ id, payload: { status: s } })}
              >
                {STATUS_LABEL[s]}
              </Button>
            ))}
          </div>
          {course.status === 'done' && (
            <label className="cd-grade">
              ציון סופי
              <GradeInput key={course.grade ?? ''} course={course} />
            </label>
          )}
        </div>
        <Button variant="danger" onClick={handleDeleteCourse}>
          מחיקת קורס
        </Button>
      </div>

      <LinksBar courseId={id} title="קישורים לקורס" />

      <AssignmentsPanel course={course} assignments={assignments} onEditRules={() => setRulesOpen(true)} />

      <GradeCalculator course={course} assignments={assignments} rulesOpen={rulesOpen} onRulesOpenChange={setRulesOpen} />

      <ClassSessions courseId={id} />

      <div className="cd-section">
        <div className="cd-section-header">
          <h2>שיעורים</h2>
          {lessons.length > 0 && (
            <span className="ap-count">
              {lessonsWatched}/{lessons.length} נצפו
            </span>
          )}
        </div>
        <Card>
          {lessons.length === 0 ? (
            <EmptyState title="אין שיעורים" subtitle="אפשר ליצור רשימת שיעורים ממוספרת בבת אחת" />
          ) : (
            lessons.map((item) => <CourseItemRow key={item.id} item={item} />)
          )}
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
        </Card>
      </div>

      <StudyTopics courseId={id} />

      <div className="cd-section">
        <div className="cd-section-header">
          <h2>מבחנים</h2>
        </div>
        <Card style={{ marginBottom: 'var(--space-three)' }}>
          <form className="cd-inline-form" onSubmit={handleAddExam}>
            <DateInput type="datetime-local" label="מועד המבחן" placeholder="מועד המבחן" value={examDate} onChange={setExamDate} />
            <Button type="submit" disabled={createExam.isPending}>
              הוספת מבחן
            </Button>
          </form>
        </Card>
        <Card>
          {exams.length === 0 ? (
            <EmptyState title="אין מבחנים מתוכננים" />
          ) : (
            exams.map((exam) => (
              <div className="cd-row" key={exam.id}>
                <p className="cd-row__title">{formatDateTime(exam.date_time)}</p>
                {exam.location && <Pill>{exam.location}</Pill>}
                <IconButton
                  icon="delete"
                  tone="danger"
                  label={`מחיקת המבחן ב-${formatDateTime(exam.date_time)}`}
                  onClick={() => deleteExam.mutate(exam.id)}
                />
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  )
}
