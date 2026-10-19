import { useState } from 'react'
import type { FormEvent } from 'react'
import { DateInput } from '@/components/DateField'
import { Button, IconButton, Input } from '@/components/ui'
import { useAddReminder, useDeleteReminder, useUpdateReminder } from '@/lib/queries'
import type { UserReminderRead } from '@/lib/types'

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

// ISO -> ערך ל-<input type="datetime-local"> בשעון המקומי (YYYY-MM-DDTHH:mm)
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** כל התזכורות בעמוד הלו"ז (במקום עמוד התזכורות הנפרד): הוספה מהירה, סימון, עריכה ומחיקה.
 * תזכורות עם תאריך מופיעות גם ביום שלהן בלו"ז - כאן רואים את כולן, כולל כאלה שהתאריך שלהן עבר. */
export function ScheduleReminders({ reminders, now }: { reminders: UserReminderRead[]; now: Date }) {
  const addReminder = useAddReminder()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [showDone, setShowDone] = useState(false)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addReminder.mutateAsync({ title: title.trim(), due_date: due ? new Date(due).toISOString() : null })
    setTitle('')
    setDue('')
  }

  // פתוחות: עם תאריך קודם (הקרוב ביותר ראשון), בלי תאריך בסוף
  const dueTime = (iso: string | null) => (iso ? new Date(iso).getTime() : Infinity)
  const open = reminders.filter((r) => !r.is_done).sort((a, b) => dueTime(a.due_date) - dueTime(b.due_date))
  const done = reminders.filter((r) => r.is_done)

  return (
    <section className="sch-reminders" id="reminders" aria-labelledby="sch-reminders-title">
      <div className="sch-section-head">
        <h2 id="sch-reminders-title">תזכורות</h2>
        {done.length > 0 && (
          <button type="button" className="sch-link-btn" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'הסתרת מה שבוצע' : `בוצעו (${done.length})`}
          </button>
        )}
      </div>
      <div className="sch-card">
        <form className="sch-rem-form" onSubmit={handleAdd}>
          <Input placeholder="תזכורת חדשה" aria-label="תזכורת חדשה" value={title} onChange={(e) => setTitle(e.target.value)} />
          <DateInput type="datetime-local" label="מועד" placeholder="מועד (לא חובה)" value={due} onChange={setDue} />
          <Button type="submit" disabled={addReminder.isPending || !title.trim()}>
            הוספה
          </Button>
        </form>
        {open.length === 0 && !showDone && <p className="sch-rem-empty">אין תזכורות פתוחות</p>}
        {open.map((r) => (
          <ReminderRow key={r.id} reminder={r} overdue={r.due_date != null && new Date(r.due_date).getTime() < now.getTime()} />
        ))}
        {showDone && done.map((r) => <ReminderRow key={r.id} reminder={r} overdue={false} />)}
      </div>
    </section>
  )
}

function ReminderRow({ reminder: r, overdue }: { reminder: UserReminderRead; overdue: boolean }) {
  const update = useUpdateReminder()
  const remove = useDeleteReminder()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(r.title)
  const [due, setDue] = useState(toLocalInput(r.due_date))

  function startEdit() {
    setTitle(r.title)
    setDue(toLocalInput(r.due_date))
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await update.mutateAsync({ id: r.id, payload: { title: title.trim(), due_date: due ? new Date(due).toISOString() : null } })
    setEditing(false)
  }

  function handleDelete() {
    if (!confirm(`למחוק את התזכורת "${r.title}"?`)) return
    remove.mutate(r.id)
  }

  if (editing) {
    return (
      <form className="sch-rem-form sch-rem-form--edit" onSubmit={handleSave}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="כותרת התזכורת" required autoFocus />
        <DateInput type="datetime-local" label="מועד" placeholder="מועד (לא חובה)" value={due} onChange={setDue} />
        <div className="sch-rem-form__actions">
          <Button type="submit" disabled={update.isPending}>
            שמירה
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="sch-row">
      <input
        type="checkbox"
        className="sch-check"
        checked={r.is_done}
        aria-label={`בוצע: ${r.title}`}
        onChange={(e) => update.mutate({ id: r.id, payload: { is_done: e.target.checked } })}
      />
      <span className="sch-row__main">
        <span className={`sch-row__title${r.is_done ? ' sch-row__title--done' : ''}`}>{r.title}</span>
        <span className={`sch-row__meta${overdue ? ' sch-row__meta--overdue' : ''}`}>
          {r.due_date ? `${formatDue(r.due_date)}${overdue ? ' · עבר המועד' : ''}` : 'בלי תאריך'}
        </span>
      </span>
      <IconButton icon="edit" label={`עריכת "${r.title}"`} onClick={startEdit} />
      <IconButton icon="delete" tone="danger" label={`מחיקת "${r.title}"`} onClick={handleDelete} disabled={remove.isPending} />
    </div>
  )
}
