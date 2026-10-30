import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Input } from '@/components/ui'
import { ApiError } from '@/lib/api'
import { MCP_URL } from '@/lib/site'
import { useAiConnections, useAiTokens, useCreateAiToken, useRevokeAiConnection, useRevokeAiToken } from '@/lib/queries'
import type { AiScope, AiTokenCreated } from '@/lib/types'
import './CalendarExport.css'
import './AiConnections.css'

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('he-IL') : ''
}

function scopeLabel(scopes: AiScope[]): string {
  return scopes.includes('opuli.write') ? 'קריאה, הוספה ועדכון' : 'קריאה בלבד'
}

/** כפתור העתקה עם "הועתק" לשתי שניות */
export function CopyButton({ text, label = 'העתקה' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // אין גישה ללוח - הכתובת מוצגת בשדה ואפשר לסמן ולהעתיק ידנית
    }
  }
  return (
    <Button type="button" variant="secondary" onClick={copy}>
      {copied ? 'הועתק' : label}
    </Button>
  )
}

/** הפרופיל: כתובת ה-MCP, האפליקציות שמחוברות (עם ניתוק), וטוקנים אישיים לכלים מתקדמים. */
export function AiConnections() {
  const connections = useAiConnections()
  const revokeConnection = useRevokeAiConnection()

  async function handleDisconnect(id: string, name: string) {
    if (!confirm(`לנתק את ${name}? הוא לא יוכל יותר לקרוא או לשנות דברים ב-OpuLi, עד שתחברו אותו מחדש.`)) return
    await revokeConnection.mutateAsync(id)
  }

  return (
    <Card className="ce">
      <div className="ce__block">
        <div className="ce__text">
          <h3>Claude, ChatGPT וכלי AI אחרים</h3>
          <p>
            מחברים פעם אחת, ואז אפשר לבקש מה-AI להוסיף מטלות, מבחנים ותזכורות, לעדכן ציונים או לשאול מה מחכה השבוע.{' '}
            <Link to="/ai" className="ai-link">
              הוראות חיבור
            </Link>
          </p>
        </div>
        <div className="ce__feed">
          <div className="ce__url">
            <Input readOnly value={MCP_URL} dir="ltr" aria-label="כתובת החיבור" onFocus={(e) => e.currentTarget.select()} />
            <CopyButton text={MCP_URL} />
          </div>
        </div>
      </div>

      <div className="ce__block ce__block--secondary ai-block">
        <div className="ce__text">
          <h3>אפליקציות מחוברות</h3>
          {connections.isPending ? (
            <p>טוען…</p>
          ) : !connections.data?.length ? (
            <p>עוד לא חיברת אף אפליקציה.</p>
          ) : (
            <ul className="ai-list">
              {connections.data.map((c) => (
                <li key={c.id} className="ai-item">
                  <span className="ai-item__text">
                    <b>{c.name}</b>
                    <span className="ai-item__sub">
                      {scopeLabel(c.scopes)} · חובר ב-{formatDate(c.connected_at)}
                      {c.last_used_at ? ` · שימוש אחרון ${formatDate(c.last_used_at)}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="ce__link ce__link--danger"
                    onClick={() => handleDisconnect(c.id, c.name)}
                    disabled={revokeConnection.isPending}
                  >
                    ניתוק
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <PersonalTokens />
    </Card>
  )
}

function PersonalTokens() {
  const tokens = useAiTokens()
  const create = useCreateAiToken()
  const revoke = useRevokeAiToken()
  const [name, setName] = useState('')
  const [allowWrite, setAllowWrite] = useState(true)
  const [created, setCreated] = useState<AiTokenCreated | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      setCreated(
        await create.mutateAsync({
          name: name.trim() || 'טוקן אישי',
          scopes: allowWrite ? ['opuli.read', 'opuli.write'] : ['opuli.read'],
          expires_in_days: 90,
        }),
      )
      setName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'לא הצלחנו ליצור טוקן.')
    }
  }

  async function handleRevoke(id: number, tokenName: string) {
    if (!confirm(`לבטל את הטוקן "${tokenName}"? כלים שמשתמשים בו יפסיקו לעבוד.`)) return
    if (created?.id === id) setCreated(null)
    await revoke.mutateAsync(id)
  }

  return (
    <details className="ce__block ce__block--secondary ai-block ai-tokens">
      <summary>
        <h3>טוקן אישי (מתקדם)</h3>
      </summary>
      <div className="ce__text">
        <p>
          לכלים שלא תומכים בהתחברות דרך האתר, כמו חלק מכלי הפיתוח. הטוקן הוא כמו סיסמה: אל תשתפו אותו, ובטלו אותו כשאתם כבר לא צריכים.
          תוקפו 90 יום.
        </p>

        {created && (
          <div className="ai-created" role="status">
            <p>
              <b>הטוקן מוצג רק עכשיו.</b> העתיקו אותו לכלי שלכם - אחרי שתעזבו את העמוד לא נוכל להציג אותו שוב.
            </p>
            <div className="ce__url">
              <Input readOnly value={created.token} dir="ltr" aria-label="הטוקן" onFocus={(e) => e.currentTarget.select()} />
              <CopyButton text={created.token} />
            </div>
          </div>
        )}

        {!!tokens.data?.length && (
          <ul className="ai-list">
            {tokens.data.map((t) => (
              <li key={t.id} className="ai-item">
                <span className="ai-item__text">
                  <b>{t.name}</b>
                  <span className="ai-item__sub">
                    <span dir="ltr">{t.token_prefix}…</span> · {scopeLabel(t.scopes)}
                    {t.expires_at ? ` · בתוקף עד ${formatDate(t.expires_at)}` : ''}
                    {t.last_used_at ? ` · שימוש אחרון ${formatDate(t.last_used_at)}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  className="ce__link ce__link--danger"
                  onClick={() => handleRevoke(t.id, t.name)}
                  disabled={revoke.isPending}
                >
                  ביטול
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="ai-form" onSubmit={handleCreate}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם, למשל Claude Code" maxLength={60} aria-label="שם הטוקן" />
          <label className="ai-form__write">
            <input type="checkbox" checked={allowWrite} onChange={(e) => setAllowWrite(e.target.checked)} />
            גם הוספה ועדכון
          </label>
          <Button type="submit" disabled={create.isPending}>
            יצירת טוקן
          </Button>
        </form>
        {error && (
          <p className="ce__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  )
}
