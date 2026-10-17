import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { NavIcon } from '@/components/NavIcon'
import type { NavIconName } from '@/components/NavIcon'
import { CONTACT_PATH, INFO_LINKS, LINKEDIN_URL } from '@/lib/site'
import './Shell.css'

const NAV_ITEMS: { to: string; label: string; icon: NavIconName }[] = [
  { to: '/', label: 'בית', icon: 'home' },
  { to: '/schedule', label: 'לו״ז', icon: 'schedule' },
  { to: '/degrees', label: 'התואר שלי', icon: 'degree' },
  { to: '/courses', label: 'קורסים', icon: 'courses' },
  { to: '/profile', label: 'פרופיל', icon: 'profile' },
]

const YEAR = new Date().getFullYear()

// עמודים עם פריסת שתי עמודות במחשב - מקבלים רוחב תוכן רחב יותר
function isWidePage(pathname: string): boolean {
  return pathname === '/' || /^\/(courses|degrees)\/\d+\/?$/.test(pathname)
}

export function Shell({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const wide = isWidePage(pathname)
  return (
    <div className="shell">
      <header className="shell__topbar">
        <div className="shell__topbar-inner">
          {/* בסדר ה-DOM הניווט ראשון, כך שב-RTL הוא בימין והלוגו בשמאל */}
          <nav className="shell__nav" aria-label="ניווט ראשי">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => `shell__nav-link${isActive ? ' shell__nav-link--active' : ''}`}
              >
                {item.to === '/profile' && user?.avatar_icon ? (
                  <span className="shell__nav-avatar" aria-hidden>
                    {user.avatar_icon}
                  </span>
                ) : (
                  <NavIcon name={item.icon} />
                )}
                <span className="shell__nav-label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
          <Link to="/" className="shell__logo">
            OpuLi
          </Link>
        </div>
      </header>
      <main className={`shell__content${wide ? ' shell__content--wide' : ''}`}>{children}</main>
      <footer className="shell__footer">
        <div className="shell__footer-inner">
          <div className="shell__footer-about">
            <span className="shell__logo">OpuLi</span>
            <p>כל התואר במקום אחד: קורסים, מטלות, מבחנים, ממוצע ועצות מסטודנטים.</p>
          </div>
          <nav className="shell__footer-links" aria-label="יצירת קשר">
            <Link to={CONTACT_PATH}>צרו קשר</Link>
            <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer">
              LinkedIn
            </a>
          </nav>
          <nav className="shell__footer-links shell__footer-links--muted" aria-label="מידע">
            {INFO_LINKS.map((l) => (
              <Link key={l.id} to={l.path}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="shell__footer-copy">© {YEAR} OpuLi</p>
      </footer>
    </div>
  )
}
