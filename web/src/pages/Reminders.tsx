import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, DateInput, EmptyState, IconButton, Input, Pill } from '@/components/ui'
import { useAddReminder, useDeleteReminder, useReminders, useUpdateReminder } from '@/lib/queries'
import type { UserReminderRead } from '@/lib/types'
import { SkeletonList } from '@/components/Skeleton'
import '@/pages/CourseDetail.css'

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Reminders() {
  const { data: reminders, isLoading } = useReminders()
  const addReminder = useAddReminder()

  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addReminder.mutateAsync({ title, due_date: dueDate ? new Date(dueDate).toISOString() : null })
    setTitle('')
    setDueDate('')
  }

  // פתוחות: עם תאריך יעד קודם (הקרוב ביותר ראשון), בלי תאריך בסוף
  const dueTime = (iso: string | null) => (iso ? new Date(iso).getTime() : Infinity)
  const open = (reminders ?? []).filter((r) => !r.is_done).sort((a, b) => dueTime(a.due_date) - dueTime(b.due_date))
  const now = new Date().getTime()
  const done = (reminders ?? []).filter((r) => r.is_done)

  return (
    <div>
      <h1 style={{ fontSize: 24, marginBottom: 'var(--space-four)' }}>תזכורות</h1>
      <Card style={{ marginBottom: 'var(--space-three)' }}>
        <form className="cd-inline-form cd-inline-form--stack" onSubmit={handleAdd}>
          <Input placeholder="תזכורת חדשה" value={title} onChange={(e) => setTitle(e.target.value)} />
          <DateInput
            type="datetime-local"
            label="מועד יעד"
            placeholder="מועד יעד (לא חובה)"
            value={dueDate}
            onChange={setDueDate}
          />
          <Button type="submit" disabled={addReminder.isPending}>
            הוספה
          </Button>
        </form>
      </Card>

      <Card>
        {isLoading ? (
          <SkeletonList rows={3} check />
        ) : open.length === 0 && done.length === 0 ? (
          <EmptyState title="אין תזכורות" />
        ) : (
          <>
            {open.map((r) => (
              <ReminderRow key={r.id} reminder={r} overdue={r.due_date != null && new Date(r.due_date).getTime() < now} />
            ))}
            {done.map((r) => (
              <ReminderRow key={r.id} reminder={r} overdue={false} />
            ))}
          </>
        )}
      </Card>
    </div>
  )
}

// ISO -> ערך ל-<input type="datetime-local"> בשעון המקומי (YYYY-MM-DDTHH:mm)
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function ReminderRow({ reminder: r, overdue }: { reminder: UserReminderRead; overdue: boolean }) {
  const updateReminder = useUpdateReminder()
  const deleteReminder = useDeleteReminder()
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
    await updateReminder.mutateAsync({
      id: r.id,
      payload: { title: title.trim(), due_date: due ? new Date(due).toISOString() : null },
    })
    setEditing(false)
  }

  function handleDelete() {
    if (!confirm(`למחוק את התזכורת "${r.title}"?`)) return
    deleteReminder.mutate(r.id)
  }

  if (editing) {
    return (
      <form className="cd-row cd-item-edit" onSubmit={handleSave}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="כותרת התזכורת" required autoFocus />
        <label className="cd-item-edit__date">
          מועד יעד
          <DateInput type="datetime-local" label="מועד יעד" value={due} onChange={setDue} />
        </label>
        <div className="cd-item-edit__actions">
          <Button type="submit" disabled={updateReminder.isPending}>
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
    <div className="cd-row">
      <input
        type="checkbox"
        checked={r.is_done}
        aria-label={`סימון "${r.title}" כבוצע`}
        onChange={(e) => updateReminder.mutate({ id: r.id, payload: { is_done: e.target.checked } })}
      />
      <div className="cd-item__body">
        <p className={`cd-row__title${r.is_done ? ' cd-row__title--done' : ''}`}>{r.title}</p>
        {r.due_date && (
          <div className="cd-item__meta">
            <Pill tone={r.is_done ? 'neutral' : overdue ? 'danger' : 'warning'}>{formatDue(r.due_date)}</Pill>
          </div>
        )}
      </div>
      <div className="cd-row__actions">
        <IconButton icon="edit" label={`עריכת "${r.title}"`} onClick={startEdit} />
        <IconButton
          icon="delete"
          tone="danger"
          label={`מחיקת "${r.title}"`}
          onClick={handleDelete}
          disabled={deleteReminder.isPending}
        />
      </div>
    </div>
  )
}
