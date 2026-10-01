import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
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
          <nav className="shell__nav" aria-label="ניווט ראשי">
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
