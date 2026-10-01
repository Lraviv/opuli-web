import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, DateInput, IconButton, Input, Pill } from '@/components/ui'
import { ASSIGNMENT_KIND_LABEL } from '@/lib/grades'
import { isOverdue, parseOptionalNumber } from '@/lib/items'
import { useDeleteCourseItem, useUpdateCourseItem } from '@/lib/queries'
import type { AssignmentKind, CourseItemRead } from '@/lib/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ISO -> ערך לשדה <input type="date"> (YYYY-MM-DD)
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const fromDateInput = (value: string) => (value ? new Date(value).toISOString() : null)
/** שורה של מטלה/שיעור במסך הקורס: סימון בוצע, תאריך (הגשה למטלה / צפייה לשיעור),
 * הערות, ולמטלות גם סוג (ממ"ן/ממ"ח), חובה, משקל וציון. עריכה ומחיקה במקום. */
export function CourseItemRow({ item }: { item: CourseItemRead }) {
  const updateItem = useUpdateCourseItem(item.course_id)
  const deleteItem = useDeleteCourseItem(item.course_id)
  const isLesson = item.type === 'lesson'
  const dateField = isLesson ? 'watched_at' : 'due_date'

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [date, setDate] = useState(toDateInput(item[dateField]))
  const [notes, setNotes] = useState(item.notes ?? '')
  const [kind, setKind] = useState<AssignmentKind | ''>(item.kind ?? '')
  const [mandatory, setMandatory] = useState(item.is_mandatory)
  const [weight, setWeight] = useState(item.weight_percent?.toString() ?? '')
  const [grade, setGrade] = useState(item.grade?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  function startEdit() {
    setTitle(item.title)
    setDate(toDateInput(item[dateField]))
    setNotes(item.notes ?? '')
    setKind(item.kind ?? '')
    setMandatory(item.is_mandatory)
    setWeight(item.weight_percent?.toString() ?? '')
    setGrade(item.grade?.toString() ?? '')
    setError(null)
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    const base = { title: title.trim(), notes: notes.trim() || null, [dateField]: fromDateInput(date) }
    if (isLesson) {
      await updateItem.mutateAsync({ id: item.id, payload: base })
    } else {
      const weightValue = parseOptionalNumber(weight)
      const gradeValue = parseOptionalNumber(grade)
      if (weightValue === undefined || gradeValue === undefined) {
        setError('משקל וציון הם מספרים בין 0 ל-100')
        return
      }
      await updateItem.mutateAsync({
        id: item.id,
        payload: { ...base, kind: kind || null, is_mandatory: mandatory, weight_percent: weightValue, grade: gradeValue },
      })
    }
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
          <DateInput label={isLesson ? 'תאריך צפייה' : 'תאריך הגשה'} value={date} onChange={setDate} />
        </label>
        {!isLesson && (
          <div className="cd-item-edit__grid">
            <label className="cd-field">
              סוג
              <select value={kind} onChange={(e) => setKind(e.target.value as AssignmentKind | '')}>
                <option value="">—</option>
                <option value="mmn">ממ"ן</option>
                <option value="mmh">ממ"ח</option>
                <option value="other">אחר</option>
              </select>
            </label>
            <label className="cd-field">
              משקל (%)
              <Input type="number" min={0} max={100} step="any" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </label>
            <label className="cd-field">
              ציון שהתקבל
              <Input type="number" min={0} max={100} step="any" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} />
            </label>
            <label className="cd-check">
              <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
              מטלת חובה
            </label>
          </div>
        )}
        <textarea
          className="ui-input cd-item-edit__notes"
          placeholder="הערות"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {error && (
          <p className="cd-form-error" role="alert">
            {error}
          </p>
        )}
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
  const overdue = !isLesson && isOverdue(item)
  const hasMeta = !!date_ || (!isLesson && (item.kind || item.is_mandatory || item.weight_percent != null || item.grade != null))
  return (
    <div className="cd-row">
      <input
        type="checkbox"
        checked={item.is_done}
        aria-label={isLesson ? `נצפה: ${item.title}` : `הוגשה: ${item.title}`}
        onChange={(e) => handleToggle(e.target.checked)}
      />
      <div className="cd-item__body">
        <p className={`cd-row__title${item.is_done ? ' cd-row__title--done' : ''}`}>{item.title}</p>
        {hasMeta && (
          <div className="cd-item__meta">
            {!isLesson && item.kind && item.kind !== 'other' && !item.title.includes(ASSIGNMENT_KIND_LABEL[item.kind]) && (
              <Pill>{ASSIGNMENT_KIND_LABEL[item.kind]}</Pill>
            )}
            {!isLesson && item.is_mandatory && <Pill tone={item.is_done ? 'neutral' : 'warning'}>חובה</Pill>}
            {date_ && (
              <Pill tone={isLesson ? 'success' : overdue ? 'danger' : 'neutral'}>
                {isLesson ? `נצפה ${formatDate(date_)}` : overdue ? `באיחור · ${formatDate(date_)}` : `הגשה ${formatDate(date_)}`}
              </Pill>
            )}
            {!isLesson && item.weight_percent != null && <Pill>{`${item.weight_percent}%`}</Pill>}
            {!isLesson && item.grade != null && <Pill tone="success">{`ציון ${item.grade}`}</Pill>}
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
