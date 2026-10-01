import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Button, Input } from '@/components/ui'
import { SiteFooter } from '@/components/SiteFooter'
import { ApiError, api } from '@/lib/api'
import type { TokenResponse } from '@/lib/types'
import './AuthLayout.css'

/** בחירת סיסמה חדשה מהקישור שבמייל. בסיום מתחברים אוטומטית. */
export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { loginWithTokens } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!token) return <Navigate to="/forgot-password" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('הסיסמה צריכה להכיל לפחות 8 תווים')
    if (password !== confirm) return setError('שתי הסיסמאות לא זהות')
    setBusy(true)
    try {
      const tokens = await api.post<TokenResponse>('/auth/reset-password', { token, password }, false)
      await loginWithTokens(tokens)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'לא הצלחנו לעדכן את הסיסמה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/icon-192.png" alt="OpuLi" className="auth-logo" width={96} height={96} />
        <h1>סיסמה חדשה</h1>
        <p className="auth-subtitle">בוחרים סיסמה חדשה ונכנסים ישר לחשבון</p>
        {error && (
          <div className="auth-error" role="alert">
            {error}
            {error.includes('קישור') && (
              <>
                {' '}
                <Link to="/forgot-password">לבקשת קישור חדש</Link>
              </>
            )}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label htmlFor="password">סיסמה חדשה</label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="auth-hint">לפחות 8 תווים</p>
          </div>
          <div className="auth-field">
            <label htmlFor="confirm">אימות הסיסמה</label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'שומרים…' : 'שמירה והתחברות'}
          </Button>
        </form>
      </div>
      <SiteFooter variant="auth" />
    </div>
  )
}
