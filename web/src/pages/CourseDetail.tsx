import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, DateInput, EmptyState, IconButton, Input, Pill } from '@/components/ui'
import { GradeInput } from '@/components/GradeInput'
import { CourseItemRow } from '@/components/CourseItemRow'
import { StudyTopics } from '@/components/StudyTopics'
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
import type { CourseItemType, CourseStatus } from '@/lib/types'
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

  const { data: courses } = useCourses()
  const course = courses?.find((c) => c.id === id)
  const { data: items } = useCourseItems(id)
  const { exams } = useCourseExams(id)

  const updateCourse = useUpdateCourse()
  const deleteCourse = useDeleteCourse()
  const addItem = useAddCourseItem(id)
  const batchAddLessons = useBatchAddLessons(id)
  const createExam = useCreateExam(id)
  const deleteExam = useDeleteExam()

  const [itemTitle, setItemTitle] = useState('')
  const [itemType, setItemType] = useState<CourseItemType>('assignment')
  const [itemDue, setItemDue] = useState('')
  const [lessonCount, setLessonCount] = useState('12')
  const [examDate, setExamDate] = useState('')

  async function handleAddItem(e: FormEvent) {
    e.preventDefault()
    if (!itemTitle.trim()) return
    const date = itemDue ? new Date(itemDue).toISOString() : null
    await addItem.mutateAsync({ type: itemType, title: itemTitle, ...(itemType === 'lesson' ? { watched_at: date } : { due_date: date }) })
    setItemTitle('')
    setItemDue('')
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

  if (!course) return <p>טוען…</p>

  const lessons = (items ?? []).filter((i) => i.type === 'lesson')
  const assignments = (items ?? []).filter((i) => i.type === 'assignment')

  return (
    <div>
      <Link to={`/courses?tab=${STATUS_TAB[course.status]}`} className="cd-back">
        → חזרה לקורסים
      </Link>
      <div className="cd-header">
        <div>
          <h1>{course.name}</h1>
          <p>{course.credits} נ"ז</p>
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

      <div className="cd-section">
        <div className="cd-section-header">
          <h2>מטלות</h2>
        </div>
        <Card style={{ marginBottom: 'var(--space-three)' }}>
          <form className="cd-inline-form" onSubmit={handleAddItem}>
            <select value={itemType} onChange={(e) => setItemType(e.target.value as CourseItemType)}>
              <option value="assignment">מטלה</option>
              <option value="lesson">שיעור</option>
            </select>
            <Input placeholder="כותרת" value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
            <DateInput
              label={itemType === 'lesson' ? 'תאריך צפייה' : 'תאריך הגשה'}
              placeholder={itemType === 'lesson' ? 'תאריך צפייה' : 'תאריך הגשה'}
              value={itemDue}
              onChange={setItemDue}
            />
            <Button type="submit" disabled={addItem.isPending}>
              הוספה
            </Button>
          </form>
        </Card>
        <Card>
          {assignments.length === 0 ? (
            <EmptyState title="אין מטלות" />
          ) : (
            assignments.map((item) => <CourseItemRow key={item.id} item={item} />)
          )}
        </Card>
      </div>

      <div className="cd-section">
        <div className="cd-section-header">
          <h2>שיעורים</h2>
        </div>
        <Card style={{ marginBottom: 'var(--space-three)' }}>
          <form className="cd-inline-form" onSubmit={handleBatchLessons}>
            <Input
              type="number"
              min={1}
              max={100}
              value={lessonCount}
              onChange={(e) => setLessonCount(e.target.value)}
              style={{ maxWidth: 100 }}
            />
            <Button type="submit" disabled={batchAddLessons.isPending}>
              יצירת שיעורים אוטומטית
            </Button>
          </form>
        </Card>
        <Card>
          {lessons.length === 0 ? (
            <EmptyState title="אין שיעורים" />
          ) : (
            lessons.map((item) => <CourseItemRow key={item.id} item={item} />)
          )}
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
