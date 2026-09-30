import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import './Shell.css'

const NAV_ITEMS = [
  { to: '/', label: 'בית', icon: '🏠' },
  { to: '/degrees', label: 'התואר שלי', icon: '🎓' },
  { to: '/courses', label: 'קורסים', icon: '📚' },
  { to: '/reminders', label: 'תזכורות', icon: '🔔' },
  { to: '/profile', label: 'פרופיל', icon: '👤' },
]

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <header className="shell__topbar">
        <div className="shell__topbar-inner">
          <Link to="/" className="shell__brand" aria-label="OpuLi - לדף הבית">
            OpuLi
          </Link>
          <nav className="shell__nav">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `shell__nav-link${isActive ? ' shell__nav-link--active' : ''}`}
              >
                <span aria-hidden>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell__content">{children}</main>
    </div>
  )
}
