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
