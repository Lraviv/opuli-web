import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAiConnections } from '@/lib/queries'
import './AiPromo.css'

const DISMISS_KEY = 'opuli_ai_promo_dismissed'

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/** באנר בעמוד הבית: אפשר לבקש מ-Claude / ChatGPT להוסיף מטלות ומבחנים במקום להקליד ידנית.
 *  נעלם אחרי סגירה, או כשכבר יש אפליקציה מחוברת. */
export function AiPromo() {
  const [dismissed, setDismissed] = useState(wasDismissed)
  const connections = useAiConnections()

  if (dismissed || connections.isPending || connections.data?.length) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // בלי אחסון הבאנר פשוט יחזור בפעם הבאה
    }
    setDismissed(true)
  }

  return (
    <aside className="ai-promo" aria-label="חיבור ל-AI">
      <span className="ai-promo__icon" aria-hidden>
        ✨
      </span>
      <div className="ai-promo__text">
        <b>אין צורך להקליד הכול לבד</b>
        <span>
          מחברים את Claude או ChatGPT, וכותבים להם למשל "תוסיף לי את המטלות מהסילבוס" או "קיבלתי 92 בממ"ן 12". הם כבר יעדכנו כאן.
        </span>
      </div>
      <Link to="/ai" className="ui-button ui-button--primary ai-promo__cta">
        איך מחברים
      </Link>
      <button type="button" className="ai-promo__close" aria-label="סגירה" title="סגירה" onClick={dismiss}>
        ×
      </button>
    </aside>
  )
}
