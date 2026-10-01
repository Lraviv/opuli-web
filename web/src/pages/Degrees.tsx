import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { NewDegreeForm } from '@/components/NewDegreeForm'
import { DEFAULT_DEGREE_ICON } from '@/lib/constants'
import { useDegrees } from '@/lib/queries'
import './Degrees.css'

export default function Degrees() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const showAll = searchParams.get('all') === '1'
  // ?new=1 - הגעה מכפתור "הוספת תואר" (למשל במסך הבית) פותחת ישר את הטופס
  const showForm = searchParams.get('new') === '1'
  const { data: degrees, isLoading } = useDegrees()
  const [search, setSearch] = useState('')

  function setShowForm(open: boolean) {
    const next = new URLSearchParams(searchParams)
    if (open) next.set('new', '1')
    else next.delete('new')
    setSearchParams(next, { replace: true })
  }

  // אם יש בדיוק תואר אחד - נכנסים ישר אליו, בלי להציג קודם רשימה עם פריט
  // יחיד. אפשר להגיע בכל זאת לרשימה (כדי להוסיף תואר שני) דרך קישור עם
  // ?all=1 - ראו הקישור "כל התארים" במסך התואר.
  if (degrees && degrees.length === 1 && !showAll && !showForm) {
    return <Navigate to={`/degrees/${degrees[0].id}`} replace />
  }

  const query = search.trim().toLowerCase()
  const filteredDegrees = degrees?.filter(
    (d) => !query || d.name.toLowerCase().includes(query) || d.institution?.toLowerCase().includes(query),
  )
  const hasDegrees = !!degrees && degrees.length > 0

  return (
    <div>
      <div className="degrees-header">
        <h1>{showForm ? 'תואר חדש' : 'התארים שלי'}</h1>
        {!showForm && <Button onClick={() => setShowForm(true)}>+ תואר חדש</Button>}
      </div>

      {showForm && (
        <Card style={{ marginBottom: 'var(--space-four)' }}>
          <NewDegreeForm
            onCreated={(degree) => navigate(`/degrees/${degree.id}`, { replace: true })}
            onCancel={hasDegrees ? () => setShowForm(false) : () => navigate('/')}
          />
        </Card>
      )}

      {showForm ? null : isLoading ? (
        <p>טוען…</p>
      ) : !hasDegrees ? (
        <EmptyState title="עוד אין תארים" subtitle="הוסיפו תואר כדי להתחיל לעקוב אחרי הקורסים" />
      ) : (
        <div className="degrees-grid">
          <Input
            type="search"
            placeholder="חיפוש תואר לפי שם או מוסד…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filteredDegrees!.length === 0 && <EmptyState title="לא נמצאו תארים תואמים" />}
          {filteredDegrees!.map((degree) => (
            <Link key={degree.id} to={`/degrees/${degree.id}`}>
              <Card className="degree-card">
                <span className="degree-card__icon" aria-hidden>
                  {degree.icon || DEFAULT_DEGREE_ICON}
                </span>
                <div className="degree-card__body">
                  <h3>{degree.name}</h3>
                  {degree.institution && <p>{degree.institution}</p>}
                </div>
                <span aria-hidden>←</span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
