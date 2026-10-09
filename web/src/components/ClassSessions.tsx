import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, DateInput, EmptyState, IconButton, Input, TimeInput } from '@/components/ui'
import { useCourseSessions, useCreateSession, useDeleteSession, useUpdateSession } from '@/lib/queries'
import type { ClassSessionPayload } from '@/lib/queries'
import { WEEKDAY_NAMES, WEEKDAY_SHORT } from '@/lib/schedule'
import type { ClassSessionRead } from '@/lib/types'
import './ClassSessions.css'

function describe(s: ClassSessionRead): string {
  const parts = [`יום ${WEEKDAY_NAMES[s.weekday]}`, `${s.start_time}–${s.end_time}`]
  if (s.interval_weeks === 2) parts.push('כל שבועיים')
  else if (s.interval_weeks > 2) parts.push(`כל ${s.interval_weeks} שבועות`)
  return parts.join(' · ')
}

function formatShortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

/** מדור "מפגשים קבועים" במסך הקורס - מפגשי הנחיה / הרצאות / תרגולים שחוזרים כל שבוע או כל כמה שבועות. */
export function ClassSessions({ courseId }: { courseId: number }) {
  const { sessions, isLoading } = useCourseSessions(courseId)
  const createSession = useCreateSession(courseId)
  const deleteSession = useDeleteSession()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)

  return (
    <div className="cd-section">
      <div className="cd-section-header">
        <h2>מפגשים קבועים</h2>
      </div>
      <Card>
        {!isLoading && sessions.length === 0 && !adding && (
          <EmptyState title="אין מפגשים קבועים" subtitle="מפגשי הנחיה, הרצאות או תרגולים - יופיעו בלו״ז השבועי" />
        )}
        {sessions.map((s) =>
          editingId === s.id ? (
            <SessionForm key={s.id} initial={s} onDone={() => setEditingId(null)} />
          ) : (
            <div key={s.id} className="cd-row">
              <div className="cs-day" aria-hidden>
                {WEEKDAY_SHORT[s.weekday]}
              </div>
              <div className="cd-item__body">
                <p className="cd-row__title">{s.title || 'מפגש'}</p>
                <p className="cs-meta">
                  {describe(s)}
                  {s.location && ` · ${s.location}`}
                </p>
                {(s.start_date || s.end_date) && (
                  <p className="cs-meta">
                    {s.start_date && `מ-${formatShortDate(s.start_date)}`}
                    {s.start_date && s.end_date && ' '}
                    {s.end_date && `עד ${formatShortDate(s.end_date)}`}
                  </p>
                )}
              </div>
              <div className="cd-row__actions">
                <IconButton icon="edit" label={`עריכת ${s.title || 'המפגש'}`} onClick={() => setEditingId(s.id)} />
                <IconButton
                  icon="delete"
                  tone="danger"
                  label={`מחיקת ${s.title || 'המפגש'}`}
                  onClick={() => {
                    if (confirm('למחוק את המפגש הקבוע?')) deleteSession.mutate(s.id)
                  }}
                />
              </div>
            </div>
          ),
        )}
        {adding ? (
          <SessionForm onDone={() => setAdding(false)} create={(p) => createSession.mutateAsync(p)} />
        ) : (
          <div className="ap-add-buttons">
            <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
              + מפגש קבוע
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

function SessionForm({
  initial,
  onDone,
  create,
}: {
  initial?: ClassSessionRead
  onDone: () => void
  create?: (payload: ClassSessionPayload) => Promise<unknown>
}) {
  const updateSession = useUpdateSession()
  const [weekday, setWeekday] = useState(String(initial?.weekday ?? 0))
  const [start, setStart] = useState(initial?.start_time ?? '18:00')
  const [end, setEnd] = useState(initial?.end_time ?? '20:00')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [location, setLocation] = useState(initial?.location ?? '')
  const [interval, setIntervalWeeks] = useState(String(initial?.interval_weeks ?? 1))
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!start || !end || end <= start) return setError('שעת הסיום צריכה להיות אחרי שעת ההתחלה')
    if (Number(interval) > 1 && !startDate) return setError('במפגש כל שבועיים צריך תאריך של המפגש הראשון')
    if (startDate && endDate && endDate < startDate) return setError('תאריך הסיום לפני תאריך ההתחלה')
    const payload: ClassSessionPayload = {
      weekday: Number(weekday),
      start_time: start,
      end_time: end,
      title: title.trim() || null,
      location: location.trim() || null,
      interval_weeks: Number(interval),
      start_date: startDate || null,
      end_date: endDate || null,
    }
    setBusy(true)
    try {
      if (initial) await updateSession.mutateAsync({ id: initial.id, payload })
      else await create?.(payload)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="cs-form" onSubmit={handleSubmit}>
      <div className="cs-form__grid">
        <label className="cd-field">
          סוג המפגש
          <Input placeholder="מפגש הנחיה" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
        </label>
        <label className="cd-field">
          יום
          <select value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="cd-field">
          משעה
          <TimeInput label="משעה" value={start} onChange={setStart} required />
        </div>
        <div className="cd-field">
          עד שעה
          <TimeInput label="עד שעה" value={end} onChange={setEnd} required />
        </div>
        <label className="cd-field">
          תדירות
          <select value={interval} onChange={(e) => setIntervalWeeks(e.target.value)}>
            <option value="1">כל שבוע</option>
            <option value="2">כל שבועיים</option>
            <option value="3">כל 3 שבועות</option>
            <option value="4">כל 4 שבועות</option>
          </select>
        </label>
        <label className="cd-field">
          מיקום
          <Input placeholder="למשל: רעננה / זום" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} />
        </label>
        <label className="cd-field">
          {Number(interval) > 1 ? 'תאריך המפגש הראשון' : 'מתאריך (לא חובה)'}
          <DateInput label="תאריך התחלה" value={startDate} onChange={setStartDate} />
        </label>
        <label className="cd-field">
          עד תאריך (לא חובה)
          <DateInput label="תאריך סיום" value={endDate} onChange={setEndDate} />
        </label>
      </div>
      {error && (
        <p className="cd-form-error" role="alert">
          {error}
        </p>
      )}
      <div className="ap-form__actions">
        <Button type="submit" disabled={busy}>
          {initial ? 'שמירה' : 'הוספה'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
