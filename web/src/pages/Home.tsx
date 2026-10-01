import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { Card, EmptyState, Pill } from '@/components/ui'
import { useAllCourseItems, useCourses, useDegrees, useExams, useReminders, useUpdateReminder } from '@/lib/queries'
import './Home.css'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function Home() {
  const { user } = useAuth()
  const { data: items, isLoading: itemsLoading } = useAllCourseItems({ is_done: false })
  const { data: exams, isLoading: examsLoading } = useExams()
  const { data: courses } = useCourses()
  const { data: degrees } = useDegrees()
  const { data: reminders, isLoading: remindersLoading } = useReminders()
  const updateReminder = useUpdateReminder()

  const courseName = (courseId: number) => courses?.find((c) => c.id === courseId)?.name ?? ''

  const upcomingItems = (items ?? [])
    .filter((i) => i.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5)

  const now = Date.now()
  const upcomingExams = (exams ?? [])
    .filter((e) => new Date(e.date_time).getTime() >= now)
    .slice(0, 5)

  // תזכורות פתוחות - עם תאריך קודם (הקרוב ביותר ראשון), בלי תאריך בסוף
  const openReminders = (reminders ?? [])
    .filter((r) => !r.is_done)
    .sort((a, b) => (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity))
    .slice(0, 5)

  // סטטיסטיקות - ממוצע משוקלל לפי נ"ז, רק על קורסים שהושלמו ויש להם ציון
  const allCourses = courses ?? []
  const doneCourses = allCourses.filter((c) => c.status === 'done')
  const currentCount = allCourses.filter((c) => c.status === 'current').length
  const earnedCredits = doneCourses.reduce((sum, c) => sum + c.credits, 0)
  const graded = doneCourses.filter((c) => c.grade != null)
  const gradedCredits = graded.reduce((sum, c) => sum + c.credits, 0)
  const average = gradedCredits > 0 ? graded.reduce((sum, c) => sum + c.grade! * c.credits, 0) / gradedCredits : null
  const targetCredits = degrees?.find((d) => d.target_credits)?.target_credits ?? null
  const remainingCredits = targetCredits ? Math.max(targetCredits - earnedCredits, 0) : null
  const progressPercent = targetCredits ? Math.min((earnedCredits / targetCredits) * 100, 100) : 0

  // משתמש/ת חדש/ה בלי תואר - במקום לוח ריק, מזמינים להוסיף תואר
  if (degrees && degrees.length === 0) {
    return (
      <div>
        <h1 className="home-greeting">שלום{user?.display_name ? `, ${user.display_name}` : ''} 👋</h1>
        <p className="home-subgreeting">ברוכים הבאים! בואו נסדר את התואר שלך</p>
        <Card className="home-welcome">
          <div className="home-welcome__icon" aria-hidden>
            🎓
          </div>
          <h2 className="home-welcome__title">הוסיפו את התואר שלכם</h2>
          <p className="home-welcome__text">
            ברגע שיש תואר, כאן יופיעו ההתקדמות בנ״ז, הממוצע, המטלות והמבחנים הקרובים.
          </p>
          <ol className="home-welcome__steps">
            <li>
              <span aria-hidden>📋</span>
              <span>בוחרים תואר מתבנית - קטלוג הקורסים נטען אוטומטית</span>
            </li>
            <li>
              <span aria-hidden>✅</span>
              <span>מסמנים קורסים שהושלמו, שבתהליך ושמתוכננים</span>
            </li>
            <li>
              <span aria-hidden>📈</span>
              <span>עוקבים אחרי ההתקדמות, המטלות והמבחנים</span>
            </li>
          </ol>
          <Link to="/degrees?new=1" className="ui-button ui-button--primary home-welcome__cta">
            + הוספת תואר עכשיו
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <h1 className="home-greeting">שלום{user?.display_name ? `, ${user.display_name}` : ''} 👋</h1>
      <p className="home-subgreeting">הנה מה שמחכה לך בקרוב</p>

      <div className="home-section">
        <h2>הסטטיסטיקות שלי</h2>
        <div className="home-stats">
          <Card className="home-stat">
            <p className="home-stat__value">{doneCourses.length}</p>
            <p className="home-stat__label">קורסים שהושלמו</p>
          </Card>
          <Card className="home-stat">
            <p className="home-stat__value">{currentCount}</p>
            <p className="home-stat__label">קורסים בתהליך</p>
          </Card>
          <Card className="home-stat">
            <p className="home-stat__value">{average != null ? average.toFixed(1) : '—'}</p>
            <p className="home-stat__label">ממוצע משוקלל</p>
          </Card>
        </div>
        <Card className="home-credits">
          <div className="home-credits__row">
            <span className="home-credits__label">נקודות זכות</span>
            <span className="home-credits__value">
              {earnedCredits}
              {targetCredits ? ` / ${targetCredits}` : ''} נ"ז
            </span>
          </div>
          {targetCredits && (
            <>
              <div
                className="home-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={targetCredits}
                aria-valuenow={earnedCredits}
              >
                <div className="home-progress__bar" style={{ width: `${progressPercent}%` }} />
              </div>
              <p className="home-row__meta">
                {remainingCredits === 0 ? 'השלמת את כל הנ"ז הנדרשות לתואר 🎉' : `נשארו עוד ${remainingCredits} נ"ז להשלמת התואר`}
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="home-section">
        <div className="home-section__header">
          <h2>תזכורות</h2>
          <Link to="/reminders" className="home-section__link">
            לכל התזכורות ←
          </Link>
        </div>
        <Card>
          {remindersLoading ? (
            <p>טוען…</p>
          ) : openReminders.length === 0 ? (
            <EmptyState title="אין תזכורות פתוחות" />
          ) : (
            <div className="home-list">
              {openReminders.map((r) => {
                const overdue = r.due_date != null && new Date(r.due_date).getTime() < now
                return (
                  <label key={r.id} className="home-row home-reminder">
                    <input
                      type="checkbox"
                      checked={false}
                      aria-label={`סימון "${r.title}" כבוצע`}
                      onChange={() => updateReminder.mutate({ id: r.id, payload: { is_done: true } })}
                    />
                    <p className="home-row__title" style={{ flex: 1 }}>
                      {r.title}
                    </p>
                    {r.due_date && <Pill tone={overdue ? 'danger' : 'warning'}>{formatDateTime(r.due_date)}</Pill>}
                  </label>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="home-section">
        <h2>מטלות קרובות</h2>
        <Card>
          {itemsLoading ? (
            <p>טוען…</p>
          ) : upcomingItems.length === 0 ? (
            <EmptyState title="אין מטלות פתוחות" subtitle="את/ה מעודכנת עם הכול כרגע" />
          ) : (
            <div className="home-list">
              {upcomingItems.map((item) => (
                <Link key={item.id} to={`/courses/${item.course_id}`} className="home-row">
                  <div>
                    <p className="home-row__title">{item.title}</p>
                    <p className="home-row__meta">{courseName(item.course_id)}</p>
                  </div>
                  {item.due_date && <Pill tone="warning">{formatDate(item.due_date)}</Pill>}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="home-section">
        <h2>מבחנים קרובים</h2>
        <Card>
          {examsLoading ? (
            <p>טוען…</p>
          ) : upcomingExams.length === 0 ? (
            <EmptyState title="אין מבחנים קרובים" />
          ) : (
            <div className="home-list">
              {upcomingExams.map((exam) => (
                <Link key={exam.id} to={`/courses/${exam.course_id}`} className="home-row">
                  <div>
                    <p className="home-row__title">{courseName(exam.course_id)}</p>
                    {exam.location && <p className="home-row__meta">{exam.location}</p>}
                  </div>
                  <Pill tone="danger">{formatDate(exam.date_time)}</Pill>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
