import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, IconButton, Input } from '@/components/ui'
import { Skeleton } from '@/components/Skeleton'
import { COURSE_LINK_PRESETS, GLOBAL_LINK_PRESETS, displayHost, normalizeUrl } from '@/lib/links'
import type { LinkPreset } from '@/lib/links'
import { useCreateLink, useDeleteLink, useLinks, useUpdateLink } from '@/lib/queries'
import type { LinkRead } from '@/lib/types'
import './LinksBar.css'

// הגנה כפולה: גם השרת מאשר רק http/https, אבל לא מרנדרים href שאינו כזה
const isSafeHref = (url: string) => /^https?:\/\//i.test(url)

/**
 * קישורים אישיים: courseId=null - קישורים כלליים (מסך הבית), אחרת - של קורס.
 * מוצגים כשורת "אריחים"; עריכה נפתחת במקום, בלי לעזוב את המסך.
 */
export function LinksBar({ courseId, title }: { courseId: number | null; title: string }) {
  const { data: links, isLoading } = useLinks(courseId)
  const createLink = useCreateLink(courseId)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(false)

  const list = links ?? []
  const presets = (courseId == null ? GLOBAL_LINK_PRESETS : COURSE_LINK_PRESETS).filter(
    (p) => !list.some((l) => l.title === p.title),
  )

  return (
    <section className="lb" aria-label={title}>
      <div className="lb__header">
        <h2>{title}</h2>
        {list.length > 0 && (
          <button type="button" className="lb__toggle" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
            {editing ? 'סיום' : 'עריכה'}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="lb__tiles" aria-hidden>
          <Skeleton width={150} height={52} radius={12} />
          <Skeleton width={150} height={52} radius={12} />
        </div>
      ) : (
        <div className="lb__tiles">
          {list.map((link) =>
            editing ? (
              <EditableTile key={link.id} link={link} courseId={courseId} />
            ) : isSafeHref(link.url) ? (
              <a key={link.id} className="lb__tile" href={link.url} target="_blank" rel="noopener noreferrer">
                <span className="lb__tile-title">{link.title}</span>
                <span className="lb__tile-host">{displayHost(link.url)}</span>
              </a>
            ) : null,
          )}
          {!adding && !editing && (
            <button type="button" className="lb__tile lb__tile--add" onClick={() => setAdding(true)}>
              <span aria-hidden>+</span> {list.length === 0 ? 'הוספת קישור' : 'קישור'}
            </button>
          )}
        </div>
      )}

      {adding && (
        <LinkForm
          presets={presets}
          submitLabel="הוספה"
          busy={createLink.isPending}
          onCancel={() => setAdding(false)}
          onSubmit={async (payload) => {
            await createLink.mutateAsync(payload)
            setAdding(false)
          }}
        />
      )}
    </section>
  )
}

function EditableTile({ link, courseId }: { link: LinkRead; courseId: number | null }) {
  const updateLink = useUpdateLink(courseId)
  const deleteLink = useDeleteLink(courseId)
  const [open, setOpen] = useState(false)

  if (open) {
    return (
      <LinkForm
        initial={{ title: link.title, url: link.url }}
        submitLabel="שמירה"
        busy={updateLink.isPending}
        onCancel={() => setOpen(false)}
        onSubmit={async (payload) => {
          await updateLink.mutateAsync({ id: link.id, payload })
          setOpen(false)
        }}
      />
    )
  }
  return (
    <div className="lb__tile lb__tile--editing">
      <span className="lb__tile-title">{link.title}</span>
      <span className="lb__tile-actions">
        <IconButton icon="edit" label={`עריכת "${link.title}"`} onClick={() => setOpen(true)} />
        <IconButton
          icon="delete"
          tone="danger"
          label={`מחיקת "${link.title}"`}
          disabled={deleteLink.isPending}
          onClick={() => {
            if (confirm(`למחוק את הקישור "${link.title}"?`)) deleteLink.mutate(link.id)
          }}
        />
      </span>
    </div>
  )
}

function LinkForm({
  initial,
  presets = [],
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: { title: string; url: string }
  presets?: LinkPreset[]
  submitLabel: string
  busy: boolean
  onSubmit: (payload: { title: string; url: string }) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const normalized = normalizeUrl(url)
    if (!title.trim()) return setError('חסרה כותרת לקישור')
    if (!normalized) return setError('הכתובת לא תקינה. אפשר להדביק כתובת שמתחילה ב-https://')
    setError(null)
    try {
      await onSubmit({ title: title.trim(), url: normalized })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה')
    }
  }

  return (
    <form className="lb__form" onSubmit={handleSubmit}>
      {presets.length > 0 && (
        <div className="lb__presets" role="group" aria-label="הצעות">
          {presets.map((p) => (
            <button
              key={p.title}
              type="button"
              className="lb__preset"
              onClick={() => {
                setTitle(p.title)
                if (p.url) setUrl(p.url)
              }}
            >
              {p.title}
            </button>
          ))}
        </div>
      )}
      <div className="lb__fields">
        <Input placeholder="כותרת" aria-label="כותרת הקישור" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoFocus />
        <Input
          placeholder="כתובת (https://…)"
          aria-label="כתובת הקישור"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          dir="ltr"
        />
      </div>
      {error && (
        <p className="lb__error" role="alert">
          {error}
        </p>
      )}
      <div className="lb__form-actions">
        <Button type="submit" disabled={busy}>
          {submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          ביטול
        </Button>
      </div>
    </form>
  )
}
