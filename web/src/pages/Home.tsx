import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Card } from '@/components/ui'
import { LinksBar } from '@/components/LinksBar'
import { DateBox } from '@/components/CourseOverview'
import { courseColor } from '@/lib/schedule'
import '@/components/LinksBar.css'
import '@/components/Upcoming.css'
import { PageSkeleton, SkeletonList } from '@/components/Skeleton'
import { useAllCourseItems, useCourses, useDegrees, useExams, useReminders, useUpdateReminder } from '@/lib/queries'
import { countsTowardDegree } from '@/lib/grades'
import { collectUpcoming, groupByHorizon, HORIZON_LABEL, relativeDays, UPCOMING_KIND_LABEL, weekSummary } from '@/lib/upcoming'
import type { UpcomingEntry, UpcomingKind } from '@/lib/upcoming'
import type { CourseItemRead, CourseRead } from '@/lib/types'
import './Home.css'

type Filter = 'all' | Exclude<UpcomingKind, 'session'>

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכול' },
  { id: 'assignment', label: 'מטלות' },
  { id: 'exam', label: 'מבחנים' },
  { id: 'reminder', label: 'תזכורות' },
]

/** כמה פריטים מציגים ברשימה לפני "לכל הלו״ז" */
const AGENDA_LIMIT = 10

function parseFilter(raw: string | null): Filter {
  return FILTERS.some((f) => f.id === raw) ? (raw as Filter) : 'all'
}

function formatTime(d: Date) {
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export default function Home() {
  const { user } = useAuth()
  const [now] = useState(() => new Date())
  // כל הפריטים (גם שהושלמו) - בשביל התקדמות השיעורים בכרטיסי הקורסים
  const { data: items, isLoading: itemsLoading } = useAllCourseItems()
  const { data: exams, isLoading: examsLoading } = useExams()
  const { data: courses, isLoading: coursesLoading } = useCourses()
  const { data: degrees, isLoading: degreesLoading } = useDegrees()
  const { data: reminders, isLoading: remindersLoading } = useReminders()
  const [params, setParams] = useSearchParams()
  const filter = parseFilter(params.get('filter'))

  const allItems = items ?? []
  const assignments = allItems.filter((i) => i.type === 'assignment')
  const upcoming = collectUpcoming({ assignments, exams: exams ?? [], reminders: reminders ?? [] }, now)
  const shown = upcoming.filter((e) => filter === 'all' || e.kind === filter).slice(0, AGENDA_LIMIT)

  // סטטיסטיקות - ממוצע משוקלל לפי נ"ז, רק על קורסים שהושלמו (ועברו) ויש להם ציון
  const allCourses = courses ?? []
  const doneCourses = allCourses.filter(countsTowardDegree)
  const currentCourses = allCourses.filter((c) => c.status === 'current')
  const earnedCredits = doneCourses.reduce((sum, c) => sum + c.credits, 0)
  const graded = doneCourses.filter((c) => c.grade != null)
  const gradedCredits = graded.reduce((sum, c) => sum + c.credits, 0)
  const average = gradedCredits > 0 ? graded.reduce((sum, c) => sum + c.grade! * c.credits, 0) / gradedCredits : null
  const targetCredits = degrees?.find((d) => d.target_credits)?.target_credits ?? null
  const remainingCredits = targetCredits ? Math.max(targetCredits - earnedCredits, 0) : null
  const progressPercent = targetCredits ? Math.min((earnedCredits / targetCredits) * 100, 100) : 0

  const courseById = new Map(allCourses.map((c) => [c.id, c]))

  function changeFilter(next: Filter) {
    const p = new URLSearchParams(params)
    if (next === 'all') p.delete('filter')
    else p.set('filter', next)
    setParams(p, { replace: true })
  }

  if (degreesLoading || coursesLoading) return <PageSkeleton variant="home" />

  if (degrees && degrees.length === 0) {
    return (
      <div>
        <h1 className="home-greeting">שלום{user?.display_name ? `, ${user.display_name}` : ''} 👋</h1>
        <p className="home-subgreeting">ברוכים הבאים! בואו נסדר את התואר שלכם</p>
        <Card className="home-welcome">
          <div className="home-welcome__icon" aria-hidden>
            🎓
          </div>
          <h2 className="home-welcome__title">הוסיפו את התואר שלכם</h2>
          <p className="home-welcome__text">
            ברגע שיש תואר, כאן יופיעו ההתקדמות בנ״ז, הממוצע, המטלות והמבחנים הקרובים.
          </p>
          <ol className="home-welcome__steps">
            <li>
              <span aria-hidden>📋</span>
              <span>בוחרים תואר מתבנית - קטלוג הקורסים נטען אוטומטית</span>
            </li>
            <li>
              <span aria-hidden>✅</span>
              <span>מסמנים קורסים שהושלמו, שבתהליך ושמתוכננים</span>
            </li>
            <li>
              <span aria-hidden>📈</span>
              <span>עוקבים אחרי ההתקדמות, המטלות והמבחנים</span>
            </li>
          </ol>
          <Link to="/degrees?new=1" className="ui-button ui-button--primary home-welcome__cta">
            + הוספת תואר עכשיו
          </Link>
        </Card>
      </div>
    )
  }

  const agendaLoading = itemsLoading || examsLoading || remindersLoading

  return (
    <div>
      <h1 className="home-greeting">שלום{user?.display_name ? `, ${user.display_name}` : ''} 👋</h1>
      <p className="home-subgreeting">{agendaLoading ? 'הנה מה שמחכה לך בקרוב' : weekSummary(upcoming)}</p>

      <LinksBar courseId={null} title="קישורים מהירים" compact />

      <div className="cd-cols">
        <div className="cd-cols__main">
          <Card className="cd-card home-agenda">
            <div className="cd-card__header">
              <h2>השבוע שלי</h2>
              <Link to="/schedule" className="home-section__link">
                ללו״ז ←
              </Link>
            </div>
            <div className="home-filters" role="radiogroup" aria-label="סינון">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  className={`home-filter${filter === f.id ? ' home-filter--on' : ''}`}
                  onClick={() => changeFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
              {filter === 'exam' && (
                <Link to="/exams" className="home-section__link home-filters__more">
                  כל המבחנים ←
                </Link>
              )}
            </div>
            {agendaLoading ? (
              <SkeletonList rows={4} />
            ) : shown.length === 0 ? (
              <p className="cd-muted home-agenda__empty">{filter === 'all' ? 'אין כרגע מטלות, מבחנים או תזכורות פתוחות. הכול מעודכן 🎉' : 'אין כאן כלום כרגע.'}</p>
            ) : (
              groupByHorizon(shown).map((g) => (
                <section key={g.horizon} className="home-group" aria-label={HORIZON_LABEL[g.horizon]}>
                  <h3 className={`home-group__title${g.horizon === 'overdue' ? ' home-group__title--danger' : ''}`}>{HORIZON_LABEL[g.horizon]}</h3>
                  {g.entries.map((e) => (
                    <AgendaRow key={e.key} entry={e} course={e.courseId != null ? courseById.get(e.courseId) : undefined} now={now} />
                  ))}
                </section>
              ))
            )}
          </Card>
        </div>

        <div className="cd-cols__side">
          <Link to="/degrees" className="ui-card cd-card home-degree">
            <div className="cd-card__header">
              <h2>התואר שלי</h2>
              <span className="home-degree__chevron" aria-hidden>
                ←
              </span>
            </div>
            <p className="home-degree__credits">
              <b>{earnedCredits}</b>
              {targetCredits ? ` / ${targetCredits}` : ''} נ״ז
            </p>
            {targetCredits && (
              <>
                <span className="cd-bar" role="progressbar" aria-label="נקודות זכות" aria-valuemin={0} aria-valuemax={targetCredits} aria-valuenow={earnedCredits}>
                  <span className="cd-bar__fill" style={{ width: `${progressPercent}%` }} />
                </span>
                <p className="cd-muted home-degree__left">
                  {remainingCredits === 0 ? 'השלמת את כל הנ"ז הנדרשות לתואר 🎉' : `נשארו עוד ${remainingCredits} נ"ז`}
                </p>
              </>
            )}
            <div className="home-degree__stats">
              <span>
                <b>{average != null ? average.toFixed(1) : '—'}</b>
                <small>ממוצע</small>
              </span>
              <span>
                <b>{doneCourses.length}</b>
                <small>הושלמו</small>
              </span>
              <span>
                <b>{currentCourses.length}</b>
                <small>בתהליך</small>
              </span>
            </div>
          </Link>

          <Card className="cd-card">
            <div className="cd-card__header">
              <h2>הקורסים שלי עכשיו</h2>
              <Link to="/courses" className="home-section__link">
                לכל הקורסים ←
              </Link>
            </div>
            {currentCourses.length === 0 ? (
              <p className="cd-muted">
                אין קורסים בתהליך. <Link to="/courses?tab=plan">בחירת קורס מהתכנון</Link>
              </p>
            ) : (
              currentCourses.map((c) => <CourseRow key={c.id} course={c} items={allItems.filter((i) => i.course_id === c.id)} now={now} />)
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function AgendaRow({ entry: e, course, now }: { entry: UpcomingEntry; course: CourseRead | undefined; now: Date }) {
  const updateReminder = useUpdateReminder()
  // במבחן שם הקורס כבר בכותרת
  const meta = [e.kind === 'exam' ? null : course?.name, e.date ? relativeDays(e.date, now) : null, e.date && e.hasTime ? formatTime(e.date) : null, e.location]
    .filter(Boolean)
    .join(' · ')
  const title = e.kind === 'assignment' ? `הגשת ${e.title}` : e.kind === 'exam' ? `${e.title}${course ? ` ב${course.name}` : ''}` : e.title
  const body = (
    <>
      {e.date ? <DateBox date={e.date} /> : <span className="date-box home-agenda__nodate" aria-hidden>—</span>}
      <span className="cd-next__body">
        <span className="cd-next__title">{title}</span>
        <span className="cd-muted">{meta}</span>
      </span>
      {/* לתזכורת יש תיבת סימון, אין צורך בתגית */}
      {e.kind !== 'reminder' && <span className={`kind-pill kind-pill--${e.kind}`}>{UPCOMING_KIND_LABEL[e.kind]}</span>}
    </>
  )

  if (e.kind === 'reminder') {
    return (
      <label className="cd-next home-agenda__row home-agenda__row--reminder">
        {body}
        {/* הסימון בסוף השורה, במקום התגית של שאר הסוגים - כך תיבות התאריך מתיישרות */}
        <input
          type="checkbox"
          className="home-agenda__check"
          checked={false}
          aria-label={`סימון "${e.title}" כבוצע`}
          onChange={() => updateReminder.mutate({ id: e.sourceId, payload: { is_done: true } })}
        />
      </label>
    )
  }
  return (
    <Link to={`/courses/${e.courseId}${e.kind === 'assignment' ? '?view=grade' : ''}`} className="cd-next home-agenda__row">
      {body}
    </Link>
  )
}

function CourseRow({ course, items, now }: { course: CourseRead; items: CourseItemRead[]; now: Date }) {
  const lessons = items.filter((i) => i.type === 'lesson')
  const watched = lessons.filter((l) => l.is_done).length
  const next = collectUpcoming({ assignments: items.filter((i) => i.type === 'assignment'), exams: [] }, now)[0]
  return (
    <Link to={`/courses/${course.id}`} className="home-course" style={{ ['--course-color' as string]: courseColor(course.id) }}>
      <span className="home-course__name">{course.name}</span>
      {lessons.length > 0 && (
        <span className="home-course__progress">
          <span className="cd-bar" role="progressbar" aria-label={`שיעורים שנצפו ב${course.name}`} aria-valuemin={0} aria-valuemax={lessons.length} aria-valuenow={watched}>
            <span className="cd-bar__fill" style={{ width: `${(watched / lessons.length) * 100}%` }} />
          </span>
          <small>
            {watched}/{lessons.length} שיעורים
          </small>
        </span>
      )}
      <span className="cd-muted">{next?.date ? `הבא: ${next.title} · ${relativeDays(next.date, now)}` : 'אין מטלות פתוחות'}</span>
    </Link>
  )
}
