import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { AddEventDialog } from '@/components/AddEventDialog'
import { CalendarExport } from '@/components/CalendarExport'
import { ScheduleReminders } from '@/components/ScheduleReminders'
import { PageSkeleton } from '@/components/Skeleton'
import { useAllCourseItems, useAllSessions, useCourses, useExams, useReminders, useUpdateCourseItem, useUpdateReminder } from '@/lib/queries'
import {
  AGENDA_KIND_LABEL,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  addDays,
  buildAgenda,
  courseColor,
  dateKey,
  defaultWeekStart,
  examTitle,
  formatWeekRange,
  parseDateKey,
  startOfWeek,
  weekDays,
} from '@/lib/schedule'
import type { AgendaItem, AgendaKind } from '@/lib/schedule'
import { useMediaQuery } from '@/lib/useMediaQuery'
import './Schedule.css'

type Filter = 'all' | 'assignment' | 'exam' | 'session' | 'reminder'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכול' },
  { id: 'assignment', label: 'הגשות' },
  { id: 'exam', label: 'מבחנים' },
  { id: 'session', label: 'מפגשים' },
  { id: 'reminder', label: 'תזכורות' },
]

/** דבר שמחכה אחרי השבוע המוצג (כרטיס "בהמשך") */
interface LaterItem {
  key: string
  kind: AgendaKind
  title: string
  courseId: number | null
  courseName: string | null
  date: Date
}

/** לו"ז שבועי: מפגשים קבועים, מבחנים, הגשות ותזכורות. בטלפון רשימה של הימים שיש בהם משהו,
 * במחשב טבלת שבוע של 7 עמודות. */
export default function Schedule() {
  const [params, setParams] = useSearchParams()
  const weekParam = params.get('week')
  // "עכשיו" נקבע פעם אחת בטעינת המסך - מספיק ללו"ז, ושומר על רינדור יציב
  const [now] = useState(() => new Date())
  const weekStart = useMemo(() => {
    return weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? startOfWeek(parseDateKey(weekParam)) : defaultWeekStart(now)
  }, [weekParam, now])
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const todayKey = dateKey(now)
  const isCurrentWeek = dateKey(startOfWeek(now)) === dateKey(weekStart)
  // בשישי ובשבת הלו"ז נפתח על השבוע הבא - מסבירים למה
  const showingNextByDefault = !weekParam && !isCurrentWeek && dateKey(defaultWeekStart(now)) === dateKey(weekStart)
  const wide = useMediaQuery('(min-width: 900px)')

  const [filter, setFilter] = useState<Filter>('all')
  const [syncOpen, setSyncOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2500)
    return () => clearTimeout(t)
  }, [toast])

  const { data: courses, isLoading: coursesLoading } = useCourses()
  const { data: sessions, isLoading: sessionsLoading } = useAllSessions()
  const { data: exams, isLoading: examsLoading } = useExams()
  const { data: assignments, isLoading: itemsLoading } = useAllCourseItems({ type: 'assignment' })
  const { data: reminders } = useReminders()

  const courseName = useMemo(() => {
    const names = new Map((courses ?? []).map((c) => [c.id, c.name]))
    return (id: number) => names.get(id) ?? null
  }, [courses])

  const agenda = useMemo(
    () =>
      buildAgenda(days, {
        sessions: sessions ?? [],
        exams: exams ?? [],
        assignments: assignments ?? [],
        reminders: reminders ?? [],
        courseName,
      }),
    [days, sessions, exams, assignments, reminders, courseName],
  )

  const summary = useMemo(() => {
    const all = [...agenda.values()].flat()
    return {
      exams: all.filter((i) => i.kind === 'exam').length,
      due: all.filter((i) => i.kind === 'assignment' && !i.done).length,
      sessions: all.filter((i) => i.kind === 'session').length,
    }
  }, [agenda])

  // מבחנים, הגשות ותזכורות פתוחות שאחרי השבוע המוצג - כדי שהלו"ז לא ייראה ריק כשהשבוע פנוי
  const later = useMemo<LaterItem[]>(() => {
    const after = addDays(weekStart, 7).getTime()
    const items: LaterItem[] = []
    for (const e of exams ?? []) {
      const date = new Date(e.date_time)
      if (date.getTime() >= after)
        items.push({ key: `exam-${e.id}`, kind: 'exam', title: examTitle(e.term), courseId: e.course_id, courseName: courseName(e.course_id), date })
    }
    for (const a of assignments ?? []) {
      if (!a.due_date || a.is_done) continue
      const date = new Date(a.due_date)
      if (date.getTime() >= after)
        items.push({ key: `assignment-${a.id}`, kind: 'assignment', title: a.title, courseId: a.course_id, courseName: courseName(a.course_id), date })
    }
    for (const r of reminders ?? []) {
      if (!r.due_date || r.is_done) continue
      const date = new Date(r.due_date)
      if (date.getTime() >= after) items.push({ key: `reminder-${r.id}`, kind: 'reminder', title: r.title, courseId: null, courseName: null, date })
    }
    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [weekStart, exams, assignments, reminders, courseName])

  // הגעה מ-/reminders (או קישור עם #reminders) - גוללים לרשימת התזכורות אחרי שהעמוד נטען
  const { hash } = useLocation()
  const loading = coursesLoading || sessionsLoading || examsLoading || itemsLoading
  useEffect(() => {
    if (!loading && hash === '#reminders') document.getElementById('reminders')?.scrollIntoView({ block: 'start' })
  }, [loading, hash])

  const goToWeek = (d: Date | null) => {
    const next = new URLSearchParams(params)
    if (d) next.set('week', dateKey(d))
    else next.delete('week')
    setParams(next, { replace: true })
  }

  function handleAdded(label: string, date: string) {
    setAdding(false)
    setToast(`נוסף ללו״ז: ${label}`)
    // אם הוסיפו משהו לשבוע אחר - עוברים אליו, כדי לראות אותו מיד
    if (!days.some((d) => dateKey(d) === date)) goToWeek(startOfWeek(parseDateKey(date)))
  }

  if (loading) return <PageSkeleton variant="list" />

  const summaryParts = [
    summary.exams && (summary.exams === 1 ? 'מבחן אחד' : `${summary.exams} מבחנים`),
    summary.due && (summary.due === 1 ? 'הגשה אחת' : `${summary.due} הגשות`),
    summary.sessions && (summary.sessions === 1 ? 'מפגש אחד' : `${summary.sessions} מפגשים`),
  ].filter(Boolean)
  const summaryText = summaryParts.length ? summaryParts.join(', ') : 'שבוע פנוי'
  const defaultDate = days.some((d) => dateKey(d) === todayKey) ? todayKey : dateKey(weekStart)
  const matches = (item: AgendaItem) => filter === 'all' || item.kind === filter

  const prevWeek = (
    <button type="button" className="sch-nav__btn" onClick={() => goToWeek(addDays(weekStart, -7))} aria-label="השבוע הקודם">
      <Chevron direction="right" />
    </button>
  )
  const nextWeek = (
    <button type="button" className="sch-nav__btn" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="השבוע הבא">
      <Chevron direction="left" />
    </button>
  )

  return (
    <div className={`sch${wide ? ' sch--wide' : ''}`}>
      <div className="sch-header">
        <div>
          <h1>לו״ז</h1>
          <p className="sch-sub">
            <span className="sch-sub__range">{formatWeekRange(weekStart)}</span> · {summaryText}
          </p>
        </div>
        {wide ? (
          <div className="sch-tools">
            <div className="sch-filters" role="radiogroup" aria-label="סינון">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  aria-checked={filter === f.id}
                  className={`sch-filter${filter === f.id ? ' sch-filter--on' : ''}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <nav className="sch-nav" aria-label="ניווט בין שבועות">
              {prevWeek}
              <button type="button" className="sch-nav__today" onClick={() => goToWeek(startOfWeek(now))} disabled={isCurrentWeek}>
                היום
              </button>
              {nextWeek}
            </nav>
            <button type="button" className="ui-button ui-button--primary sch-add" onClick={() => setAdding(true)}>
              <PlusIcon size={18} />
              הוספה
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`sch-sync-toggle${syncOpen ? ' sch-sync-toggle--on' : ''}`}
            aria-label="סנכרון עם היומן"
            aria-expanded={syncOpen}
            onClick={() => setSyncOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
            </svg>
          </button>
        )}
      </div>

      {showingNextByDefault && <p className="sch-note">השבוע הנוכחי כמעט נגמר, אז מוצג השבוע הבא.</p>}

      {!wide && syncOpen && (
        <section className="sch-sync" aria-label="סנכרון עם היומן">
          <CalendarExport />
        </section>
      )}

      {wide ? (
        <div className="sch-grid-wrap">
          <ol className="sch-grid">
            {days.map((day) => {
              const key = dateKey(day)
              const items = (agenda.get(key) ?? []).filter(matches)
              const isToday = key === todayKey
              return (
                <li
                  key={key}
                  className={`sch-col${isToday ? ' sch-col--today' : ''}${key < todayKey ? ' sch-col--past' : ''}`}
                  aria-current={isToday ? 'date' : undefined}
                >
                  <div className="sch-col__head">
                    <span className="sch-col__date">
                      <span className="sch-col__name">{WEEKDAY_NAMES[day.getDay()]}</span>
                      <span className="sch-col__num">{day.getDate()}</span>
                    </span>
                    {isToday && <span className="sch-today-tag">היום</span>}
                  </div>
                  {items.length === 0 ? <p className="sch-col__free">פנוי</p> : items.map((item) => <EventCard key={item.key} item={item} />)}
                </li>
              )
            })}
          </ol>
        </div>
      ) : (
        <>
          <div className="sch-strip">
            {prevWeek}
            <ol className="sch-strip__days">
              {days.map((day) => {
                const key = dateKey(day)
                const colors = [...new Set((agenda.get(key) ?? []).map((i) => courseColor(i.courseId)))].slice(0, 3)
                return (
                  <li key={key} className={`sch-strip__day${key === todayKey ? ' sch-strip__day--today' : ''}`} aria-label={`${WEEKDAY_NAMES[day.getDay()]} ${day.getDate()}`}>
                    <span className="sch-strip__letter" aria-hidden>
                      {WEEKDAY_SHORT[day.getDay()]}
                    </span>
                    <span className="sch-strip__num" aria-hidden>
                      {day.getDate()}
                    </span>
                    <span className="sch-strip__dots" aria-hidden>
                      {colors.map((c) => (
                        <span key={c} style={{ background: c }} />
                      ))}
                    </span>
                  </li>
                )
              })}
            </ol>
            {nextWeek}
          </div>
          {!isCurrentWeek && (
            <button type="button" className="sch-back-today" onClick={() => goToWeek(null)}>
              חזרה להיום
            </button>
          )}
          <MobileAgenda days={days} agenda={agenda} todayKey={todayKey} />
        </>
      )}

      <div className="sch-bottom">
        {later.length > 0 && (
          <section className="sch-later" aria-labelledby="sch-later-title">
            <div className="sch-section-head">
              <h2 id="sch-later-title">בהמשך</h2>
              <Link to="/exams">כל המבחנים ←</Link>
            </div>
            <div className="sch-card">
              {later.slice(0, wide ? 5 : 3).map((item) => (
                <LaterRow key={item.key} item={item} />
              ))}
            </div>
          </section>
        )}
        {wide && (
          <section className="sch-export" aria-labelledby="sch-export-title">
            <div className="sch-section-head">
              <h2 id="sch-export-title">סנכרון עם היומן</h2>
            </div>
            <CalendarExport />
          </section>
        )}
      </div>

      <ScheduleReminders reminders={reminders ?? []} now={now} />

      {(sessions ?? []).length === 0 && (
        <p className="sch-hint">מפגשי הנחיה קבועים אפשר להוסיף כאן עם "+", או בעמוד של כל קורס. הם יופיעו בכל שבוע.</p>
      )}

      {!wide && (
        <button type="button" className="sch-fab" aria-label="הוספה ללו״ז" onClick={() => setAdding(true)}>
          <PlusIcon size={26} />
        </button>
      )}

      {adding && <AddEventDialog defaultDate={defaultDate} onClose={() => setAdding(false)} onAdded={handleAdded} />}

      {toast && (
        <p className="sch-toast" role="status">
          {toast}
        </p>
      )}
    </div>
  )
}

/** טלפון: רק ימים שיש בהם משהו. רצף של ימים ריקים מתכווץ לשורה אחת ("שני–רביעי · אין כלום"). */
function MobileAgenda({ days, agenda, todayKey }: { days: Date[]; agenda: Map<string, AgendaItem[]>; todayKey: string }) {
  const blocks: ({ type: 'free'; label: string; key: string } | { type: 'day'; day: Date; items: AgendaItem[] })[] = []
  let run: Date[] = []
  const flush = () => {
    if (!run.length) return
    const first = WEEKDAY_NAMES[run[0].getDay()]
    const label = run.length === 1 ? `${first} ${run[0].getDate()}` : `${first}–${WEEKDAY_NAMES[run[run.length - 1].getDay()]}`
    blocks.push({ type: 'free', label: `${label} · אין כלום`, key: `free-${dateKey(run[0])}` })
    run = []
  }
  for (const day of days) {
    const items = agenda.get(dateKey(day)) ?? []
    if (items.length === 0) {
      run.push(day)
      continue
    }
    flush()
    blocks.push({ type: 'day', day, items })
  }
  flush()

  return (
    <div className="sch-agenda">
      {blocks.map((b) => {
        if (b.type === 'free') {
          return (
            <p key={b.key} className="sch-agenda__free">
              {b.label}
            </p>
          )
        }
        const key = dateKey(b.day)
        const isToday = key === todayKey
        const name = `${WEEKDAY_NAMES[b.day.getDay()]} ${b.day.getDate()}`
        return (
          <section key={key} className={`sch-agenda__day${key < todayKey ? ' sch-agenda__day--past' : ''}`} aria-current={isToday ? 'date' : undefined}>
            <h2 className={`sch-agenda__label${isToday ? ' sch-agenda__label--today' : ''}`}>{isToday ? `היום, ${name}` : name}</h2>
            <div className="sch-card">
              {b.items.map((item) => (
                <AgendaRow key={item.key} item={item} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** "18:00–20:00" / "09:00" / "" (הגשה - בלי שעה) */
function timeText(item: AgendaItem): string {
  if (!item.time) return ''
  return item.endTime ? `${item.time}–${item.endTime}` : item.time
}

function metaText(item: AgendaItem): string {
  // במבחן הכותרת כבר אומרת "מבחן"
  const parts: string[] = item.kind === 'exam' ? [] : [AGENDA_KIND_LABEL[item.kind]]
  if (item.courseName) parts.push(item.courseName)
  if (item.location) parts.push(item.location)
  return parts.join(' · ')
}

/** שורה ברשימת היום (טלפון) */
function AgendaRow({ item }: { item: AgendaItem }) {
  const body = (
    <>
      <span className="sch-row__main">
        <span className={`sch-row__title${item.done ? ' sch-row__title--done' : ''}`}>
          {item.title}
          {item.mandatory && !item.done && <span className="sch-mandatory">חובה</span>}
        </span>
        <span className="sch-row__meta">{metaText(item)}</span>
      </span>
      {item.time && <span className="sch-row__time">{item.time}</span>}
    </>
  )
  return (
    <div className="sch-row" style={{ ['--course-color' as string]: courseColor(item.courseId) }}>
      <ItemCheck item={item} />
      {item.courseId != null ? (
        <Link to={`/courses/${item.courseId}`} className="sch-row__link">
          {body}
        </Link>
      ) : (
        <span className="sch-row__link">{body}</span>
      )}
    </div>
  )
}

/** כרטיס אירוע בעמודת יום (מחשב) */
function EventCard({ item }: { item: AgendaItem }) {
  const time = timeText(item)
  return (
    <div className={`sch-ev${item.done ? ' sch-ev--done' : ''}`} style={{ ['--course-color' as string]: courseColor(item.courseId) }}>
      <div className="sch-ev__top">
        <ItemCheck item={item} />
        <span className="sch-ev__time" dir="ltr">
          {time}
        </span>
        <span className={`sch-tag sch-tag--${item.kind}`}>{AGENDA_KIND_LABEL[item.kind]}</span>
      </div>
      {item.courseId != null ? (
        <Link to={`/courses/${item.courseId}`} className="sch-ev__title">
          {item.title}
        </Link>
      ) : (
        <span className="sch-ev__title">{item.title}</span>
      )}
      {item.courseName && (
        <span className="sch-ev__course">
          <span className="sch-ev__dot" aria-hidden />
          {item.courseName}
        </span>
      )}
      {item.location && <span className="sch-ev__meta">{item.location}</span>}
      {item.mandatory && !item.done && <span className="sch-mandatory">חובה</span>}
    </div>
  )
}

function LaterRow({ item }: { item: LaterItem }) {
  const body = (
    <>
      <span className="sch-later__date">
        <b>{item.date.getDate()}</b>
        <span>{item.date.toLocaleDateString('he-IL', { month: 'short' })}</span>
      </span>
      <span className="sch-row__main">
        <span className="sch-row__title">{item.title}</span>
        <span className="sch-row__meta">{[AGENDA_KIND_LABEL[item.kind], item.courseName].filter(Boolean).join(' · ')}</span>
      </span>
    </>
  )
  return (
    <div className="sch-row" style={{ ['--course-color' as string]: courseColor(item.courseId) }}>
      {item.courseId != null ? (
        <Link to={`/courses/${item.courseId}`} className="sch-row__link">
          {body}
        </Link>
      ) : (
        <span className="sch-row__link">{body}</span>
      )}
    </div>
  )
}

/** מטלה ותזכורת אפשר לסמן מכאן. לשאר - פס הצבע של הקורס */
function ItemCheck({ item }: { item: AgendaItem }) {
  if (item.kind === 'assignment' && item.courseId != null) return <AssignmentCheck courseId={item.courseId} itemId={item.sourceId} done={!!item.done} title={item.title} />
  if (item.kind === 'reminder') return <ReminderCheck id={item.sourceId} done={!!item.done} title={item.title} />
  return <span className="sch-check sch-check--bar" aria-hidden />
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

function PlusIcon({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function AssignmentCheck({ courseId, itemId, done, title }: { courseId: number; itemId: number; done: boolean; title: string }) {
  const update = useUpdateCourseItem(courseId)
  return (
    <input
      type="checkbox"
      className="sch-check"
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
      className="sch-check"
      checked={done}
      aria-label={`בוצע: ${title}`}
      onChange={(e) => update.mutate({ id, payload: { is_done: e.target.checked } })}
    />
  )
}
