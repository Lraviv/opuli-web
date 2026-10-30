import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui'
import { ApiError, loginPath } from '@/lib/api'
import { useOAuthDecision, useOAuthRequest } from '@/lib/queries'
import type { AiScope } from '@/lib/types'
import './AuthLayout.css'
import './Connect.css'

/** עמוד האישור כשאפליקציית AI (Claude, ChatGPT…) מבקשת להתחבר לחשבון.
 *  האפליקציה שולחת לכאן דרך /authorize בשרת, ואחרי ההחלטה חוזרים אליה. */
export default function Connect() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const requestId = searchParams.get('request')

  if (loading) return null
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />

  function switchAccount() {
    const back = location.pathname + location.search
    logout()
    navigate(loginPath(back), { replace: true })
  }

  return (
    <div className="auth-page">
      <div className="auth-card connect-card">
        <img src="/icon-192.png" alt="OpuLi" className="auth-logo connect-logo" width={64} height={64} />
        {requestId ? (
          <ConnectRequest requestId={requestId} />
        ) : (
          <Expired />
        )}
        <p className="connect-account">
          מחובר/ת בתור <b dir="ltr">{user.email}</b> ·{' '}
          <button type="button" className="connect-link" onClick={switchAccount}>
            החלפת חשבון
          </button>
        </p>
      </div>
    </div>
  )
}

function Expired() {
  return (
    <>
      <h1>הבקשה לא נמצאה</h1>
      <p className="auth-subtitle">
        אולי פג תוקפה (יש 10 דקות לאשר) או שכבר אישרת אותה. חזרו לאפליקציה ונסו להתחבר שוב.
      </p>
      <Link to="/ai" className="connect-help">
        איך מחברים את OpuLi ל-Claude או ל-ChatGPT?
      </Link>
    </>
  )
}

function ConnectRequest({ requestId }: { requestId: string }) {
  const request = useOAuthRequest(requestId)
  const decide = useOAuthDecision(requestId)
  const [allowWrite, setAllowWrite] = useState(true)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (request.isPending) return <p className="auth-subtitle">טוען…</p>
  if (request.isError || !request.data) return <Expired />

  const { known_app: knownApp, client_name: clientName, redirect_host: host, scopes } = request.data
  // לאפליקציה לא מוכרת מציגים את הדומיין - את השם היא בחרה לעצמה
  const appName = knownApp ?? host
  const canWrite = scopes.includes('opuli.write')

  async function submit(approve: boolean) {
    setError(null)
    const granted: AiScope[] = canWrite && allowWrite ? ['opuli.read', 'opuli.write'] : ['opuli.read']
    try {
      const { redirect_to } = await decide.mutateAsync({ approve, scopes: approve ? granted : [] })
      setLeaving(true)
      window.location.assign(redirect_to)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'משהו השתבש. נסו שוב.')
    }
  }

  if (leaving) return <p className="auth-subtitle">מעבירים חזרה אל {appName}…</p>

  return (
    <>
      <h1>
        {knownApp ? knownApp : <>&quot;{clientName}&quot;</>} רוצה להתחבר לחשבון OpuLi שלך
      </h1>
      <p className="connect-host">
        {knownApp ? '✓ ' : ''}
        האישור יישלח אל <b dir="ltr">{host}</b>
      </p>
      {!knownApp && (
        <div className="connect-warning" role="note">
          את האפליקציה הזו אנחנו לא מכירים. אשרו רק אם אתם התחלתם עכשיו את החיבור ואתם סומכים עליה. אם קיבלתם את הקישור ממישהו אחר, אל תאשרו.
        </div>
      )}

      {error && <div className="auth-error">{error}</div>}

      <div className="connect-scopes">
        <div className="connect-scope">
          <span className="connect-scope__check" aria-hidden>
            ✓
          </span>
          <span>
            <b>קריאה</b>
            <span className="connect-scope__sub">התארים, הקורסים, המטלות, המבחנים, הציונים, התזכורות ומערכת השעות</span>
          </span>
        </div>
        {canWrite && (
          <label className="connect-scope">
            <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} />
            <span>
              <b>הוספה, עדכון ומחיקה</b>
              <span className="connect-scope__sub">הוספה ועדכון של קורסים, מטלות, מבחנים, ציונים, תזכורות, שיעורים ומפגשים, ומחיקה של תזכורות, מטלות, מבחנים ומפגשים (תמיד באישור שלך). תואר וקורס אפשר למחוק רק באתר.</span>
            </span>
          </label>
        )}
      </div>

      <div className="connect-actions">
        <Button type="button" onClick={() => submit(true)} disabled={decide.isPending}>
          אישור
        </Button>
        <Button type="button" variant="secondary" onClick={() => submit(false)} disabled={decide.isPending}>
          ביטול
        </Button>
      </div>
      <p className="connect-note">
        החיבור פועל רק כשמבקשים משהו מ-{appName}. אפשר לנתק בכל רגע בפרופיל, תחת &quot;חיבור ל-AI&quot;.{' '}
        <Link to="/ai">עוד על החיבור</Link>
      </p>
    </>
  )
}
