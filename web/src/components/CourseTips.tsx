import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Avatar } from '@/components/Avatar'
import { linkify } from '@/lib/linkify'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { SkeletonList } from '@/components/Skeleton'
import { useAuth } from '@/auth/AuthContext'
import {
  useCourseTips,
  useCreateTip,
  useDeleteTip,
  useTipReplies,
  useUpdateCourse,
  useUpdateTip,
  useVoteTip,
} from '@/lib/queries'
import type { CourseRead, TipRead, TipSort } from '@/lib/types'
import { relativeTime } from '@/lib/tips'
import './CourseTips.css'

const MAX_BODY = 2000
const PAGE_SIZE = 20
const SORTS: { key: TipSort; label: string }[] = [
  { key: 'top', label: 'הכי מומלצות' },
  { key: 'new', label: 'הכי חדשות' },
  { key: 'old', label: 'הכי ישנות' },
]

const ARROW_UP = 'M5 1.5 9 7.5H1z'
const ARROW_DOWN = 'M5 8.5 1 2.5h8z'

function Votes({ tip, courseId }: { tip: TipRead; courseId: number }) {
  const vote = useVoteTip(courseId)
  // הניקוד מתעדכן מיד בלחיצה, וחוזר אחורה אם השמירה נכשלה
  const [pending, setPending] = useState<{ score: number; my_vote: number } | null>(null)
  const shown = pending ?? tip
  const disabled = tip.is_mine || tip.deleted

  function cast(value: 1 | -1) {
    const next = shown.my_vote === value ? 0 : value
    setPending({ score: shown.score + next - shown.my_vote, my_vote: next })
    vote.mutate({ id: tip.id, value: next }, { onSettled: () => setPending(null) })
  }

  const tone = shown.score > 0 ? ' tp-score--pos' : shown.score < 0 ? ' tp-score--neg' : ''
  return (
    <span className="tp-votes">
      <button
        type="button"
        className={`tp-vote${shown.my_vote === 1 ? ' tp-vote--up' : ''}`}
        aria-label="הצבעה בעד"
        aria-pressed={shown.my_vote === 1}
        disabled={disabled}
        title={tip.is_mine ? 'אי אפשר להצביע לתגובה שלך' : undefined}
        onClick={() => cast(1)}
      >
        <svg viewBox="0 0 10 10" aria-hidden>
          <path d={ARROW_UP} />
        </svg>
      </button>
      <span className={`tp-score${tone}`} aria-label={`ניקוד ${shown.score}`}>
        {shown.score}
      </span>
      <button
        type="button"
        className={`tp-vote${shown.my_vote === -1 ? ' tp-vote--down' : ''}`}
        aria-label="הצבעה נגד"
        aria-pressed={shown.my_vote === -1}
        disabled={disabled}
        onClick={() => cast(-1)}
      >
        <svg viewBox="0 0 10 10" aria-hidden>
          <path d={ARROW_DOWN} />
        </svg>
      </button>
    </span>
  )
}

function TipBody({
  tip,
  courseId,
  small,
  onReply,
  children,
}: {
  tip: TipRead
  courseId: number
  small?: boolean
  onReply: () => void
  children?: ReactNode
}) {
  const updateTip = useUpdateTip(courseId)
  const deleteTip = useDeleteTip(courseId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tip.body)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      await updateTip.mutateAsync({ id: tip.id, body: draft.trim() })
      setEditing(false)
    } catch {
      // ההודעה מוצגת מתחת לתגובה (updateTip.error)
    }
  }

  async function handleDelete() {
    setMenuOpen(false)
    if (!confirm('למחוק את התגובה?')) return
    deleteTip.mutate(tip.id)
  }

  const actionError = updateTip.error ?? deleteTip.error

  if (tip.deleted) {
    return (
      <div className="tp-deleted">
        <p>התגובה נמחקה</p>
        {children}
      </div>
    )
  }

  const name = tip.author?.display_name ?? ''
  return (
    <>
      <div className="tp-head">
        <Avatar name={name} icon={tip.author?.avatar_icon ?? null} small={small} />
        <div className="tp-who">
          <span className="tp-name">
            {name}
            {tip.is_mine && <span className="tp-you">את/ה</span>}
          </span>
          <span className="tp-when">
            <time dateTime={tip.created_at} title={new Date(tip.created_at).toLocaleString('he-IL')}>
              {relativeTime(tip.created_at)}
            </time>
            {tip.edited && ' · נערך'}
          </span>
        </div>
        {tip.is_mine && (
          <div className="tp-menu-wrap">
            <button
              type="button"
              className="tp-more"
              aria-label="אפשרויות לתגובה"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              ⋮
            </button>
            {menuOpen && (
              <div className="tp-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setDraft(tip.body)
                    setEditing(true)
                    setMenuOpen(false)
                  }}
                >
                  עריכה
                </button>
                <button type="button" role="menuitem" className="tp-menu__danger" onClick={handleDelete}>
                  מחיקה
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <form className="tp-edit" onSubmit={handleSave}>
          <textarea
            className="tp-textarea"
            value={draft}
            maxLength={MAX_BODY}
            aria-label="עריכת התגובה"
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="tp-edit__actions">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={!draft.trim() || updateTip.isPending}>
              שמירה
            </Button>
          </div>
        </form>
      ) : (
        <p className="tp-body">
          {tip.reply_to_name && <span className="tp-reply-to">בתגובה ל־{tip.reply_to_name}: </span>}
          {linkify(tip.body)}
        </p>
      )}

      {actionError && <p className="tp-error">{actionError.message}</p>}

      <div className="tp-actions">
        <Votes tip={tip} courseId={courseId} />
        <button type="button" className="tp-link" onClick={onReply}>
          הגבה
        </button>
        {children}
      </div>
    </>
  )
}

function ReplyForm({
  courseId,
  parentId,
  replyTo,
  onDone,
}: {
  courseId: number
  parentId: number
  replyTo: string | null
  onDone: () => void
}) {
  const createTip = useCreateTip(courseId)
  const [text, setText] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await createTip.mutateAsync({ body: text.trim(), parent_id: parentId })
    setText('')
    onDone()
  }

  return (
    <form className="tp-reply-form" onSubmit={handleSubmit}>
      <Input
        autoFocus
        maxLength={MAX_BODY}
        placeholder={replyTo ? `תשובה ל־${replyTo}` : 'כתבו תגובה…'}
        aria-label="תגובה"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" disabled={!text.trim() || createTip.isPending}>
        שליחה
      </Button>
      {createTip.error && <p className="tp-error">{createTip.error.message}</p>}
    </form>
  )
}

function TipThread({ tip, courseId }: { tip: TipRead; courseId: number }) {
  const [expanded, setExpanded] = useState(false)
  // replyTarget = על איזו תגובה עונים (הראשית או תשובה בשרשור); null = תיבת התשובה סגורה
  const [replyTarget, setReplyTarget] = useState<TipRead | null>(null)
  const { data: allReplies } = useTipReplies(tip.id, expanded)

  const replies = expanded && allReplies ? allReplies : tip.replies
  const hidden = tip.reply_count - replies.length

  function openReply(target: TipRead) {
    setReplyTarget(target)
    if (tip.reply_count > tip.replies.length) setExpanded(true)
  }

  return (
    <article className="tp-post">
      <TipBody tip={tip} courseId={courseId} onReply={() => openReply(tip)}>
        {tip.reply_count > 0 && !tip.deleted && <span className="tp-meta">{tip.reply_count} תגובות</span>}
      </TipBody>

      {(replies.length > 0 || replyTarget) && (
        <div className="tp-replies">
          {replies.map((r) => (
            <div className="tp-reply" key={r.id}>
              <TipBody tip={r} courseId={courseId} small onReply={() => openReply(r)} />
            </div>
          ))}
          {hidden > 0 && (
            <button type="button" className="tp-link tp-show-more" onClick={() => setExpanded(true)}>
              {hidden === 1 ? 'הצגת עוד תגובה אחת' : `הצגת עוד ${hidden} תגובות`}
            </button>
          )}
          {replyTarget && (
            <ReplyForm
              courseId={courseId}
              parentId={replyTarget.id}
              replyTo={replyTarget.id === tip.id ? null : (replyTarget.author?.display_name ?? null)}
              onDone={() => {
                setReplyTarget(null)
                setExpanded(true)
              }}
            />
          )}
        </div>
      )}
    </article>
  )
}

function Composer({ courseId }: { courseId: number }) {
  const { user } = useAuth()
  const createTip = useCreateTip(courseId)
  const [text, setText] = useState('')
  const name = user?.display_name?.trim() || 'סטודנט/ית'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await createTip.mutateAsync({ body: text.trim() })
    setText('')
  }

  return (
    <form className="tp-composer" onSubmit={handleSubmit}>
      <Avatar name={name} icon={user?.avatar_icon ?? null} />
      <div className="tp-composer__main">
        <textarea
          className="tp-textarea"
          placeholder="שתפו עצה או שאלו שאלה על הקורס…"
          aria-label="תגובה חדשה"
          maxLength={MAX_BODY}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="tp-composer__row">
          <span className="tp-hint">
            {user?.display_name?.trim() ? (
              <>יוצג בשם {name}</>
            ) : (
              <>
                יוצג בשם "סטודנט/ית". <Link to="/profile">הגדרת שם בפרופיל</Link>
              </>
            )}
            <span className="tp-chars">
              {' · '}
              {text.length}/{MAX_BODY}
            </span>
          </span>
          <Button type="submit" disabled={!text.trim() || createTip.isPending}>
            פרסום
          </Button>
        </div>
        {createTip.error && <p className="tp-error">{createTip.error.message}</p>}
      </div>
    </form>
  )
}

function CourseCodeForm({ course }: { course: CourseRead }) {
  const updateCourse = useUpdateCourse()
  const [code, setCode] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    await updateCourse.mutateAsync({ id: course.id, payload: { course_code: code.trim() } })
  }

  return (
    <Card>
      <EmptyState title="הוסיפו מספר קורס כדי להצטרף לדיון" subtitle="כך נחבר אתכם לסטודנטים שלומדים את אותו קורס" />
      <form className="tp-code-form" onSubmit={handleSubmit}>
        <Input
          inputMode="numeric"
          placeholder="למשל 20407"
          aria-label="מספר קורס"
          maxLength={20}
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" disabled={!code.trim() || updateCourse.isPending}>
          שמירה
        </Button>
      </form>
    </Card>
  )
}

/** לשונית "עצות מסטודנטים" במסך הקורס: דיון משותף לכל מי שלומד/ת את הקורס. */
/** "באוניברסיטה הפתוחה" - ב' היידוע מחליפה את ה"ה" בתחילת השם */
function inInstitution(name: string): string {
  return name.startsWith('ה') ? `ב${name.slice(1)}` : `ב${name}`
}

export function CourseTips({ course }: { course: CourseRead }) {
  const [params, setParams] = useSearchParams()
  const sortParam = params.get('sort')
  const sort: TipSort = sortParam === 'new' || sortParam === 'old' ? sortParam : 'top'
  const [limit, setLimit] = useState(PAGE_SIZE)
  const { data, isLoading, isFetching } = useCourseTips(course.id, sort, limit)

  function changeSort(next: TipSort) {
    const p = new URLSearchParams(params)
    if (next === 'top') p.delete('sort')
    else p.set('sort', next)
    setParams(p, { replace: true })
    setLimit(PAGE_SIZE)
  }

  if (isLoading || !data) return <SkeletonList />
  if (!data.linked) return <CourseCodeForm course={course} />

  return (
    <div className="tp">
      {data.course && (
        <p className="tp-intro">
          דיון משותף לכל מי שלומד/ת את {data.course.code}
          {data.course.institution && ` ${inInstitution(data.course.institution)}`} ·{' '}
          {data.course.participants === 1 ? 'משתתף אחד' : `${data.course.participants} משתתפים`}
        </p>
      )}

      <Composer courseId={course.id} />

      {data.total === 0 ? (
        <Card>
          <EmptyState title="עוד אין עצות לקורס הזה" subtitle="תהיו הראשונים לשתף מה עזר לכם" />
        </Card>
      ) : (
        <>
          <div className="tp-sortbar">
            <span className="tp-sortbar__label" id="tp-sort-label">
              מיון
            </span>
            <div className="tp-sort" role="group" aria-labelledby="tp-sort-label">
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sort === s.key}
                  className={`tp-sort__btn${sort === s.key ? ' tp-sort__btn--active' : ''}`}
                  onClick={() => changeSort(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {data.items.map((tip) => (
            <TipThread key={tip.id} tip={tip} courseId={course.id} />
          ))}

          {data.items.length < data.total && (
            <Button variant="secondary" disabled={isFetching} onClick={() => setLimit((l) => l + PAGE_SIZE)}>
              הצגת עוד עצות
            </Button>
          )}
        </>
      )}
    </div>
  )
}
