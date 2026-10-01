import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import './ui.css'

export function Card({
  children,
  style,
  className,
}: {
  children: ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div className={`ui-card${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  )
}

export function Button({
  variant = 'primary',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return (
    <button className={`ui-button ui-button--${variant}`} {...rest}>
      {children}
    </button>
  )
}

const ICON_PATHS = {
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z',
  delete: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
} as const

/** כפתור אייקון קומפקטי (עריכה/מחיקה) - label חובה, משמש גם כ-aria-label וגם כ-tooltip. */
export function IconButton({
  icon,
  label,
  tone = 'neutral',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: keyof typeof ICON_PATHS; label: string; tone?: 'neutral' | 'danger' }) {
  return (
    <button type="button" className={`ui-icon-button ui-icon-button--${tone}`} aria-label={label} title={label} {...rest}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={ICON_PATHS[icon]} />
      </svg>
    </button>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input${className ? ` ${className}` : ''}`} {...rest} />
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="ui-empty">
      <p className="ui-empty__title">{title}</p>
      {subtitle && <p className="ui-empty__subtitle">{subtitle}</p>}
    </div>
  )
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span className={`ui-pill ui-pill--${tone}`}>{children}</span>
}
