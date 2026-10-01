import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { SiteFooter } from '@/components/SiteFooter'
import { WelcomeTour } from '@/components/WelcomeTour'
import { api } from '@/lib/api'
import { useDegrees } from '@/lib/queries'
import { OPEN_TOUR_EVENT } from '@/lib/tour'
import type { UserRead } from '@/lib/types'
import './Shell.css'

const NAV_ITEMS = [
  { to: '/', label: 'בית', icon: '🏠' },
  { to: '/schedule', label: 'לו״ז', icon: '📅' },
  { to: '/degrees', label: 'התואר שלי', icon: '🎓' },
  { to: '/courses', label: 'קורסים', icon: '📚' },
  { to: '/reminders', label: 'תזכורות', icon: '🔔' },
  { to: '/profile', label: 'פרופיל', icon: '👤' },
]

export function Shell({ children }: { children: ReactNode }) {
  const { user, updateUser } = useAuth()
  const { data: degrees } = useDegrees()
  // ההסבר נפתח לבד פעם אחת (עד שהשרת יודע שהוא הוצג), וגם לפי בקשה מהפרופיל
  const [tourRequested, setTourRequested] = useState(false)
  const tourOpen = tourRequested || (!!user && !user.intro_seen)

  useEffect(() => {
    const open = () => setTourRequested(true)
    window.addEventListener(OPEN_TOUR_EVENT, open)
    return () => window.removeEventListener(OPEN_TOUR_EVENT, open)
  }, [])

  const closeTour = useCallback(() => {
    setTourRequested(false)
    if (user && !user.intro_seen) {
      updateUser({ ...user, intro_seen: true })
      api.patch<UserRead>('/me', { intro_seen: true }).catch(() => {
        // לא קריטי - במקרה הגרוע ההסבר יופיע שוב בכניסה הבאה
      })
    }
  }, [user, updateUser])
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
                <span aria-hidden>{item.to === '/profile' && user?.avatar_icon ? user.avatar_icon : item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="shell__content">{children}</main>
      <SiteFooter />
      <WelcomeTour open={tourOpen} hasDegree={(degrees?.length ?? 0) > 0} onClose={closeTour} />
    </div>
  )
}
