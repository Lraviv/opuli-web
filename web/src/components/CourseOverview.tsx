import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, DateInput, EmptyState, IconButton, Input } from '@/components/ui'
import { ClassSessions } from '@/components/ClassSessions'
import { averageGradedAssignments, formatGrade, requiredExamGrade, rulesFromCourse } from '@/lib/grades'
import type { GradePart } from '@/lib/grades'
import { useCourseExams, useCourseSessions, useCreateExam, useDeleteExam, useStudyTopics } from '@/lib/queries'
import './Upcoming.css'
import { collectUpcoming, relativeDays, UPCOMING_KIND_LABEL } from '@/lib/upcoming'
import type { UpcomingEntry } from '@/lib/upcoming'
import type { CourseItemRead, CourseRead } from '@/lib/types'

export type CourseView = 'overview' | 'study' | 'grade' | 'tips'

/** היעד שמחושב בכרטיס "כמה צריך בבחינה" בסקירה - כמו ברירת המחדל של המחשבון */
const OVERVIEW_TARGET = 85

function formatDay(d: Date) {
  return d.toLocaleDateString('he-IL', { day: 'numeric' })
}
function formatMonth(d: Date) {
  return d.toLocaleDateString('he-IL', { month: 'short' })
}
function formatTime(d: Date) {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

/** תאריך בתוך ריבוע קטן: "21" מעל "אוק׳" */
export function DateBox({ date }: { date: Date }) {
  return (
    <span className="date-box" aria-hidden>
      <b>{formatDay(date)}</b>
      <small>{formatMonth(date)}</small>
    </span>
  )
}

function entryMeta(e: UpcomingEntry, now: Date): string {
  const parts: string[] = []
  if (e.date) parts.push(relativeDays(e.date, now))
  if (e.date && e.hasTime) parts.push(formatTime(e.date))
  if (e.location) parts.push(e.location)
  if (e.weight) parts.push(`משקל ${e.weight}%`)
  return parts.join(' · ')
}

/** לשונית "סקירה" בדף הקורס: מה הבא, מבחנים, התקדמות, וכמה צריך בבחינה */
export function CourseOverview({
  course,
  lessons,
  assignments,
  onGo,
}: {
  course: CourseRead
  lessons: CourseItemRead[]
  assignments: CourseItemRead[]
  onGo: (view: CourseView) => void
}) {
  const [now] = useState(() => new Date())
  const { exams } = useCourseExams(course.id)
  const { sessions } = useCourseSessions(course.id)
  const { data: topics } = useStudyTopics(course.id)
  const [showSessions, setShowSessions] = useState(false)

  const next = collectUpcoming({ assignments, exams, sessions }, now).slice(0, 3)

  const lessonsDone = lessons.filter((l) => l.is_done).length
  const topicList = topics ?? []
  const topicsDone = topicList.filter((t) => t.is_done).length
  const submitted = assignments.filter((a) => a.is_done).length

  return (
    <div className="cd-cols">
      <div className="cd-cols__main">
        <Card className="cd-card">
          <div className="cd-card__header">
            <h2>הבא בתור</h2>
            <button type="button" className="cd-ghost" aria-expanded={showSessions} onClick={() => setShowSessions((v) => !v)}>
              {showSessions ? 'סגירת מפגשים' : 'מפגשים קבועים'}
            </button>
          </div>
          {next.length === 0 ? (
            <p className="cd-muted">אין כרגע מטלות, מפגשים או מבחנים קרובים.</p>
          ) : (
            next.map((e) => (
              <div key={e.key} className="cd-next">
                {e.date && <DateBox date={e.date} />}
                <div className="cd-next__body">
                  <p className="cd-next__title">{e.kind === 'assignment' ? `הגשת ${e.title}` : e.title}</p>
                  <p className="cd-muted">{entryMeta(e, now)}</p>
                </div>
                <span className={`kind-pill kind-pill--${e.kind}`}>{UPCOMING_KIND_LABEL[e.kind]}</span>
              </div>
            ))
          )}
        </Card>
        {showSessions && <ClassSessions courseId={course.id} />}

        <ExamsCard courseId={course.id} exams={exams} now={now} />
      </div>

      <div className="cd-cols__side">
        <Card className="cd-card cd-progress">
          <h2>ההתקדמות שלי</h2>
          <ProgressRow label="שיעורים שנצפו" done={lessonsDone} total={lessons.length} onClick={() => onGo('study')} />
          <ProgressRow label="נושאים שלמדתי" done={topicsDone} total={topicList.length} onClick={() => onGo('study')} />
          <ProgressRow label="מטלות שהוגשו" done={submitted} total={assignments.length} tone="success" onClick={() => onGo('grade')} />
        </Card>

        {course.status !== 'done' && <ExamNeedCard course={course} assignments={assignments} onClick={() => onGo('grade')} />}
      </div>
    </div>
  )
}

function ProgressRow({ label, done, total, tone, onClick }: { label: string; done: number; total: number; tone?: 'success'; onClick: () => void }) {
  const percent = total ? Math.round((done / total) * 100) : 0
  return (
    <button type="button" className="cd-progress__row" onClick={onClick}>
      <span className="cd-progress__text">
        <span>{label}</span>
        <b>{total ? `${done}/${total}` : '—'}</b>
      </span>
      <span className="cd-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span className={tone === 'success' ? 'cd-bar__fill cd-bar__fill--success' : 'cd-bar__fill'} style={{ width: `${percent}%` }} />
      </span>
    </button>
  )
}

function ExamNeedCard({ course, assignments, onClick }: { course: CourseRead; assignments: CourseItemRead[]; onClick: () => void }) {
  const weighted = assignments.filter((a) => (a.weight_percent ?? 0) > 0)
  if (weighted.length === 0) return null
  // מטלות שעוד לא נבדקו נספרות לפי ממוצע המטלות שנבדקו (כמו ברירת המחדל במחשבון)
  const avg = averageGradedAssignments(weighted) ?? 80
  const parts: GradePart[] = weighted.map((a) => ({ weight: a.weight_percent!, value: a.grade ?? avg }))
  const result = requiredExamGrade(OVERVIEW_TARGET, parts, rulesFromCourse(course))
  if (result.kind === 'no-exam') return null

  return (
    <button type="button" className="ui-card cd-card cd-need" onClick={onClick}>
      <span className={`cd-need__badge${result.kind === 'impossible' ? ' cd-need__badge--warn' : ''}`}>
        {result.kind === 'ok' ? result.grade : '!'}
      </span>
      <span className="cd-need__body">
        <span className="cd-need__title">
          {result.kind === 'ok'
            ? `לציון ${OVERVIEW_TARGET} צריך ${result.grade} בבחינה`
            : `גם 100 בבחינה יביא ל-${formatGrade(result.best)}`}
        </span>
        <span className="cd-muted">לפי הציונים שלך במטלות · למחשבון המלא</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="cd-need__chevron">
        <path d="M15 6l-6 6 6 6" />
      </svg>
    </button>
  )
}

function ExamsCard({ courseId, exams, now }: { courseId: number; exams: { id: number; date_time: string; location: string | null }[]; now: Date }) {
  const createExam = useCreateExam(courseId)
  const deleteExam = useDeleteExam()
  const [adding, setAdding] = useState(false)
  const [date, setDate] = useState('')
  const [location, setLocation] = useState('')

  const sorted = [...exams].sort((a, b) => a.date_time.localeCompare(b.date_time))

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!date) return
    await createExam.mutateAsync({ date_time: new Date(date).toISOString(), location: location.trim() || null })
    setDate('')
    setLocation('')
    setAdding(false)
  }

  return (
    <Card className="cd-card">
      <div className="cd-card__header">
        <h2>מבחנים</h2>
        {!adding && (
          <button type="button" className="cd-ghost" onClick={() => setAdding(true)}>
            + הוספת מבחן
          </button>
        )}
      </div>
      {adding && (
        <form className="cd-add-form" onSubmit={handleAdd}>
          <DateInput type="datetime-local" label="מועד המבחן" placeholder="מועד המבחן" value={date} onChange={setDate} />
          <Input placeholder="מקום (לא חובה)" aria-label="מקום המבחן" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} />
          <div className="cd-add-form__actions">
            <Button type="submit" disabled={!date || createExam.isPending}>
              שמירה
            </Button>
            <Button type="button" variant="secondary" onClick={() => setAdding(false)}>
              ביטול
            </Button>
          </div>
        </form>
      )}
      {sorted.length === 0 && !adding ? (
        <EmptyState title="אין מבחנים" subtitle="הוסיפו את מועדי הבחינה כדי לראות אותם בבית ובלו״ז" />
      ) : (
        sorted.map((exam) => {
          const d = new Date(exam.date_time)
          const past = d.getTime() < now.getTime() - 86400000
          return (
            <div key={exam.id} className={`cd-next${past ? ' cd-next--past' : ''}`}>
              <DateBox date={d} />
              <div className="cd-next__body">
                <p className="cd-next__title">{d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <p className="cd-muted">{[formatTime(d), exam.location, past ? 'עבר' : relativeDays(d, now)].filter(Boolean).join(' · ')}</p>
              </div>
              <IconButton icon="delete" tone="danger" label={`מחיקת המבחן ב-${d.toLocaleDateString('he-IL')}`} onClick={() => deleteExam.mutate(exam.id)} />
            </div>
          )
        })
      )}
    </Card>
  )
}
