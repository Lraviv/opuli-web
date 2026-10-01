import { useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { Button, Card, Input } from '@/components/ui'
import { API_URL, api } from '@/lib/api'
import { useRevokeCalendarToken, useRotateCalendarToken } from '@/lib/queries'
import './CalendarExport.css'

/** ייצוא ליומן: הורדת .ics חד-פעמית, או כתובת מנוי שמתעדכנת אוטומטית (Google / Apple / Outlook). */
export function CalendarExport() {
  const { user, updateUser } = useAuth()
  const rotate = useRotateCalendarToken()
  const revoke = useRevokeCalendarToken()
  const [downloading, setDownloading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = user?.calendar_token ?? null
  const feedUrl = token ? `${API_URL}/calendar/feed/${token}.ics` : null
  const webcalUrl = feedUrl?.replace(/^https?:/, 'webcal:')
  const googleUrl = webcalUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}` : null

  async function handleDownload() {
    setError(null)
    setDownloading(true)
    try {
      await api.download('/calendar.ics', 'opuli.ics')
    } catch {
      setError('ההורדה נכשלה. נסו שוב בעוד רגע.')
    } finally {
      setDownloading(false)
    }
  }

  async function handleCreate() {
    if (token && !confirm('הכתובת הנוכחית תפסיק לעבוד, וצריך יהיה להוסיף את החדשה ליומן מחדש. להמשיך?')) return
    setError(null)
    try {
      const { token: newToken } = await rotate.mutateAsync()
      if (user) updateUser({ ...user, calendar_token: newToken })
    } catch {
      setError('לא הצלחנו ליצור כתובת מנוי.')
    }
  }

  async function handleRevoke() {
    if (!confirm('לבטל את כתובת המנוי? יומנים שמנויים אליה יפסיקו להתעדכן.')) return
    setError(null)
    try {
      await revoke.mutateAsync()
      if (user) updateUser({ ...user, calendar_token: null })
    } catch {
      setError('לא הצלחנו לבטל את המנוי.')
    }
  }

  async function handleCopy() {
    if (!feedUrl) return
    try {
      await navigator.clipboard.writeText(feedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('ההעתקה לא נתמכת בדפדפן הזה - אפשר לסמן את הכתובת ולהעתיק ידנית.')
    }
  }

  return (
    <Card className="ce">
      <div className="ce__block">
        <div className="ce__text">
          <h3>מנוי ביומן</h3>
          <p>מבחנים, הגשות, מפגשים ותזכורות מופיעים ביומן שלך ומתעדכנים לבד. Google מרענן מנויים כל כמה שעות.</p>
        </div>
        {!feedUrl ? (
          <Button type="button" onClick={handleCreate} disabled={rotate.isPending}>
            יצירת כתובת מנוי
          </Button>
        ) : (
          <div className="ce__feed">
            <div className="ce__url">
              <Input readOnly value={feedUrl} dir="ltr" aria-label="כתובת המנוי" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="secondary" onClick={handleCopy}>
                {copied ? 'הועתק' : 'העתקה'}
              </Button>
            </div>
            <div className="ce__actions">
              <a className="ui-button ui-button--primary" href={googleUrl!} target="_blank" rel="noopener noreferrer">
                הוספה ליומן Google
              </a>
              <a className="ui-button ui-button--secondary" href={webcalUrl!}>
                Apple / Outlook
              </a>
            </div>
            <p className="ce__private">
              הכתובת אישית - כל מי שמחזיק בה יכול לראות את הלו"ז שלך.{' '}
              <button type="button" className="ce__link" onClick={handleCreate} disabled={rotate.isPending}>
                החלפת כתובת
              </button>{' '}
              ·{' '}
              <button type="button" className="ce__link ce__link--danger" onClick={handleRevoke} disabled={revoke.isPending}>
                ביטול המנוי
              </button>
            </p>
          </div>
        )}
      </div>

      <div className="ce__block ce__block--secondary">
        <div className="ce__text">
          <h3>קובץ חד-פעמי</h3>
          <p>קובץ ‎.ics לייבוא ידני. לא מתעדכן אחרי ההורדה.</p>
        </div>
        <Button type="button" variant="secondary" onClick={handleDownload} disabled={downloading}>
          {downloading ? 'מוריד…' : 'הורדת קובץ'}
        </Button>
      </div>

      {error && (
        <p className="ce__error" role="alert">
          {error}
        </p>
      )}
    </Card>
  )
}
