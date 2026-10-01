import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { Button, Card, Input } from '@/components/ui'
import { AccentColorPresets } from '@/lib/constants'
import { useSendFeedback, useUpdateSettings } from '@/lib/queries'
import type { FeedbackCategory, UserSettingsUpdate } from '@/lib/queries'
import type { ThemeModePreference } from '@/lib/types'
import './Profile.css'

const THEME_LABEL: Record<ThemeModePreference, string> = { system: 'מערכת', light: 'בהיר', dark: 'כהה' }

export default function Profile() {
  const { user, logout, updateUser } = useAuth()
  const updateSettings = useUpdateSettings()
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')

  if (!user) return null

  const accent = user.accent_color ?? AccentColorPresets[0].value
  const themeMode = (user.theme_mode as ThemeModePreference) ?? 'system'

  // עדכון אופטימי: הבחירה נצבעת ומוחלת מיד, ואם השמירה בשרת נכשלת - חוזרים לערך הקודם.
  async function saveSettings(payload: UserSettingsUpdate) {
    const previous = user!
    updateUser({ ...previous, ...payload })
    try {
      updateUser(await updateSettings.mutateAsync(payload))
    } catch {
      updateUser(previous)
    }
  }

  async function handleSaveName(e: FormEvent) {
    e.preventDefault()
    await saveSettings({ display_name: displayName })
  }

  return (
    <div>
      <div className="profile-header">
        <div className="profile-avatar">{(user.display_name || user.email)[0]?.toUpperCase()}</div>
        <div>
          <h1>{user.display_name || user.email}</h1>
          <p>{user.email}</p>
        </div>
      </div>

      <div className="profile-section">
        <h2>שם תצוגה</h2>
        <Card>
          <form className="cd-inline-form" onSubmit={handleSaveName} style={{ display: 'flex', gap: 8 }}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            <Button type="submit" disabled={updateSettings.isPending}>
              שמירה
            </Button>
          </form>
        </Card>
      </div>

      <div className="profile-section">
        <h2>צבע ראשי</h2>
        <Card>
          <div className="swatch-grid">
            {AccentColorPresets.map((preset) => (
              <button
                key={preset.value}
                aria-label={preset.label}
                className={`swatch${accent === preset.value ? ' swatch--selected' : ''}`}
                style={{ background: preset.value }}
                onClick={() => saveSettings({ accent_color: preset.value })}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="profile-section">
        <h2>מצב תצוגה</h2>
        <Card>
          <div className="theme-mode-row">
            {(['system', 'light', 'dark'] as ThemeModePreference[]).map((mode) => (
              <Button
                key={mode}
                variant={themeMode === mode ? 'primary' : 'secondary'}
                onClick={() => saveSettings({ theme_mode: mode })}
              >
                {THEME_LABEL[mode]}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      <FeedbackSection />

      <div className="profile-section">
        <Button variant="danger" onClick={logout} style={{ width: '100%' }}>
          התנתקות
        </Button>
      </div>
    </div>
  )
}

const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: '🐞 באג' },
  { value: 'idea', label: '💡 רעיון' },
  { value: 'other', label: '💬 אחר' },
]

const FEEDBACK_EMAIL = 'lihirweb@gmail.com'

/** גיבוי כששליחה דרך השרת נכשלת: mailto עם נושא וגוף ממולאים מראש. */
function mailtoHref(category: FeedbackCategory, message: string): string {
  const label = FEEDBACK_CATEGORIES.find((c) => c.value === category)?.label.replace(/^\S+\s/, '') ?? ''
  const subject = `[OpuLi · ${label}] ${message.trim().slice(0, 60)}`
  const body = `${message.trim()}\n\n---\nעמוד: ${window.location.pathname}\nדפדפן: ${navigator.userAgent}`
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function FeedbackSection() {
  const sendFeedback = useSendFeedback()
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (message.trim().length < 3) return
    try {
      await sendFeedback.mutateAsync({ category, message: message.trim(), page: window.location.pathname })
      setMessage('')
      setSent(true)
    } catch {
      // השגיאה מוצגת מתוך sendFeedback.error
    }
  }

  return (
    <div className="profile-section">
      <h2>משוב ודיווח על באגים</h2>
      <Card>
        <form className="feedback-form" onSubmit={handleSubmit}>
          <div className="feedback-categories" role="radiogroup" aria-label="סוג המשוב">
            {FEEDBACK_CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={category === c.value}
                className={`feedback-chip${category === c.value ? ' feedback-chip--selected' : ''}`}
                onClick={() => setCategory(c.value)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <textarea
            className="ui-input feedback-message"
            rows={4}
            maxLength={5000}
            aria-label="תוכן המשוב"
            placeholder={category === 'bug' ? 'מה קרה? באיזה מסך? מה ציפית שיקרה?' : 'ספרו לנו מה אפשר לשפר…'}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
              setSent(false)
            }}
          />
          {sent && <p className="feedback-status feedback-status--ok">תודה! המשוב נשלח 💌</p>}
          {sendFeedback.isError && (
            <div className="feedback-fallback">
              <p className="feedback-status feedback-status--error">
                {(sendFeedback.error as Error).message}. אפשר לשלוח דרך אפליקציית המייל במקום:
              </p>
              <a className="ui-button ui-button--secondary" href={mailtoHref(category, message)}>
                ✉️ פתיחה באפליקציית המייל
              </a>
            </div>
          )}
          <Button type="submit" disabled={sendFeedback.isPending || message.trim().length < 3}>
            {sendFeedback.isPending ? 'שולח…' : 'שליחה'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
