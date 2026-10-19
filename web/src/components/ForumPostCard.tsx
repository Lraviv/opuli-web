import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { Avatar } from '@/components/Avatar'
import { linkify } from '@/lib/linkify'
import {
  useAttendees,
  useDeletePost,
  useModeratePost,
  useReport,
  useRsvp,
  useSavePost,
  useUpdatePost,
  useVotePost,
} from '@/lib/forumQueries'
import { CATEGORY_LABEL, MAX_BODY, MAX_TITLE, emailList, eventDayParts, formatEventWhen, isEventOver } from '@/lib/forum'
import { relativeTime } from '@/lib/tips'
import type { ForumPost } from '@/lib/types'
import '@/components/CourseTips.css'
import '@/pages/Community.css'

function EventBlock({ post }: { post: ForumPost }) {
  const event = post.event!
  const rsvp = useRsvp()
  const [showAttendees, setShowAttendees] = useState(false)
  const [copied, setCopied] = useState(false)
  const { data: attendees } = useAttendees(post.id, post.is_mine && showAttendees)
  const { day, month } = eventDayParts(event.starts_at)
  const over = isEventOver(event.starts_at, event.ends_at)
  const going = event.going_count === 1 ? 'מגיע/ה אחד/ת' : `${event.going_count} מגיעים`

  async function copyEmails() {
    if (!attendees?.length) return
    await navigator.clipboard.writeText(emailList(attendees))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fr-event">
      <div className="fr-event__row">
        <div className="fr-datebox" aria-hidden>
          <b>{day}</b>
          <span>{month}</span>
        </div>
        <div className="fr-event__info">
          <span className="fr-event__when">
            <time dateTime={event.starts_at}>{formatEventWhen(event.starts_at, event.ends_at)}</time>
          </span>
          <span className="fr-muted">
            {event.place_public}
            {' · '}
            {over ? 'האירוע הסתיים' : going}
          </span>
          {event.place_private && <span className="fr-event__private">{linkify(event.place_private)}</span>}
        </div>
        {!post.is_mine && !over && !post.deleted && (
          <button
            type="button"
            className={`fr-going${event.i_am_going ? ' fr-going--on' : ''}`}
            aria-pressed={event.i_am_going}
            disabled={rsvp.isPending}
            onClick={() => rsvp.mutate({ id: post.id, going: !event.i_am_going })}
          >
            {event.i_am_going ? 'מגיע/ה ✓' : 'אני מגיע/ה'}
          </button>
        )}
        {post.is_mine && (
          <button type="button" className="fr-going" aria-expanded={showAttendees} onClick={() => setShowAttendees((s) => !s)}>
            רשימת מגיעים
          </button>
        )}
      </div>
      {!post.is_mine && !over && !event.i_am_going && !post.deleted && (
        <p className="fr-note">אישור הגעה ישתף את השם והמייל שלך עם המארגן/ת, ויחשוף לך את הכתובת המדויקת.</p>
      )}
      {rsvp.error && <p className="tp-error">{rsvp.error.message}</p>}
      {post.is_mine && showAttendees && (
        <div className="fr-attendees">
          {!attendees ? (
            <p className="fr-muted">טוען…</p>
          ) : attendees.length === 0 ? (
            <p className="fr-muted">עוד אף אחד לא אישר/ה הגעה.</p>
          ) : (
            <>
              <ul>
                {attendees.map((a) => (
                  <li key={a.email}>
                    <Avatar name={a.display_name} icon={a.avatar_icon} small />
                    <span className="fr-attendees__name">{a.display_name}</span>
                    <a href={`mailto:${a.email}`} dir="ltr">
                      {a.email}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="fr-attendees__actions">
                <Button type="button" variant="secondary" onClick={copyEmails}>
                  {copied ? 'הועתק' : 'העתקת כל המיילים'}
                </Button>
                <a className="fr-link" href={`mailto:?bcc=${encodeURIComponent(emailList(attendees))}`}>
                  שליחת מייל לכולם
                </a>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function EditForm({ post, onDone }: { post: ForumPost; onDone: () => void }) {
  const update = useUpdatePost()
  const [title, setTitle] = useState(post.title)
  const [body, setBody] = useState(post.body)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    try {
      await update.mutateAsync({ id: post.id, payload: { title: title.trim(), body: body.trim() } })
      onDone()
    } catch {
      // ההודעה מוצגת מתחת לטופס
    }
  }

  return (
    <form className="fr-edit" onSubmit={handleSubmit}>
      <Input aria-label="כותרת" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="tp-textarea fr-edit__body" aria-label="תוכן" maxLength={MAX_BODY} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="tp-edit__actions">
        <Button type="button" variant="secondary" onClick={onDone}>
          ביטול
        </Button>
        <Button type="submit" disabled={!title.trim() || !body.trim() || update.isPending}>
          שמירה
        </Button>
      </div>
      {update.error && <p className="tp-error">{update.error.message}</p>}
    </form>
  )
}

/** כרטיס פוסט בפיד הקהילה. full = בעמוד הפוסט עצמו (בלי קיצור ובלי קישור לכותרת). */
export function ForumPostCard({ post, full, isAdmin }: { post: ForumPost; full?: boolean; isAdmin?: boolean }) {
  const navigate = useNavigate()
  const vote = useVotePost()
  const save = useSavePost()
  const del = useDeletePost()
  const moderate = useModeratePost()
  const report = useReport()
  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [reported, setReported] = useState(false)

  const href = `/community/posts/${post.id}`
  const name = post.author?.display_name ?? ''
  const showMenu = !post.deleted && (post.is_mine || !reported || isAdmin)

  async function handleDelete() {
    setMenuOpen(false)
    if (!confirm('למחוק את הפוסט?')) return
    await del.mutateAsync(post.id)
    if (full) navigate('/community')
  }

  async function handleReport() {
    setMenuOpen(false)
    const reason = prompt('למה לדווח על הפוסט? (לא חובה)')
    if (reason === null) return
    await report.mutateAsync({ target_type: 'post', target_id: post.id, reason })
    setReported(true)
  }

  return (
    <article className={`fr-post${post.hidden ? ' fr-post--hidden' : ''}`}>
      <div className="tp-head">
        {post.deleted ? (
          <span className="tp-avatar" aria-hidden />
        ) : (
          <Avatar name={name} icon={post.author?.avatar_icon ?? null} />
        )}
        <div className="tp-who">
          <span className="tp-name">
            {post.deleted ? 'הפוסט נמחק' : name}
            {post.is_mine && <span className="tp-you">את/ה</span>}
          </span>
          <span className="tp-when">
            <time dateTime={post.created_at} title={new Date(post.created_at).toLocaleString('he-IL')}>
              {relativeTime(post.created_at)}
            </time>
            {post.course && ` · ${post.course.name}`}
            {post.edited && ' · נערך'}
          </span>
        </div>
        <span className={`fr-cat fr-cat--${post.category}`}>{CATEGORY_LABEL[post.category]}</span>
        {showMenu && (
          <div className="tp-menu-wrap">
            <button type="button" className="tp-more" aria-label="אפשרויות לפוסט" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              ⋮
            </button>
            {menuOpen && (
              <div className="tp-menu" role="menu">
                {post.is_mine && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
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
                )}
                {!post.is_mine && !reported && (
                  <button type="button" role="menuitem" onClick={handleReport}>
                    דיווח
                  </button>
                )}
                {isAdmin && (
                  <>
                    <button type="button" role="menuitem" onClick={() => moderate.mutate({ id: post.id, action: 'pin', value: !post.pinned })}>
                      {post.pinned ? 'ביטול נעיצה' : 'נעיצה'}
                    </button>
                    <button type="button" role="menuitem" onClick={() => moderate.mutate({ id: post.id, action: 'hide', value: !post.hidden })}>
                      {post.hidden ? 'החזרה לפורום' : 'הסתרה'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {(post.pinned || post.hidden) && (
        <p className="fr-flag">
          {post.pinned && 'נעוץ'}
          {post.pinned && post.hidden && ' · '}
          {post.hidden && 'מוסתר (גלוי רק למנהלות)'}
        </p>
      )}

      {editing ? (
        <EditForm post={post} onDone={() => setEditing(false)} />
      ) : (
        !post.deleted && (
          <>
            <h3 className="fr-title">{full ? post.title : <Link to={href}>{post.title}</Link>}</h3>
            <p className={`tp-body fr-body${full ? '' : ' fr-body--clamp'}`}>{linkify(post.body)}</p>
          </>
        )
      )}

      {post.event && <EventBlock post={post} />}

      {reported && <p className="fr-muted">תודה, הדיווח נשלח.</p>}
      {(del.error || report.error) && <p className="tp-error">{(del.error ?? report.error)!.message}</p>}

      {!post.deleted && (
        <div className="fr-actions">
          <button
            type="button"
            className={`fr-act${post.voted ? ' fr-act--on' : ''}`}
            aria-pressed={post.voted}
            aria-label={`הצבעה בעד, ${post.score}`}
            disabled={post.is_mine || vote.isPending}
            title={post.is_mine ? 'אי אפשר להצביע לפוסט שלך' : undefined}
            onClick={() => vote.mutate({ id: post.id, value: post.voted ? 0 : 1 })}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            {post.score}
          </button>
          {full ? (
            <span className="fr-muted">{post.comment_count === 1 ? 'תגובה אחת' : `${post.comment_count} תגובות`}</span>
          ) : (
            <Link to={href} className="fr-act">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              </svg>
              {post.comment_count === 1 ? 'תגובה אחת' : `${post.comment_count} תגובות`}
            </Link>
          )}
          <button
            type="button"
            className={`fr-act fr-act--end${post.saved ? ' fr-act--on' : ''}`}
            aria-pressed={post.saved}
            disabled={save.isPending}
            onClick={() => save.mutate({ id: post.id, value: !post.saved })}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M6 3h12v18l-6-4-6 4z" />
            </svg>
            {post.saved ? 'נשמר' : 'שמירה'}
          </button>
        </div>
      )}
    </article>
  )
}
