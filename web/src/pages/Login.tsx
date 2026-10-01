import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button, Input } from '@/components/ui'
import { GoogleSignInButton } from '@/components/GoogleSignInButton'
import { ApiError } from '@/lib/api'
import './AuthLayout.css'

export default function Login() {
  const { loginWithGoogle, login, user, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      navigate('/')
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
      navigate('/')
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
        <h1>ברוכה הבאה</h1>
        <p className="auth-subtitle">התחברי כדי להמשיך לנהל את התואר שלך</p>
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
            {busy ? 'מתחברת…' : 'התחברות'}
          </Button>
        </form>
        <GoogleSignInButton onCredential={handleGoogle} onError={setError} />
        <div className="auth-switch">
          עוד אין לך חשבון? <Link to="/register">הרשמה</Link>
        </div>
      </div>
    </div>
  )
}
