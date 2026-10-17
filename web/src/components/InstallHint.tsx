import { useEffect, useState } from 'react'
import { Button, Card } from '@/components/ui'

// האירוע של כרום באנדרואיד לפני שהוא מציע להתקין - לא מוגדר ב-lib.dom
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

const isPhone = () => window.matchMedia('(max-width: 640px)').matches
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** הסבר להוספת האתר למסך הבית. מוצג רק בטלפון, ורק כשהאתר לא כבר פתוח כאפליקציה. */
export function InstallHint() {
  const [show] = useState(() => isPhone() && !isStandalone())
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!show) return null
  return (
    <div className="profile-section">
      <h2>OpuLi במסך הבית</h2>
      <Card>
        <p className="profile-hint">כך האתר נפתח בלחיצה אחת, במסך מלא, כמו אפליקציה.</p>
        {prompt ? (
          <Button
            onClick={async () => {
              await prompt.prompt()
              setPrompt(null)
            }}
          >
            הוספה למסך הבית
          </Button>
        ) : isIos() ? (
          <p className="install-hint__steps">
            בספארי לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה), ובוחרים <b>הוספה למסך הבית</b>.
          </p>
        ) : (
          <p className="install-hint__steps">
            בכרום לוחצים על התפריט ⋮ למעלה, ובוחרים <b>הוספה למסך הבית</b> או <b>התקנת אפליקציה</b>.
          </p>
        )}
      </Card>
    </div>
  )
}
