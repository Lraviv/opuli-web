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

/** בחירת אייקון (אימוג'י) מתוך רשת. extra - אפשרות נוספת בתחילת הרשת (למשל "אות ראשונה"). */
export function IconPicker({
  icons,
  value,
  onChange,
  label,
  extra,
}: {
  icons: readonly string[]
  value: string | null
  onChange: (icon: string | null) => void
  label: string
  extra?: { content: ReactNode; label: string }
}) {
  return (
    <div className="ui-icon-picker" role="radiogroup" aria-label={label}>
      {extra && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label={extra.label}
          title={extra.label}
          className={`ui-icon-picker__option${value === null ? ' ui-icon-picker__option--selected' : ''}`}
          onClick={() => onChange(null)}
        >
          {extra.content}
        </button>
      )}
      {icons.map((icon) => (
        <button
          key={icon}
          type="button"
          role="radio"
          aria-checked={value === icon}
          className={`ui-icon-picker__option${value === icon ? ' ui-icon-picker__option--selected' : ''}`}
          onClick={() => onChange(icon)}
        >
          <span aria-hidden>{icon}</span>
        </button>
      ))}
    </div>
  )
}

/** שדה תאריך / תאריך+שעה. ריק - מציג placeholder עם אייקון (ב-iOS השדה הנייטיבי ריק
 * לגמרי עד שלוחצים עליו). מלא - כפתור ✕ לניקוי. כל השדה פותח את בורר התאריך. */
export function DateInput({
  type = 'date',
  value,
  onChange,
  label,
  placeholder,
  required,
  autoFocus,
}: {
  type?: 'date' | 'datetime-local'
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  required?: boolean
  autoFocus?: boolean
}) {
  const empty = !value
  return (
    <div className={`ui-date${empty ? ' ui-date--empty' : ''}`}>
      <input
        type={type}
        className="ui-input ui-date__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        title={label}
        required={required}
        autoFocus={autoFocus}
      />
      {empty && (
        <span className="ui-date__placeholder" aria-hidden>
          <span className="ui-date__icon">📅</span>
          {placeholder ?? (type === 'date' ? 'בחרו תאריך' : 'בחרו תאריך ושעה')}
        </span>
      )}
      {!empty && !required && (
        <button type="button" className="ui-date__clear" aria-label={`ניקוי ${label}`} onClick={() => onChange('')}>
          ✕
        </button>
      )}
    </div>
  )
}
