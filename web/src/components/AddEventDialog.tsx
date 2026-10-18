import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, DateInput, Input, TimeInput } from '@/components/ui'
import { useAddCourseItem, useAddReminder, useCourses, useCreateExam, useCreateSession } from '@/lib/queries'
import { parseDateKey } from '@/lib/schedule'
import type { ExamTerm } from '@/lib/types'
import './AddEventDialog.css'

type AddEventType = 'assignment' | 'exam' | 'session' | 'reminder' | 'other'

const TYPES: { id: AddEventType; label: string }[] = [
  { id: 'assignment', label: 'הגשת מטלה' },
  { id: 'exam', label: 'מבחן' },
  { id: 'session', label: 'מפגש' },
  { id: 'reminder', label: 'תזכורת' },
  { id: 'other', label: 'אחר' },
]

const DEFAULT_TIME: Record<AddEventType, string> = {
  assignment: '23:59',
  exam: '09:00',
  session: '18:00',
  reminder: '09:00',
  other: '10:00',
}

const ADD_EVENT_LABEL = Object.fromEntries(TYPES.map((t) => [t.id, t.label])) as Record<AddEventType, string>

/** "YYYY-MM-DD" + "HH:mm" (שעון מקומי) -> ISO */
const toIso = (date: string, time: string) => new Date(`${date}T${time}`).toISOString()

/** הוספה ללו"ז: בוחרים סוג, והשדות משתנים לפיו. בטלפון נפתח כמגירה מלמטה, במחשב כחלון באמצע.
 * מרנדרים אותו רק כשהוא פתוח. */
export function AddEventDialog({
  defaultDate,
  onClose,
  onAdded,
}: {
  /** "YYYY-MM-DD" */
  defaultDate: string
  onClose: () => void
  /** label = שם הסוג, date = YYYY-MM-DD */
  onAdded: (label: string, date: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { data: courses } = useCourses()
  // קורסים שלומדים עכשיו קודם - אליהם מוסיפים כמעט תמיד
  const courseOptions = useMemo(() => {
    const list = [...(courses ?? [])].filter((c) => c.status !== 'done')
    return list.sort((a, b) => Number(b.status === 'current') - Number(a.status === 'current'))
  }, [courses])

  const [type, setType] = useState<AddEventType>('assignment')
  const [title, setTitle] = useState('')
  const [pickedCourseId, setCourseId] = useState<number | null>(null)
  const [date, setDate] = useState(defaultDate)
  const [time, setTime] = useState(DEFAULT_TIME.assignment)
  const [endTime, setEndTime] = useState('20:00')
  const [location, setLocation] = useState('')
  const [term, setTerm] = useState<ExamTerm>('a')
  const [repeat, setRepeat] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const courseId = pickedCourseId ?? courseOptions[0]?.id ?? null
  const addItem = useAddCourseItem(courseId ?? 0)
  const createExam = useCreateExam(courseId ?? 0)
  const createSession = useCreateSession(courseId ?? 0)
  const addReminder = useAddReminder()

  // החלון מורכב רק כשפותחים אותו - אז ה-state מתחיל נקי בכל פתיחה
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const needsCourse = type === 'assignment' || type === 'exam' || type === 'session'
  const hasTitle = type === 'assignment' || type === 'reminder' || type === 'other' || type === 'session'
  const hasPlace = type === 'exam' || type === 'session' || type === 'other'
  const noCourses = needsCourse && courseOptions.length === 0

  function pickType(next: AddEventType) {
    setType(next)
    setTime(DEFAULT_TIME[next])
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!date) return setError('צריך לבחור תאריך')
    if (needsCourse && courseId == null) return setError('צריך לבחור קורס')
    if ((type === 'reminder' || type === 'other') && !title.trim()) return setError('צריך לכתוב מה להוסיף')
    if (type === 'session' && endTime <= time) return setError('שעת הסיום צריכה להיות אחרי שעת ההתחלה')
    setBusy(true)
    try {
      if (type === 'assignment') {
        await addItem.mutateAsync({ type: 'assignment', title: title.trim() || 'מטלה', due_date: toIso(date, time) })
      } else if (type === 'exam') {
        await createExam.mutateAsync({ date_time: toIso(date, time), location: location.trim() || null, term })
      } else if (type === 'session') {
        await createSession.mutateAsync({
          weekday: parseDateKey(date).getDay(),
          start_time: time,
          end_time: endTime,
          title: title.trim() || null,
          location: location.trim() || null,
          interval_weeks: 1,
          start_date: date,
          // מפגש חד-פעמי = מפגש קבוע שמתחיל ונגמר באותו יום
          end_date: repeat ? null : date,
        })
      } else {
        // "אחר" נשמר כתזכורת אישית עם תאריך ושעה; המיקום נכנס לכותרת
        const text = type === 'other' && location.trim() ? `${title.trim()} · ${location.trim()}` : title.trim()
        await addReminder.mutateAsync({ title: text, due_date: toIso(date, time) })
      }
      onAdded(ADD_EVENT_LABEL[type], date)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="aev" aria-labelledby="aev-title" onClose={onClose} onCancel={onClose}>
      <form className="aev__form" onSubmit={handleSubmit}>
        <span className="aev__grab" aria-hidden />
        <div className="aev__head">
          <h2 id="aev-title">הוספה ללו״ז</h2>
          <button type="button" className="aev__close" aria-label="סגירה" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="aev__types" role="radiogroup" aria-label="סוג">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={type === t.id}
              className={`aev__type aev__type--${t.id}${type === t.id ? ' aev__type--on' : ''}`}
              onClick={() => pickType(t.id)}
            >
              <span className="aev__type-dot" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>

        {noCourses ? (
          <p className="aev__empty">
            עוד אין קורסים פעילים. <Link to="/courses" onClick={onClose}>הוספת קורס</Link> ואז אפשר להוסיף לו {ADD_EVENT_LABEL[type]}.
          </p>
        ) : (
          <>
            <div className="aev__row">
              {hasTitle && (
                <label className="aev__field">
                  {type === 'assignment' ? 'שם המטלה' : type === 'session' ? 'סוג המפגש (לא חובה)' : type === 'reminder' ? 'מה להזכיר?' : 'שם'}
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={200}
                    placeholder={
                      type === 'assignment' ? 'ממ"ן 12' : type === 'session' ? 'מפגש הנחיה' : type === 'reminder' ? 'לבקש דחייה בממ"ן 13' : 'למשל: שעת קבלה'
                    }
                  />
                </label>
              )}
              {needsCourse && (
                <label className="aev__field">
                  קורס
                  <select value={courseId ?? ''} onChange={(e) => setCourseId(Number(e.target.value))}>
                    {courseOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {type === 'exam' && (
              <div className="aev__field">
                מועד
                <div className="aev__seg" role="radiogroup" aria-label="מועד">
                  {(
                    [
                      ['a', "מועד א'"],
                      ['b', "מועד ב'"],
                      ['special', 'מיוחד'],
                    ] as const
                  ).map(([id, label]) => (
                    <button key={id} type="button" role="radio" aria-checked={term === id} className={term === id ? 'aev__seg--on' : ''} onClick={() => setTerm(id)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="aev__row aev__row--when">
              <div className="aev__field aev__field--date">
                תאריך
                <DateInput label="תאריך" value={date} onChange={setDate} required />
              </div>
              <div className="aev__field">
                {type === 'assignment' ? 'עד שעה' : type === 'session' ? 'משעה' : 'שעה'}
                <TimeInput label="שעה" value={time} onChange={setTime} required />
              </div>
              {type === 'session' && (
                <div className="aev__field">
                  עד
                  <TimeInput label="עד שעה" value={endTime} onChange={setEndTime} required />
                </div>
              )}
            </div>

            {hasPlace && (
              <label className="aev__field">
                {type === 'other' ? 'מיקום (לא חובה)' : 'מיקום'}
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  maxLength={100}
                  placeholder={type === 'session' ? 'כיתה, עיר או זום' : type === 'exam' ? 'למשל: רעננה' : ''}
                />
              </label>
            )}

            {type === 'session' && (
              <label className="aev__check">
                <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />
                חוזר כל שבוע
              </label>
            )}
          </>
        )}

        {error && (
          <p className="aev__error" role="alert">
            {error}
          </p>
        )}

        <div className="aev__actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" disabled={busy || noCourses}>
            {busy ? 'שומר…' : 'הוספה'}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
