import { Link } from 'react-router-dom'
import { INFO_LINKS } from '@/lib/site'
import './Landing.css'

const FEATURES = [
  {
    image: '/landing/home.webp',
    title: 'מה מחכה לי השבוע',
    text: 'מטלות, מבחנים ותזכורות מכל הקורסים ברשימה אחת, לפי תאריך.',
  },
  {
    image: '/landing/calculator.webp',
    title: 'כמה צריך בבחינה',
    text: 'מזינים את ציוני הממ"נים ואת הציון הסופי שרוצים, ומקבלים את הציון שצריך בבחינה.',
  },
  {
    image: '/landing/requirements.webp',
    title: 'כמה נ"ז נשארו לי',
    text: 'בוחרים תואר מתבנית, והקורסים, הקטגוריות ודרישות התואר נטענים לבד.',
  },
]

/** דף פתיחה למי שלא מחובר/ת: מה זה OpuLi, ושני כפתורים להרשמה ולהתחברות */
export default function Landing() {
  return (
    <div className="landing">
      <section className="landing__hero">
        <h1>כל התואר במקום אחד</h1>
        <p>
          OpuLi עוזרת לסטודנטים באוניברסיטה הפתוחה לעקוב אחרי הקורסים, המטלות, המבחנים והנ"ז, ולדעת בכל רגע מה צריך לעשות השבוע.
        </p>
        <div className="landing__actions">
          <Link to="/register" className="ui-button ui-button--primary">
            הרשמה בחינם
          </Link>
          <Link to="/login" className="ui-button ui-button--secondary">
            התחברות
          </Link>
        </div>
      </section>

      <div className="landing__features">
        {FEATURES.map((f) => (
          <figure key={f.title} className="landing__feature">
            <img src={f.image} alt={`צילום מסך: ${f.title}`} width={390} loading="lazy" />
            <figcaption>
              <h2>{f.title}</h2>
              <p>{f.text}</p>
            </figcaption>
          </figure>
        ))}
      </div>

      <section className="landing__cta">
        <h2>מתחילים בשתי דקות</h2>
        <p>נרשמים, בוחרים את התואר מהרשימה, ומסמנים אילו קורסים כבר עשיתם.</p>
        <Link to="/register" className="ui-button ui-button--primary">
          הרשמה בחינם
        </Link>
      </section>

      <nav className="info-page__more landing__links" aria-label="מידע">
        {INFO_LINKS.map((l) => (
          <Link key={l.id} to={l.path}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
