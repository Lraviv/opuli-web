import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button, Input } from '@/components/ui'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { ApiError, safeNext } from '@/lib/api'
import './AuthLayout.css'

export default function Register() {
  const { loginWithGoogle, register, user, loading } = useAuth()
  const navigate = useNavigate()
  // אחרי ההתחברות חוזרים לעמוד שממנו הגיעו (למשל אישור חיבור AI ב-/connect)
  const [searchParams] = useSearchParams()
  const next = safeNext(searchParams.get('next'))
  const nextQuery = next !== '/' ? `?next=${encodeURIComponent(next)}` : ''
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to={next} replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים')
      return
    }
    setBusy(true)
    try {
      await register(email, password, displayName)
      navigate(next)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ההרשמה נכשלה')
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
      setError(err instanceof ApiError ? err.message : 'ההרשמה עם Google נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/icon-192.png" alt="OpuLi" className="auth-logo" width={96} height={96} />
        <h1>יצירת חשבון</h1>
        <p className="auth-subtitle">בואו נתחיל לארגן את התואר שלך</p>
        {error && <div className="auth-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="displayName">שם תצוגה</label>
            <Input id="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
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
            {busy ? 'יוצרים חשבון…' : 'הרשמה'}
          </Button>
        </form>
        <GoogleSignInButton onCredential={handleGoogle} onError={setError} />
        <div className="auth-switch">
          כבר יש לך חשבון? <Link to={`/login${nextQuery}`}>התחברות</Link>
        </div>
        <p className="auth-legal">
          ההרשמה מהווה הסכמה ל<Link to="/terms">תנאי השימוש</Link> ול<Link to="/privacy">מדיניות הפרטיות</Link>
        </p>
      </div>
    </div>
  )
}
