import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, IconButton, Input, Pill } from '@/components/ui'
import { useDeleteCourseItem, useUpdateCourseItem } from '@/lib/queries'
import type { CourseItemRead } from '@/lib/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ISO -> ערך לשדה <input type="date"> (YYYY-MM-DD)
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const fromDateInput = (value: string) => (value ? new Date(value).toISOString() : null)

/** שורה של מטלה/שיעור במסך הקורס: סימון בוצע, תאריך (הגשה למטלה / צפייה לשיעור),
 * הערות, ועריכה ומחיקה במקום. */
export function CourseItemRow({ item }: { item: CourseItemRead }) {
  const updateItem = useUpdateCourseItem(item.course_id)
  const deleteItem = useDeleteCourseItem(item.course_id)
  const isLesson = item.type === 'lesson'
  const dateField = isLesson ? 'watched_at' : 'due_date'

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [date, setDate] = useState(toDateInput(item[dateField]))
  const [notes, setNotes] = useState(item.notes ?? '')

  function startEdit() {
    setTitle(item.title)
    setDate(toDateInput(item[dateField]))
    setNotes(item.notes ?? '')
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await updateItem.mutateAsync({
      id: item.id,
      payload: { title: title.trim(), notes: notes.trim() || null, [dateField]: fromDateInput(date) },
    })
    setEditing(false)
  }

  function handleToggle(done: boolean) {
    // שיעור שסומן כנצפה בלי תאריך צפייה - ממלאים את היום
    const payload = isLesson && done && !item.watched_at ? { is_done: done, watched_at: new Date().toISOString() } : { is_done: done }
    updateItem.mutate({ id: item.id, payload })
  }

  function handleDelete() {
    if (!confirm(`למחוק את ${isLesson ? 'השיעור' : 'המטלה'} "${item.title}"?`)) return
    deleteItem.mutate(item.id)
  }

  if (editing) {
    return (
      <form className="cd-row cd-item-edit" onSubmit={handleSave}>
        <Input placeholder="כותרת" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        <label className="cd-item-edit__date">
          {isLesson ? 'תאריך צפייה' : 'תאריך הגשה'}
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <textarea
          className="ui-input cd-item-edit__notes"
          placeholder="הערות"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="cd-item-edit__actions">
          <Button type="submit" disabled={updateItem.isPending}>
            שמירה
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </div>
      </form>
    )
  }

  const date_ = item[dateField]
  return (
    <div className="cd-row">
      <input
        type="checkbox"
        checked={item.is_done}
        aria-label={isLesson ? 'נצפה' : 'בוצע'}
        onChange={(e) => handleToggle(e.target.checked)}
      />
      <div className="cd-item__body">
        <p className={`cd-row__title${item.is_done ? ' cd-row__title--done' : ''}`}>{item.title}</p>
        {date_ && (
          <div className="cd-item__meta">
            <Pill tone={isLesson ? 'success' : 'neutral'}>{`${isLesson ? 'נצפה' : 'הגשה'} ${formatDate(date_)}`}</Pill>
          </div>
        )}
        {item.notes && <p className="cd-item__notes">{item.notes}</p>}
      </div>
      <div className="cd-row__actions">
        <IconButton icon="edit" label={`עריכת "${item.title}"`} onClick={startEdit} />
        <IconButton
          icon="delete"
          tone="danger"
          label={`מחיקת "${item.title}"`}
          onClick={handleDelete}
          disabled={deleteItem.isPending}
        />
      </div>
    </div>
  )
}
