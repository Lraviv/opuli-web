import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, DateInput, Input, TimeInput } from '@/components/ui'
import { ForumPostCard } from '@/components/ForumPostCard'
import { SkeletonList } from '@/components/Skeleton'
import { useCourses } from '@/lib/queries'
import { useCreatePost, useForumCourseActivity, useForumFeed, useUpcomingEvents } from '@/lib/forumQueries'
import type { ForumFilter } from '@/lib/forumQueries'
import { FORUM_CATEGORIES, MAX_BODY, MAX_TITLE, eventDayParts, formatEventWhen, isEventCategory, localToIso } from '@/lib/forum'
import type { ForumCategory, ForumPost } from '@/lib/types'
import '@/components/CourseTips.css'
import './Community.css'

const PAGE = 20

function Composer({ onDone }: { onDone: () => void }) {
  const create = useCreatePost()
  const { data: courses } = useCourses({ status: 'current' })
  const [category, setCategory] = useState<ForumCategory>('question')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [courseId, setCourseId] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('19:00')
  const [end, setEnd] = useState('')
  const [place, setPlace] = useState('')
  const [placePrivate, setPlacePrivate] = useState('')
  const isEvent = isEventCategory(category)
  const ready = title.trim() && body.trim() && (!isEvent || (date && start && place.trim()))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!ready) return
    try {
      await create.mutateAsync({
        category,
        title: title.trim(),
        body: body.trim(),
        course_id: courseId ? Number(courseId) : null,
        ...(isEvent && {
          event_starts_at: localToIso(date, start),
          event_ends_at: end ? localToIso(date, end) : null,
          place_public: place.trim(),
          place_private: placePrivate.trim() || null,
        }),
      })
      onDone()
    } catch {
      // ההודעה מוצגת מתחת לטופס
    }
  }

  return (
    <form className="fr-composer" onSubmit={handleSubmit}>
      <span className="fr-composer__label">סוג הפוסט</span>
      <div className="fr-chips" role="radiogroup" aria-label="סוג הפוסט">
        {FORUM_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={category === c.id}
            className={`fr-chip${category === c.id ? ' fr-chip--active' : ''}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <Input autoFocus aria-label="כותרת" placeholder="כותרת" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="tp-textarea"
        aria-label="תוכן"
        placeholder={isEvent ? 'מה מתוכנן, למי זה מתאים, מה להביא…' : 'מה רצית לשתף או לשאול?'}
        maxLength={MAX_BODY}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {isEvent && (
        <div className="fr-composer__event">
          <div className="fr-composer__wide">
            <DateInput label="תאריך" value={date} onChange={setDate} placeholder="תאריך" required />
          </div>
          <div>
            <span className="fr-composer__label">התחלה</span>
            <TimeInput label="שעת התחלה" value={start} onChange={setStart} required />
          </div>
          <div>
            <span className="fr-composer__label">סיום (לא חובה)</span>
            <TimeInput label="שעת סיום (לא חובה)" value={end} onChange={setEnd} />
          </div>
          <Input
            className="fr-composer__wide"
            aria-label="מקום"
            placeholder="מקום כללי, למשל: ספריית הקמפוס"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
          <Input
            className="fr-composer__wide"
            aria-label="כתובת מדויקת"
            placeholder="כתובת מדויקת או קישור (רק למי שמגיע/ה)"
            value={placePrivate}
            onChange={(e) => setPlacePrivate(e.target.value)}
          />
        </div>
      )}
      {courses && courses.length > 0 && (
        <select aria-label="קורס (לא חובה)" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">בלי קורס</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <div className="fr-composer__row">
        <span className="tp-hint">הפוסט גלוי לסטודנטים מהמוסד שלך בלבד.</span>
        <div className="fr-composer__buttons">
          <Button type="button" variant="secondary" onClick={onDone}>
            ביטול
          </Button>
          <Button type="submit" disabled={!ready || create.isPending}>
            פרסום
          </Button>
        </div>
      </div>
      {create.error && <p className="tp-error">{create.error.message}</p>}
    </form>
  )
}

function UpcomingCard({ post }: { post: ForumPost }) {
  const { day, month } = eventDayParts(post.event!.starts_at)
  return (
    <Link to={`/community/posts/${post.id}`} className="fr-upcoming-card">
      <div className="fr-datebox" aria-hidden>
        <b>{day}</b>
        <span>{month}</span>
      </div>
      <div className="fr-upcoming-card__text">
        <b>{post.title}</b>
        <span className="fr-muted">{formatEventWhen(post.event!.starts_at, null)}</span>
        <span className="fr-muted">{post.event!.going_count} מגיעים</span>
      </div>
    </Link>
  )
}

const RULES = [
  'מדברים בכבוד, גם כשלא מסכימים.',
  'בלי פרסום פתרונות למטלות ומבחנים.',
  'בלי מכירות או פרסומות.',
  'פוסט לא מתאים? ⋮ ואז "דיווח".',
]

export default function Community() {
  const [filter, setFilter] = useState<ForumFilter>({ category: null, q: '', sort: 'new', saved: false, courseId: null })
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [composing, setComposing] = useState(false)
  const feed = useForumFeed(filter, limit)
  const { data: upcoming } = useUpcomingEvents()
  const { data: activity } = useForumCourseActivity()

  // החיפוש נשלח לשרת אחרי הפסקה קצרה בהקלדה
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => (f.q === search ? f : { ...f, q: search }))
      setLimit(PAGE)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  function update(next: Partial<ForumFilter>) {
    setFilter((f) => ({ ...f, ...next }))
    setLimit(PAGE)
  }

  const data = feed.data
  const linked = data?.linked ?? true
  const items = data?.items ?? []
  const upcomingStrip = upcoming && upcoming.length > 0 && (
    <section className="fr-upcoming-block">
      <h2 className="fr-section-title">בקרוב בקהילה</h2>
      <div className="fr-upcoming">
        {upcoming.map((p) => (
          <UpcomingCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  )

  return (
    <div className="fr-page">
      <div className="fr-main">
        <header className="fr-header">
          <h1>קהילה</h1>
          <p>{data?.institution ? `סטודנטים מ${data.institution}: עצות, שאלות, מפגשים ומסיבות` : 'עצות, שאלות, מפגשים ומסיבות'}</p>
        </header>

        {!linked ? (
          <div className="fr-empty">
            <h2>צריך לבחור מוסד לימודים</h2>
            <p>הקהילה מחברת סטודנטים מאותו מוסד. בחרו מוסד בתואר שלכם כדי להצטרף.</p>
            <Link to="/degrees" className="ui-button ui-button--primary">
              לתואר שלי
            </Link>
          </div>
        ) : (
          <>
            <div className="fr-search">
              <Input type="search" placeholder="חיפוש בקהילה" aria-label="חיפוש בקהילה" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div className="fr-chips" role="toolbar" aria-label="סינון">
              <button
                type="button"
                className={`fr-chip${!filter.category && !filter.saved ? ' fr-chip--active' : ''}`}
                aria-pressed={!filter.category && !filter.saved}
                onClick={() => update({ category: null, saved: false })}
              >
                הכול
              </button>
              {FORUM_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`fr-chip${filter.category === c.id ? ' fr-chip--active' : ''}`}
                  aria-pressed={filter.category === c.id}
                  onClick={() => update({ category: c.id, saved: false })}
                >
                  {c.filterLabel}
                </button>
              ))}
              <button
                type="button"
                className={`fr-chip${filter.saved ? ' fr-chip--active' : ''}`}
                aria-pressed={filter.saved}
                onClick={() => update({ saved: true, category: null })}
              >
                נשמרו
              </button>
            </div>

            {composing ? (
              <Composer onDone={() => setComposing(false)} />
            ) : (
              <button type="button" className="fr-composer-open" onClick={() => setComposing(true)}>
                <span className="tp-avatar tp-avatar--small" aria-hidden>
                  +
                </span>
                פוסט חדש: עצה, שאלה, מפגש או מסיבה
              </button>
            )}

            {upcomingStrip}

            <div className="tp-sortbar">
              <span className="tp-sortbar__label">
                {filter.courseId != null && activity
                  ? `בקורס ${activity.find((a) => a.course_id === filter.courseId)?.name ?? ''} · `
                  : ''}
                {data ? (data.total === 1 ? 'פוסט אחד' : `${data.total} פוסטים`) : ''}
                {filter.courseId != null && (
                  <>
                    {' · '}
                    <button type="button" className="tp-link" onClick={() => update({ courseId: null })}>
                      כל הקורסים
                    </button>
                  </>
                )}
              </span>
              <div className="tp-sort" role="group" aria-label="מיון">
                {(['new', 'top'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`tp-sort__btn${filter.sort === s ? ' tp-sort__btn--active' : ''}`}
                    aria-pressed={filter.sort === s}
                    onClick={() => update({ sort: s })}
                  >
                    {s === 'new' ? 'חדשים' : 'הכי מועילים'}
                  </button>
                ))}
              </div>
            </div>

            {feed.isLoading ? (
              <SkeletonList rows={3} />
            ) : feed.error ? (
              <p className="tp-error">{feed.error.message}</p>
            ) : items.length === 0 ? (
              <div className="fr-empty">
                <h2>{filter.saved ? 'עוד לא שמרת פוסטים' : filter.q ? 'לא נמצאו פוסטים' : 'עוד אין כאן פוסטים'}</h2>
                <p>{filter.saved ? 'לחיצה על "שמירה" בפוסט תשמור אותו כאן.' : 'אפשר להיות הראשונים: עצה, שאלה או מפגש לימוד.'}</p>
              </div>
            ) : (
              <>
                {items.map((p) => (
                  <ForumPostCard key={p.id} post={p} isAdmin={data?.is_admin} />
                ))}
                {data && data.total > items.length && (
                  <div className="fr-more">
                    <Button variant="secondary" disabled={feed.isFetching} onClick={() => setLimit((l) => l + PAGE)}>
                      עוד פוסטים
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {linked && (
        <aside className="fr-side" aria-label="מידע נוסף">
          {upcoming && upcoming.length > 0 && (
            <div className="fr-side-card">
              <h2 className="fr-section-title">בקרוב בקהילה</h2>
              {upcoming.map((p) => (
                <UpcomingCard key={p.id} post={p} />
              ))}
            </div>
          )}
          {activity && activity.length > 0 && (
            <div className="fr-side-card">
              <h2 className="fr-section-title">הקורסים שלי בקהילה</h2>
              <ul>
                {activity.map((a) => (
                  <li key={a.course_id}>
                    <button
                      type="button"
                      className={`fr-side-course${filter.courseId === a.course_id ? ' fr-side-course--active' : ''}`}
                      aria-pressed={filter.courseId === a.course_id}
                      onClick={() => update({ courseId: filter.courseId === a.course_id ? null : a.course_id })}
                    >
                      <span>{a.name}</span>
                      <span>{a.post_count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="fr-side-card">
            <h2 className="fr-section-title">כללי הקהילה</h2>
            <ol>
              {RULES.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </div>
        </aside>
      )}
    </div>
  )
}
