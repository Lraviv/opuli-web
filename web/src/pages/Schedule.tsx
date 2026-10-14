import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarExport } from '@/components/CalendarExport'
import { PageSkeleton } from '@/components/Skeleton'
import { useAllCourseItems, useAllSessions, useCourses, useExams, useReminders, useUpdateCourseItem, useUpdateReminder } from '@/lib/queries'
import {
  AGENDA_KIND_LABEL,
  WEEKDAY_NAMES,
  addDays,
  buildAgenda,
  courseColor,
  dateKey,
  formatWeekRange,
  parseDateKey,
  startOfWeek,
  weekDays,
} from '@/lib/schedule'
import type { AgendaItem } from '@/lib/schedule'
import './Schedule.css'

/** לו"ז שבועי: מפגשים קבועים, מבחנים, הגשות ותזכורות - יום אחרי יום. */
export default function Schedule() {
  const [params, setParams] = useSearchParams()
  const weekParam = params.get('week')
  // "עכשיו" נקבע פעם אחת בטעינת המסך - מספיק ללו"ז, ושומר על רינדור יציב
  const [now] = useState(() => new Date())
  const weekStart = useMemo(() => {
    const base = weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? parseDateKey(weekParam) : now
    return startOfWeek(base)
  }, [weekParam, now])
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const todayKey = dateKey(now)
  const isCurrentWeek = dateKey(startOfWeek(now)) === dateKey(weekStart)

  const { data: courses, isLoading: coursesLoading } = useCourses()
  const { data: sessions, isLoading: sessionsLoading } = useAllSessions()
  const { data: exams, isLoading: examsLoading } = useExams()
  const { data: assignments, isLoading: itemsLoading } = useAllCourseItems({ type: 'assignment' })
  const { data: reminders } = useReminders()

  const agenda = useMemo(() => {
    const names = new Map((courses ?? []).map((c) => [c.id, c.name]))
    return buildAgenda(days, {
      sessions: sessions ?? [],
      exams: exams ?? [],
      assignments: assignments ?? [],
      reminders: reminders ?? [],
      courseName: (id) => names.get(id) ?? null,
    })
  }, [days, courses, sessions, exams, assignments, reminders])

  // תזכורות פתוחות בלי תאריך - אין להן יום בלו"ז, אז הן מוצגות ברשימה נפרדת מתחת לשבוע
  const undatedReminders = useMemo<AgendaItem[]>(
    () =>
      (reminders ?? [])
        .filter((r) => !r.due_date && !r.is_done)
        .map((r) => ({
          key: `reminder-${r.id}`,
          kind: 'reminder' as const,
          title: r.title,
          courseId: null,
          courseName: null,
          time: null,
          done: false,
          sourceId: r.id,
        })),
    [reminders],
  )

  const summary = useMemo(() => {
    const all = [...agenda.values()].flat()
    return {
      exams: all.filter((i) => i.kind === 'exam').length,
      due: all.filter((i) => i.kind === 'assignment' && !i.done).length,
      sessions: all.filter((i) => i.kind === 'session').length,
    }
  }, [agenda])

  const goToWeek = (d: Date | null) => {
    const next = new URLSearchParams(params)
    if (d) next.set('week', dateKey(d))
    else next.delete('week')
    setParams(next, { replace: true })
  }

  if (coursesLoading || sessionsLoading || examsLoading || itemsLoading) return <PageSkeleton variant="list" />

  const summaryParts = [
    summary.exams && (summary.exams === 1 ? 'מבחן אחד' : `${summary.exams} מבחנים`),
    summary.due && (summary.due === 1 ? 'הגשה אחת' : `${summary.due} הגשות`),
    summary.sessions && (summary.sessions === 1 ? 'מפגש אחד' : `${summary.sessions} מפגשים`),
  ].filter(Boolean)

  return (
    <div>
      <div className="sch-header">
        <div>
          <h1>לו״ז</h1>
          <p className="sch-range">{formatWeekRange(weekStart)}</p>
        </div>
        <nav className="sch-nav" aria-label="ניווט בין שבועות">
          <button type="button" className="sch-nav__btn" onClick={() => goToWeek(addDays(weekStart, -7))} aria-label="השבוע הקודם">
            <Chevron direction="right" />
          </button>
          <button type="button" className="sch-nav__today" onClick={() => goToWeek(null)} disabled={isCurrentWeek}>
            השבוע
          </button>
          <button type="button" className="sch-nav__btn" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="השבוע הבא">
            <Chevron direction="left" />
          </button>
        </nav>
      </div>

      <p className="sch-summary">{summaryParts.length ? `השבוע: ${summaryParts.join(', ')}` : 'שבוע פנוי - אין מבחנים, הגשות או מפגשים'}</p>

      <ol className="sch-days">
        {days.map((day) => {
          const key = dateKey(day)
          const items = agenda.get(key) ?? []
          const isToday = key === todayKey
          const isPast = key < todayKey
          return (
            <li key={key} className={`sch-day${isToday ? ' sch-day--today' : ''}${isPast ? ' sch-day--past' : ''}`} aria-current={isToday ? 'date' : undefined}>
              <div className="sch-day__date">
                <span className="sch-day__name">{WEEKDAY_NAMES[day.getDay()]}</span>
                <span className="sch-day__num">{day.getDate()}</span>
                {isToday && <span className="sch-day__today">היום</span>}
              </div>
              <div className="sch-day__items">
                {items.length === 0 ? (
                  <p className="sch-day__empty">—</p>
                ) : (
                  items.map((item) => <AgendaRow key={item.key} item={item} />)
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {undatedReminders.length > 0 && (
        <section className="sch-undated" aria-labelledby="sch-undated-title">
          <h2 id="sch-undated-title">תזכורות בלי תאריך</h2>
          <div className="sch-undated__list">
            {undatedReminders.map((item) => (
              <AgendaRow key={item.key} item={item} timeLabel="בלי תאריך" />
            ))}
          </div>
        </section>
      )}

      {(sessions ?? []).length === 0 && (
        <p className="sch-hint">
          מפגשי הנחיה והרצאות קבועות מוסיפים בעמוד של כל קורס, במדור "מפגשים קבועים", והם יופיעו כאן בכל שבוע.
        </p>
      )}

      <section className="sch-export" aria-labelledby="sch-export-title">
        <h2 id="sch-export-title">ייצוא ליומן</h2>
        <CalendarExport />
      </section>
    </div>
  )
}

/** חץ SVG ולא תו ‹ › - תווים כאלה מתהפכים אוטומטית בטקסט RTL, והכיוון יוצא הפוך.
 * בעברית "הקודם" מצביע ימינה ו"הבא" שמאלה. */
function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={direction === 'right' ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
    </svg>
  )
}

function AgendaRow({ item, timeLabel = 'כל היום' }: { item: AgendaItem; timeLabel?: string }) {
  const color = courseColor(item.courseId)
  const body = (
    <>
      <span className="sch-item__time">
        {item.time ? (
          <>
            {item.time}
            {item.endTime && <span className="sch-item__end">{item.endTime}</span>}
          </>
        ) : (
          <span className="sch-item__allday">{timeLabel}</span>
        )}
      </span>
      <span className="sch-item__main">
        <span className={`sch-item__title${item.done ? ' sch-item__title--done' : ''}`}>
          {item.kind === 'exam' ? `מבחן: ${item.courseName ?? ''}` : item.title}
        </span>
        <span className="sch-item__sub">
          <span className={`sch-tag sch-tag--${item.kind}`}>{AGENDA_KIND_LABEL[item.kind]}</span>
          {item.mandatory && !item.done && <span className="sch-tag sch-tag--mandatory">חובה</span>}
          {item.kind !== 'exam' && item.courseName && <span>{item.courseName}</span>}
          {item.location && <span>{item.location}</span>}
        </span>
      </span>
    </>
  )

  return (
    <div className="sch-item" style={{ ['--course-color' as string]: color }}>
      {item.kind === 'assignment' && item.courseId != null ? (
        <AssignmentCheck courseId={item.courseId} itemId={item.sourceId} done={!!item.done} title={item.title} />
      ) : item.kind === 'reminder' ? (
        <ReminderCheck id={item.sourceId} done={!!item.done} title={item.title} />
      ) : (
        <span className="sch-item__check" aria-hidden />
      )}
      {item.courseId != null ? (
        <Link to={`/courses/${item.courseId}`} className="sch-item__link">
          {body}
        </Link>
      ) : (
        <span className="sch-item__link">{body}</span>
      )}
    </div>
  )
}

function AssignmentCheck({ courseId, itemId, done, title }: { courseId: number; itemId: number; done: boolean; title: string }) {
  const update = useUpdateCourseItem(courseId)
  return (
    <input
      type="checkbox"
      className="sch-item__check"
      checked={done}
      aria-label={`הוגשה: ${title}`}
      onChange={(e) => update.mutate({ id: itemId, payload: { is_done: e.target.checked } })}
    />
  )
}

function ReminderCheck({ id, done, title }: { id: number; done: boolean; title: string }) {
  const update = useUpdateReminder()
  return (
    <input
      type="checkbox"
      className="sch-item__check"
      checked={done}
      aria-label={`בוצע: ${title}`}
      onChange={(e) => update.mutate({ id, payload: { is_done: e.target.checked } })}
    />
  )
}
