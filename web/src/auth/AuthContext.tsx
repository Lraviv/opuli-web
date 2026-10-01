import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, clearTokens, getAccessToken, setTokens } from '@/lib/api'
import type { TokenResponse, UserRead } from '@/lib/types'

interface AuthContextValue {
  user: UserRead | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  /** התחברות עם טוקנים שכבר התקבלו (למשל אחרי איפוס סיסמה) */
  loginWithTokens: (tokens: TokenResponse) => Promise<void>
  logout: () => void
  updateUser: (user: UserRead) => void
}

// מחיל את העדפות התצוגה של המשתמש/ת על המסמך: צבע ראשי ומצב בהיר/כהה.
function applyUserPreferences(user: UserRead | null) {
  const root = document.documentElement
  if (user?.accent_color) {
    root.style.setProperty('--color-primary', user.accent_color)
    root.style.setProperty('--color-primary-soft', `color-mix(in srgb, ${user.accent_color} 55%, white)`)
  } else {
    root.style.removeProperty('--color-primary')
    root.style.removeProperty('--color-primary-soft')
  }
  const mode = user?.theme_mode
  if (mode === 'light' || mode === 'dark') root.setAttribute('data-theme', mode)
  else root.removeAttribute('data-theme')
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  const lastUserId = useRef<number | null>(null)

  useEffect(() => {
    applyUserPreferences(user)
  }, [user])

  async function loadMe() {
    try {
      const me = await api.get<UserRead>('/me')
      // משתמש אחר מהקודם (או התחברות ראשונה בטאב) - מוחקים כל נתון שנשאר בזיכרון,
      // כדי שאף מסך לא יציג לרגע נתונים של חשבון קודם
      if (lastUserId.current !== me.id) queryClient.clear()
      lastUserId.current = me.id
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (getAccessToken()) {
      loadMe()
    } else {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function login(email: string, password: string) {
    const tokens = await api.post<TokenResponse>('/auth/login', { email, password }, false)
    setTokens(tokens.access_token, tokens.refresh_token)
    await loadMe()
  }

  async function register(email: string, password: string, displayName: string) {
    const tokens = await api.post<TokenResponse>(
      '/auth/register',
      { email, password, display_name: displayName || null },
      false,
    )
    setTokens(tokens.access_token, tokens.refresh_token)
    await loadMe()
  }

  async function loginWithGoogle(credential: string) {
    const tokens = await api.post<TokenResponse>('/auth/google', { credential }, false)
    setTokens(tokens.access_token, tokens.refresh_token)
    await loadMe()
  }

  async function loginWithTokens(tokens: TokenResponse) {
    setTokens(tokens.access_token, tokens.refresh_token)
    await loadMe()
  }

  function logout() {
    clearTokens()
    lastUserId.current = null
    setUser(null)
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, loginWithTokens, logout, updateUser: setUser }}>{children}</AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth חייב לרוץ בתוך AuthProvider')
  return ctx
}
