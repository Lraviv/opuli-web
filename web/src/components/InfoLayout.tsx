import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './Shell.css'
import '@/pages/Info.css'

/** מסגרת לדפי המידע כשלא מחוברים: לוגו וקישור להתחברות, בלי הניווט של האפליקציה */
export function InfoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="info-layout">
      <header className="info-layout__top">
        <Link to="/login" className="shell__logo">
          OpuLi
        </Link>
        <Link to="/login" className="info-layout__login">
          התחברות
        </Link>
      </header>
      <main className="info-layout__main">{children}</main>
    </div>
  )
}
