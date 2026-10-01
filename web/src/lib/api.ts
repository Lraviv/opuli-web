// קליינט API דק - קורא ל-backend (FastAPI) בלבד. שום גישה ישירה ל-SQL
// מהדפדפן: כל השאילתות/כתיבות עוברות דרך ה-REST API הזה.

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const ACCESS_KEY = 'opuli_access_token'
const REFRESH_KEY = 'opuli_refresh_token'

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_KEY, access)
  localStorage.setItem(REFRESH_KEY, refresh)
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  const refresh_token = getRefreshToken()
  if (!refresh_token) return false
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    })
      .then(async (res) => {
        if (!res.ok) return false
        const data: { access_token: string; refresh_token: string } = await res.json()
        setTokens(data.access_token, data.refresh_token)
        return true
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  /** 'blob' - מחזיר את גוף התשובה כקובץ (למשל .ics), בלי פענוח JSON */
  as?: 'json' | 'blob'
}

// ה-backend שומר ומחזיר זמנים ב-UTC בלי אזור זמן (למשל "2026-10-05T09:30:00").
// בלי סימון, הדפדפן היה מפרש אותם כשעון מקומי ומזיז אותם בשעתיים-שלוש.
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/
function markUtc(_key: string, value: unknown) {
  return typeof value === 'string' && NAIVE_DATETIME.test(value) ? `${value}Z` : value
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, auth = true, as = 'json' } = options
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (auth) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && auth && !isRetry) {
    const refreshed = await tryRefresh()
    if (refreshed) return request<T>(path, options, true)
    clearTokens()
    window.location.href = '/login'
    throw new ApiError(401, 'לא מחוברת')
  }

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    let detail = res.statusText
    try {
      const data = await res.json()
      detail = data.detail ?? detail
    } catch {
      // גוף התשובה לא JSON - משאירים את statusText
    }
    throw new ApiError(res.status, detail)
  }

  if (as === 'blob') return (await res.blob()) as T
  return JSON.parse(await res.text(), markUtc) as T
}

/** מוריד קובץ מה-API (עם התחברות) ושומר אותו בדפדפן בשם filename. */
async function download(path: string, filename: string): Promise<void> {
  const blob = await request<Blob>(path, { method: 'GET', as: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown, auth = true) => request<T>(path, { method: 'POST', body, auth }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  download,
}
