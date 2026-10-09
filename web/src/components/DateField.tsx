import { useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { he } from 'react-day-picker/locale'
import 'react-day-picker/style.css'
import './DateField.css'

/* בורר תאריך/שעה משלנו במקום <input type="date|datetime-local|time"> - השדות
 * הנייטיביים מתנהגים אחרת בכל דפדפן (וב-RTL ובאייפון במיוחד). הערכים נשארים
 * באותו פורמט כמו של השדות הנייטיביים, כך שהקוראים לא צריכים להשתנות:
 * "YYYY-MM-DD" לתאריך, "YYYY-MM-DDTHH:mm" לתאריך+שעה (שעון מקומי), "HH:mm" לשעה. */

const pad = (n: number) => String(n).padStart(2, '0')
const toDateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const DEFAULT_TIME = '09:00'

function parseValue(value: string): { date: Date | undefined; time: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value)
  if (!m) return { date: undefined, time: DEFAULT_TIME }
  return {
    date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
    time: m[4] ? `${m[4]}:${m[5]}` : DEFAULT_TIME,
  }
}

function formatValue(value: string, withTime: boolean): string {
  const { date, time } = parseValue(value)
  if (!date) return ''
  const day = date.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return withTime ? `${day}, ${time}` : day
}

/** שדה תאריך / תאריך+שעה: כפתור שפותח לוח שנה בחלון (<dialog>). בתאריך בלבד -
 * בחירת יום סוגרת מיד; עם שעה - בוחרים יום ושעה ומאשרים. */
export function DateInput({
  type = 'date',
  value,
  onChange,
  label,
  placeholder,
  required,
  autoFocus,
}: {
  type?: 'date' | 'datetime-local'
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
}) {
  const withTime = type === 'datetime-local'
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draftDate, setDraftDate] = useState<Date | undefined>()
  const [draftTime, setDraftTime] = useState(DEFAULT_TIME)
  const [month, setMonth] = useState<Date>(new Date())

  function open() {
    const { date, time } = parseValue(value)
    setDraftDate(date)
    setDraftTime(time)
    setMonth(date ?? new Date())
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  function commit(date: Date | undefined, time: string) {
    if (!date) return
    onChange(withTime ? `${toDateKey(date)}T${time}` : toDateKey(date))
    close()
  }

  const today = new Date()
  const empty = !value

  return (
    <div className="ui-date">
      <button
        type="button"
        className={`ui-input ui-date__trigger${empty ? ' ui-date__trigger--empty' : ''}`}
        onClick={open}
        aria-label={empty ? label : `${label}: ${formatValue(value, withTime)}`}
        aria-haspopup="dialog"
        title={label}
        autoFocus={autoFocus}
      >
        <span className="ui-date__icon" aria-hidden>
          📅
        </span>
        <span className="ui-date__text">
          {empty ? (placeholder ?? (withTime ? 'בחרו תאריך ושעה' : 'בחרו תאריך')) : formatValue(value, withTime)}
        </span>
      </button>
      {/* שדה נסתר רק בשביל ולידציית required של הטופס */}
      {required && (
        <input className="ui-date__validator" tabIndex={-1} aria-hidden required value={value} onChange={() => {}} />
      )}
      {!empty && !required && (
        <button type="button" className="ui-date__clear" aria-label={`ניקוי ${label}`} onClick={() => onChange('')}>
          ✕
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="dp-dialog"
        aria-label={label}
        onClick={(e) => {
          // לחיצה על הרקע (מחוץ לחלון) סוגרת
          if (e.target === e.currentTarget) close()
        }}
      >
        <div className="dp-panel">
          <p className="dp-title">{label}</p>
          <DayPicker
            mode="single"
            locale={he}
            dir="rtl"
            selected={draftDate}
            month={month}
            onMonthChange={setMonth}
            captionLayout="dropdown"
            startMonth={new Date(today.getFullYear() - 6, 0)}
            endMonth={new Date(today.getFullYear() + 6, 11)}
            onSelect={(d) => {
              setDraftDate(d)
              if (!withTime && d) commit(d, draftTime)
            }}
          />
          {withTime && (
            <div className="dp-time">
              <span className="dp-time__label">שעה</span>
              <TimeInput label="שעה" value={draftTime} onChange={setDraftTime} />
            </div>
          )}
          <div className="dp-actions">
            <button
              type="button"
              className="ui-button ui-button--secondary dp-today"
              onClick={() => {
                setMonth(today)
                setDraftDate(today)
                if (!withTime) commit(today, draftTime)
              }}
            >
              היום
            </button>
            <span className="dp-actions__spacer" />
            <button type="button" className="ui-button ui-button--secondary" onClick={close}>
              ביטול
            </button>
            {withTime && (
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={!draftDate}
                onClick={() => commit(draftDate, draftTime)}
              >
                אישור
              </button>
            )}
          </div>
        </div>
      </dialog>
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => pad(i))
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5))

/** שעה ("HH:mm") עם שתי רשימות - שעה ודקות בקפיצות של 5. עובד אותו דבר בכל דפדפן. */
export function TimeInput({
  value,
  onChange,
  label,
  required,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  required?: boolean
}) {
  const [h = '', m = ''] = value ? value.split(':') : []
  // דקה שלא בקפיצות של 5 (ערך ישן) - מציגים אותה בכל זאת
  const minutes = m && !MINUTES.includes(m) ? [...MINUTES, m].sort() : MINUTES
  const set = (nextH: string, nextM: string) => onChange(`${nextH || '00'}:${nextM || '00'}`)

  return (
    <div className="ui-time" role="group" aria-label={label} dir="ltr">
      <select className="ui-time__part" aria-label={`${label} - שעות`} value={h} required={required} onChange={(e) => set(e.target.value, m)}>
        {!h && <option value="">--</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      <span className="ui-time__sep" aria-hidden>
        :
      </span>
      <select className="ui-time__part" aria-label={`${label} - דקות`} value={m} required={required} onChange={(e) => set(h, e.target.value)}>
        {!m && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </div>
  )
}

