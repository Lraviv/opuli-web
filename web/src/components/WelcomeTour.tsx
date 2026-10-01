import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './WelcomeTour.css'

interface Slide {
  icon: string
  title: string
  text: string
}

const SLIDES: Slide[] = [
  {
    icon: '🎓',
    title: 'ברוכים הבאים ל-OpuLi',
    text: 'מקום אחד לכל התואר: הקורסים, המטלות, המבחנים, ומה שצריך לעשות השבוע. בלי לקפוץ בין שאילתא, אופל וקובץ Excel.',
  },
  {
    icon: '📚',
    title: 'התואר והקורסים',
    text: 'בוחרים תואר מתבנית והקטלוג נטען לבד. מסמנים מה הושלם, מה בתהליך ומה מתוכנן, ורואים כמה נ"ז נשארו בכל קטגוריה.',
  },
  {
    icon: '📝',
    title: 'ממ"נים וציונים',
    text: 'לכל קורס מטלות עם משקל ותאריך הגשה, סטטוס זכאות לבחינה, ומחשבון שאומר כמה צריך בבחינה כדי להגיע לציון שרוצים.',
  },
  {
    icon: '📅',
    title: 'הלו"ז שלך',
    text: 'מפגשי הנחיה, הגשות ומבחנים בתצוגה שבועית. אפשר גם לחבר הכול ליומן Google, והוא יתעדכן לבד.',
  },
  {
    icon: '🔗',
    title: 'קישורים ועזרה',
    text: 'שאילתא, אופל והקלטות במרחק לחיצה. מצאת באג או יש לך רעיון? "צרו קשר" נמצא בתחתית כל עמוד.',
  },
]

/**
 * חלון הסבר להתחברות הראשונה: <dialog> מודאלי (showModal - מלכודת פוקוס ו-Esc
 * מובנים), נסגר גם בלחיצה על הרקע. onClose נקרא בכל דרך סגירה.
 */
export function WelcomeTour({ open, hasDegree, onClose }: { open: boolean; hasDegree: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const [index, setIndex] = useState(0)
  const navigate = useNavigate()
  const last = index === SLIDES.length - 1
  const slide = SLIDES[index]

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setIndex(0)
      dialog.showModal()
      // showModal מעביר פוקוס לרכיב הראשון ("דילוג") - מעדיפים את הכפתור הראשי
      primaryRef.current?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // סגירה בלחיצה על הרקע: closedby="any" בדפדפנים שתומכים, וגיבוי ידני לשאר (Safari)
    dialog.setAttribute('closedby', 'any')
    const handleClose = () => onClose()
    const handleBackdropClick = (event: MouseEvent) => {
      if ('closedBy' in HTMLDialogElement.prototype || event.target !== dialog) return
      const r = dialog.getBoundingClientRect()
      const inside = r.top <= event.clientY && event.clientY <= r.bottom && r.left <= event.clientX && event.clientX <= r.right
      if (!inside) dialog.close()
    }
    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('click', handleBackdropClick)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('click', handleBackdropClick)
    }
  }, [onClose])

  function finish() {
    ref.current?.close()
    if (!hasDegree) navigate('/degrees?new=1')
  }

  return (
    <dialog ref={ref} className="tour" aria-labelledby="tour-title" aria-describedby="tour-text">
      <div className="tour__top">
        <span className="tour__step" aria-live="polite">
          {index + 1} מתוך {SLIDES.length}
        </span>
        <button type="button" className="tour__skip" onClick={() => ref.current?.close()}>
          {last ? 'סגירה' : 'דילוג'}
        </button>
      </div>

      <div className="tour__body" key={index}>
        <div className="tour__icon" aria-hidden>
          {slide.icon}
        </div>
        <h2 id="tour-title" className="tour__title">
          {slide.title}
        </h2>
        <p id="tour-text" className="tour__text">
          {slide.text}
        </p>
      </div>

      <div className="tour__dots" role="tablist" aria-label="שלבי ההסבר">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${i + 1}: ${s.title}`}
            className={`tour__dot${i === index ? ' tour__dot--active' : ''}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>

      <div className="tour__actions">
        {index > 0 && (
          <button type="button" className="ui-button ui-button--secondary" onClick={() => setIndex(index - 1)}>
            הקודם
          </button>
        )}
        {/* כפתור אחד שמשנה תווית (ולא שני כפתורים) - כדי שהפוקוס לא יאבד בשקף האחרון */}
        <button
          ref={primaryRef}
          type="button"
          className="ui-button ui-button--primary tour__next"
          onClick={last ? finish : () => setIndex(index + 1)}
        >
          {last ? (hasDegree ? 'מתחילים' : 'להוספת התואר שלי') : 'הבא'}
        </button>
      </div>
    </dialog>
  )
}
