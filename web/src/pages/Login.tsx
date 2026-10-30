import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button, Input } from '@/components/ui'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { ApiError, safeNext } from '@/lib/api'
import './AuthLayout.css'

export default function Login() {
  const { loginWithGoogle, login, user, loading } = useAuth()
  const navigate = useNavigate()
  // אחרי ההתחברות חוזרים לעמוד שממנו הגיעו (למשל אישור חיבור AI ב-/connect)
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const nextQuery = next !== '/' ? `?next=${encodeURIComponent(next)}` : ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={next} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההתחברות נכשלה')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle(credential: string) {
    setError(null)
    setBusy(true)
    try {
      await loginWithGoogle(credential)
      navigate(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההתחברות עם Google נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/icon-192.png" alt="OpuLi" className="auth-logo" width={96} height={96} />
        <h1>ברוכים הבאים</h1>
        <p className="auth-subtitle">התחברו כדי להמשיך לנהל את התואר שלך</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="email">אימייל</label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="auth-field">
            <label htmlFor="password">סיסמה</label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'מתחברים…' : 'התחברות'}
          </Button>
        </form>
        <GoogleSignInButton onCredential={handleGoogle} onError={setError} />
        <div className="auth-switch">
          עוד אין לך חשבון? <Link to={`/register${nextQuery}`}>הרשמה</Link>
        </div>
        <p className="auth-legal">
          <Link to="/help">עזרה</Link> · <Link to="/privacy">פרטיות</Link> · <Link to="/terms">תנאי שימוש</Link>
        </p>
      </div>
    </div>
  )
}
