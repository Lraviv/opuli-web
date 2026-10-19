import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { linkify } from '@/lib/linkify'
import { ForumPostCard } from '@/components/ForumPostCard'
import { SkeletonList } from '@/components/Skeleton'
import { useCreateComment, useDeleteComment, useForumFeed, useForumPost, useReport, useUpdateComment } from '@/lib/forumQueries'
import { MAX_BODY } from '@/lib/forum'
import { relativeTime } from '@/lib/tips'
import type { ForumComment } from '@/lib/types'
import '@/components/CourseTips.css'
import './Community.css'

function CommentBody({ comment, small, onReply, children }: { comment: ForumComment; small?: boolean; onReply: () => void; children?: ReactNode }) {
  const update = useUpdateComment()
  const del = useDeleteComment()
  const report = useReport()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reported, setReported] = useState(false)
  const [draft, setDraft] = useState(comment.body)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim()) return
    try {
      await update.mutateAsync({ id: comment.id, body: draft.trim() })
      setEditing(false)
    } catch {
      // ההודעה מוצגת מתחת לתגובה
    }
  }

  function handleDelete() {
    setMenuOpen(false)
    if (!confirm('למחוק את התגובה?')) return
    del.mutate(comment.id)
  }

  async function handleReport() {
    setMenuOpen(false)
    const reason = prompt('למה לדווח על התגובה? (לא חובה)')
    if (reason === null) return
    await report.mutateAsync({ target_type: 'comment', target_id: comment.id, reason })
    setReported(true)
  }

  if (comment.deleted) {
    return (
      <div className="tp-deleted">
        <p>התגובה נמחקה</p>
        {children}
      </div>
    )
  }

  const name = comment.author?.display_name ?? ''
  const error = update.error ?? del.error ?? report.error
  return (
    <>
      <div className="tp-head">
        <Avatar name={name} icon={comment.author?.avatar_icon ?? null} small={small} />
        <div className="tp-who">
          <span className="tp-name">
            {name}
            {comment.is_mine && <span className="tp-you">את/ה</span>}
          </span>
          <span className="tp-when">
            <time dateTime={comment.created_at} title={new Date(comment.created_at).toLocaleString('he-IL')}>
              {relativeTime(comment.created_at)}
            </time>
            {comment.edited && ' · נערך'}
          </span>
        </div>
        {(comment.is_mine || !reported) && (
          <div className="tp-menu-wrap">
            <button type="button" className="tp-more" aria-label="אפשרויות לתגובה" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              ⋮
            </button>
            {menuOpen && (
              <div className="tp-menu" role="menu">
                {comment.is_mine ? (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setDraft(comment.body)
                        setEditing(true)
                        setMenuOpen(false)
                      }}
                    >
                      עריכה
                    </button>
                    <button type="button" role="menuitem" className="tp-menu__danger" onClick={handleDelete}>
                      מחיקה
                    </button>
                  </>
                ) : (
                  <button type="button" role="menuitem" onClick={handleReport}>
                    דיווח
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <form className="tp-edit" onSubmit={handleSave}>
          <textarea className="tp-textarea" value={draft} maxLength={MAX_BODY} aria-label="עריכת התגובה" onChange={(e) => setDraft(e.target.value)} autoFocus />
          <div className="tp-edit__actions">
            <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={!draft.trim() || update.isPending}>
              שמירה
            </Button>
          </div>
        </form>
      ) : (
        <p className="tp-body">
          {comment.reply_to_name && <span className="tp-reply-to">בתגובה ל־{comment.reply_to_name}: </span>}
          {linkify(comment.body)}
        </p>
      )}

      {error && <p className="tp-error">{error.message}</p>}
      {reported && <p className="fr-muted">תודה, הדיווח נשלח.</p>}

      <div className="tp-actions">
        <button type="button" className="tp-link" onClick={onReply}>
          הגבה
        </button>
        {children}
      </div>
    </>
  )
}

function CommentForm({
  postId,
  parentId,
  replyTo,
  onDone,
}: {
  postId: number
  parentId?: number
  replyTo?: string | null
  onDone?: () => void
}) {
  const create = useCreateComment(postId)
  const [text, setText] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    try {
      await create.mutateAsync({ body: text.trim(), parent_id: parentId ?? null })
      setText('')
      onDone?.()
    } catch {
      // ההודעה מוצגת מתחת לטופס
    }
  }

  return (
    <form className="tp-reply-form" onSubmit={handleSubmit}>
      <Input
        autoFocus={parentId != null}
        maxLength={MAX_BODY}
        placeholder={replyTo ? `תשובה ל־${replyTo}` : parentId != null ? 'כתבו תשובה…' : 'כתבו תגובה…'}
        aria-label="תגובה"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" disabled={!text.trim() || create.isPending}>
        שליחה
      </Button>
      {create.error && <p className="tp-error">{create.error.message}</p>}
    </form>
  )
}

function CommentThread({ comment, postId }: { comment: ForumComment; postId: number }) {
  // על איזו תגובה עונים (הראשית או תשובה בשרשור); null = תיבת התשובה סגורה
  const [replyTarget, setReplyTarget] = useState<ForumComment | null>(null)
  return (
    <article className="tp-post">
      <CommentBody comment={comment} onReply={() => setReplyTarget(comment)} />
      {(comment.replies.length > 0 || replyTarget) && (
        <div className="tp-replies">
          {comment.replies.map((r) => (
            <div className="tp-reply" key={r.id}>
              <CommentBody comment={r} small onReply={() => setReplyTarget(r)} />
            </div>
          ))}
          {replyTarget && (
            <CommentForm
              postId={postId}
              parentId={replyTarget.id}
              replyTo={replyTarget.id === comment.id ? null : (replyTarget.author?.display_name ?? null)}
              onDone={() => setReplyTarget(null)}
            />
          )}
        </div>
      )}
    </article>
  )
}

export default function CommunityPost() {
  const postId = Number(useParams().postId)
  const { data, isLoading, error } = useForumPost(postId)
  // is_admin מגיע עם הפיד; בעמוד פוסט בודד שואלים פיד מינימלי כדי לדעת אם להציג כלי ניהול
  const { data: feed } = useForumFeed({ category: null, q: '', sort: 'new', saved: false, courseId: null }, 1)

  return (
    <div className="fr-main fr-post-page">
      <Link to="/community" className="fr-back">
        → חזרה לקהילה
      </Link>
      {isLoading ? (
        <SkeletonList rows={2} />
      ) : error || !data ? (
        <div className="fr-empty">
          <h2>הפוסט לא נמצא</h2>
          <p>ייתכן שנמחק או שהוא שייך למוסד אחר.</p>
        </div>
      ) : (
        <>
          <ForumPostCard post={data.post} full isAdmin={feed?.is_admin} />
          <section className="fr-comments" aria-label="תגובות">
            {!data.post.deleted && <CommentForm postId={postId} />}
            {data.comments.map((c) => (
              <CommentThread key={c.id} comment={c} postId={postId} />
            ))}
          </section>
        </>
      )}
    </div>
  )
}
