import { Link } from 'react-router-dom'
import './SiteFooter.css'

// מגיעים ממשתני סביבה (Vercel) ולא מהקוד. ריק = הקישור לא מוצג.
const LINKEDIN_URL: string | undefined = import.meta.env.VITE_LINKEDIN_URL || undefined
const AUTHOR_NAME: string | undefined = import.meta.env.VITE_AUTHOR_NAME || undefined
const YEAR = new Date().getFullYear()

const isSafeHref = (url: string) => /^https:\/\//i.test(url)

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.13 2.07 2.07 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z"
      />
    </svg>
  )
}

/**
 * פוטר: "צרו קשר" (מוביל לטופס המשוב בפרופיל) וקישור ל-LinkedIn.
 * variant="auth" - גרסה מצומצמת לעמודי ההתחברות (בלי "צרו קשר", שדורש חשבון).
 */
export function SiteFooter({ variant = 'app' }: { variant?: 'app' | 'auth' }) {
  const linkedin = LINKEDIN_URL && isSafeHref(LINKEDIN_URL) ? LINKEDIN_URL : undefined

  return (
    <footer className={`site-footer site-footer--${variant}`}>
      <div className="site-footer__inner">
        <span className="site-footer__brand">© {YEAR} OpuLi</span>
        {variant === 'app' && (
          <Link to="/profile#feedback" className="site-footer__link">
            צרו קשר
          </Link>
        )}
        {linkedin && (
          <a className="site-footer__linkedin" href={linkedin} target="_blank" rel="noopener noreferrer">
            <LinkedInIcon />
            <span>{AUTHOR_NAME ? `נבנה על ידי ${AUTHOR_NAME}` : 'LinkedIn'}</span>
          </a>
        )}
      </div>
    </footer>
  )
}
