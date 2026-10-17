import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '@/lib/useDismiss'
import type { CourseStatus } from '@/lib/types'
import './StatusMenu.css'

const OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: 'planned', label: 'מתוכנן' },
  { value: 'current', label: 'בתהליך' },
  { value: 'done', label: 'הושלם' },
]

/** סטטוס הקורס כתגית קטנה עם נקודה צבעונית; לחיצה פותחת בחירה בין שלוש האפשרויות */
export function StatusMenu({ status, onChange }: { status: CourseStatus; onChange: (status: CourseStatus) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const current = OPTIONS.find((o) => o.value === status) ?? OPTIONS[0]

  return (
    <div className="status-menu" ref={ref}>
      <button
        type="button"
        className="status-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`סטטוס הקורס: ${current.label}. לחצו לשינוי`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`status-dot status-dot--${status}`} aria-hidden />
        {current.label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="menu-popover" role="menu" aria-label="שינוי סטטוס">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === status}
              className="menu-popover__item"
              onClick={() => {
                setOpen(false)
                if (o.value !== status) onChange(o.value)
              }}
            >
              <span className={`status-dot status-dot--${o.value}`} aria-hidden />
              <span className="menu-popover__label">{o.label}</span>
              {o.value === status && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="menu-popover__check">
                  <path d="M5 12l5 5 9-10" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** כפתור ⋯ עם פעולות משניות (כמו מחיקת קורס) */
export function MoreMenu({ label, items }: { label: string; items: { label: string; danger?: boolean; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div className="status-menu" ref={ref}>
      <button type="button" className="more-menu__trigger" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen((v) => !v)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="menu-popover menu-popover--end" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-popover__item${item.danger ? ' menu-popover__item--danger' : ''}`}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              <span className="menu-popover__label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
