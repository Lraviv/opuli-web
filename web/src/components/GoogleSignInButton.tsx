import { useEffect, useLayoutEffect, useRef } from 'react'

// Google Identity Services - https://developers.google.com/identity/gsi/web
interface GoogleIdApi {
  initialize(config: { client_id: string; callback: (res: { credential: string }) => void }): void
  renderButton(el: HTMLElement, options: Record<string, unknown>): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } }
  }
}

const GOOGLE_CLIENT_ID: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined

let scriptPromise: Promise<void> | null = null
function loadGoogleScript(): Promise<void> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('טעינת Google נכשלה'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/** הכפתור הרשמי של Google. מחזיר את ה-ID token ("credential") ל-onCredential. */
export function GoogleSignInButton({
  onCredential,
  onError,
}: {
  onCredential: (credential: string) => void
  onError: (message: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  // ה-callback נרשם פעם אחת אצל Google - מחזיקים את הגרסה העדכנית ב-ref
  const callbacks = useRef({ onCredential, onError })
  useLayoutEffect(() => {
    callbacks.current = { onCredential, onError }
  })

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return
    let cancelled = false
    loadGoogleScript()
      .then(() => {
        const el = containerRef.current
        if (cancelled || !el || !window.google) return
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID!,
          callback: (res) => callbacks.current.onCredential(res.credential),
        })
        window.google.accounts.id.renderButton(el, {
          type: 'standard',
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'he',
          width: Math.min(el.offsetWidth || 320, 400),
        })
      })
      .catch((err: Error) => callbacks.current.onError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  if (!GOOGLE_CLIENT_ID) return null
  return (
    <>
      <div className="auth-divider">
        <span>או</span>
      </div>
      <div ref={containerRef} className="auth-google" />
    </>
  )
}
