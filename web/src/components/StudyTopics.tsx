import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, IconButton, Input } from '@/components/ui'
import { useAddStudyTopics, useDeleteStudyTopic, useStudyTopics, useUpdateStudyTopic } from '@/lib/queries'
import type { StudyTopicRead } from '@/lib/types'
import { SkeletonList } from '@/components/Skeleton'
import './StudyTopics.css'

/** מקטע "חומר ללימוד" במסך הקורס: רשימת נושאים לסימון, עם התקדמות, הוספה
 * בודדת או הדבקת רשימה (שורה = נושא), ועריכה/מחיקה במקום. הסדר נשמר כפי שהוזן. */
export function StudyTopics({ courseId }: { courseId: number }) {
  const { data: topics, isLoading } = useStudyTopics(courseId)
  const addTopics = useAddStudyTopics(courseId)

  const [title, setTitle] = useState('')
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  const list = topics ?? []
  const doneCount = list.filter((t) => t.is_done).length
  const percent = list.length ? Math.round((doneCount / list.length) * 100) : 0
  const pastedTitles = pasted
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()) // מסירים תבליטים/מספור מהסילבוס
    .filter(Boolean)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await addTopics.mutateAsync([title.trim()])
    setTitle('')
  }

  async function handlePaste(e: FormEvent) {
    e.preventDefault()
    if (pastedTitles.length === 0) return
    await addTopics.mutateAsync(pastedTitles)
    setPasted('')
    setPasting(false)
  }

  return (
    <div className="cd-section">
      <div className="cd-section-header">
        <h2>חומר ללימוד</h2>
        {list.length > 0 && (
          <span className={`st-count${doneCount === list.length ? ' st-count--done' : ''}`}>
            {doneCount}/{list.length}
          </span>
        )}
      </div>
      <Card>
        {list.length > 0 && (
          <div className="st-progress-wrap">
            <div
              className="st-progress"
              role="progressbar"
              aria-label="התקדמות בחומר"
              aria-valuemin={0}
              aria-valuemax={list.length}
              aria-valuenow={doneCount}
            >
              <div className="st-progress__bar" style={{ width: `${percent}%` }} />
            </div>
            <span className="st-progress__label">
              {doneCount === list.length ? 'כל החומר נלמד 🎉' : `${percent}% מהחומר`}
            </span>
          </div>
        )}

        {isLoading ? (
          <SkeletonList rows={3} check pill={false} />
        ) : list.length === 0 ? (
          <div className="st-empty">
            <p className="st-empty__title">עוד אין נושאים</p>
            <p className="st-empty__text">הוסיפו את פרקי הקורס או נושאי המבחן, וסמנו כל נושא כשסיימתם ללמוד אותו.</p>
          </div>
        ) : (
          <ul className="st-list">
            {list.map((t) => (
              <TopicRow key={t.id} topic={t} />
            ))}
          </ul>
        )}

        {pasting ? (
          <form className="st-paste" onSubmit={handlePaste}>
            <label className="st-paste__label" htmlFor={`st-paste-${courseId}`}>
              הדביקו רשימה - כל שורה תהפוך לנושא
            </label>
            <textarea
              id={`st-paste-${courseId}`}
              className="ui-input st-paste__textarea"
              rows={6}
              autoFocus
              placeholder={'פרק 1 – וקטורים\nפרק 2 – מטריצות\nפרק 3 – דטרמיננטות'}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <div className="st-paste__actions">
              <Button type="submit" disabled={addTopics.isPending || pastedTitles.length === 0}>
                {pastedTitles.length > 1 ? `הוספת ${pastedTitles.length} נושאים` : 'הוספה'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPasting(false)}>
                ביטול
              </Button>
            </div>
          </form>
        ) : (
          <>
            <form className="st-add" onSubmit={handleAdd}>
              <Input
                placeholder="נושא חדש, למשל: פרק 5"
                aria-label="נושא חדש"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Button type="submit" disabled={addTopics.isPending || !title.trim()} aria-label="הוספת נושא">
                +
              </Button>
            </form>
            <button type="button" className="st-paste-link" onClick={() => setPasting(true)}>
              📋 הדבקת רשימה מהסילבוס
            </button>
          </>
        )}
      </Card>
    </div>
  )
}

function TopicRow({ topic }: { topic: StudyTopicRead }) {
  const updateTopic = useUpdateStudyTopic(topic.course_id)
  const deleteTopic = useDeleteStudyTopic(topic.course_id)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(topic.title)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    await updateTopic.mutateAsync({ id: topic.id, payload: { title: title.trim() } })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="st-row">
        <form className="st-edit" onSubmit={handleSave}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="שם הנושא" autoFocus required />
          <Button type="submit" disabled={updateTopic.isPending}>
            שמירה
          </Button>
          <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
            ביטול
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className={`st-row${topic.is_done ? ' st-row--done' : ''}`}>
      <label className="st-check">
        <input
          type="checkbox"
          checked={topic.is_done}
          onChange={(e) => updateTopic.mutate({ id: topic.id, payload: { is_done: e.target.checked } })}
        />
        <span className="st-check__title">{topic.title}</span>
      </label>
      <div className="cd-row__actions">
        <IconButton
          icon="edit"
          label={`עריכת "${topic.title}"`}
          onClick={() => {
            setTitle(topic.title)
            setEditing(true)
          }}
        />
        <IconButton
          icon="delete"
          tone="danger"
          label={`מחיקת "${topic.title}"`}
          disabled={deleteTopic.isPending}
          onClick={() => {
            if (confirm(`למחוק את הנושא "${topic.title}"?`)) deleteTopic.mutate(topic.id)
          }}
        />
      </div>
    </li>
  )
}
