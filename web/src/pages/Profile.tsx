import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { Button, Card, Input } from '@/components/ui'
import { AccentColorPresets } from '@/lib/constants'
import { useUpdateSettings } from '@/lib/queries'
import type { UserSettingsUpdate } from '@/lib/queries'
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

      <div className="profile-section">
        <Button variant="danger" onClick={logout} style={{ width: '100%' }}>
          התנתקות
        </Button>
      </div>
    </div>
  )
}
