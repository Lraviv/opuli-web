import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button, Input } from '@/components/ui'
import { SiteFooter } from '@/components/SiteFooter'
import { ApiError, api } from '@/lib/api'
import './AuthLayout.css'

/** "שכחתי סיסמה": שולח קישור לאיפוס. ההודעה זהה בין אם הכתובת רשומה ובין אם לא. */
export default function ForgotPassword() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.post('/auth/forgot-password', { email: email.trim() }, false)
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'לא הצלחנו לשלוח את הקישור, נסו שוב')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/icon-192.png" alt="OpuLi" className="auth-logo" width={96} height={96} />
        <h1>שכחתי סיסמה</h1>
        {sent ? (
          <>
            <div className="auth-success" role="status">
              אם יש חשבון עם הכתובת {email.trim()}, שלחנו אליה קישור לבחירת סיסמה חדשה. הקישור תקף לחצי שעה.
            </div>
            <p className="auth-hint">לא הגיע? כדאי לבדוק בספאם, או לנסות שוב בעוד דקה.</p>
          </>
        ) : (
          <>
            <p className="auth-subtitle">נשלח אליך קישור לבחירת סיסמה חדשה</p>
            {error && <div className="auth-error">{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="email">אימייל</label>
                <Input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" disabled={busy} style={{ width: '100%' }}>
                {busy ? 'שולחים…' : 'שליחת קישור'}
              </Button>
            </form>
          </>
        )}
        <div className="auth-switch">
          <Link to="/login">חזרה להתחברות</Link>
        </div>
      </div>
      <SiteFooter variant="auth" />
    </div>
  )
}
