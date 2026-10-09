import { Link } from 'react-router-dom'
import { Card, EmptyState, Pill } from '@/components/ui'
import { PageSkeleton } from '@/components/Skeleton'
import { useCourses, useExams } from '@/lib/queries'
import type { ExamRead } from '@/lib/types'
import './Home.css'

const DAY_MS = 24 * 60 * 60 * 1000

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** כל המבחנים מכל הקורסים: הקרובים (כולל היום) למעלה, ואלה שעברו למטה. */
export default function Exams() {
  const { data: exams, isLoading: examsLoading } = useExams()
  const { data: courses, isLoading: coursesLoading } = useCourses()

  if (examsLoading || coursesLoading) return <PageSkeleton variant="list" />

  const courseName = (courseId: number) => courses?.find((c) => c.id === courseId)?.name ?? ''
  const today = startOfToday()
  const time = (e: ExamRead) => new Date(e.date_time).getTime()
  const upcoming = (exams ?? []).filter((e) => time(e) >= today).sort((a, b) => time(a) - time(b))
  const past = (exams ?? []).filter((e) => time(e) < today).sort((a, b) => time(b) - time(a))

  const row = (exam: ExamRead, isPast: boolean) => {
    const days = Math.round((time(exam) - today) / DAY_MS)
    const when = days <= 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`
    return (
      <Link key={exam.id} to={`/courses/${exam.course_id}`} className="home-row">
        <div>
          <p className="home-row__title">{courseName(exam.course_id)}</p>
          <p className="home-row__meta">
            {formatDateTime(exam.date_time)}
            {exam.location && ` · ${exam.location}`}
          </p>
        </div>
        {!isPast && <Pill tone={days <= 7 ? 'danger' : 'warning'}>{when}</Pill>}
      </Link>
    )
  }

  return (
    <div>
      <h1>מבחנים</h1>

      <div className="home-section">
        <h2>מבחנים קרובים</h2>
        <Card>
          {upcoming.length === 0 ? (
            <EmptyState title="אין מבחנים קרובים" subtitle="מוסיפים מבחן בעמוד של הקורס, במדור 'מבחנים'" />
          ) : (
            <div className="home-list">{upcoming.map((e) => row(e, false))}</div>
          )}
        </Card>
      </div>

      {past.length > 0 && (
        <div className="home-section">
          <h2>מבחנים שעברו</h2>
          <Card>
            <div className="home-list">{past.map((e) => row(e, true))}</div>
          </Card>
        </div>
      )}
    </div>
  )
}
