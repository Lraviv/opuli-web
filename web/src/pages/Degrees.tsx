import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { useCreateDegree, useDegrees, useDegreeTemplates } from '@/lib/queries'
import './Degrees.css'

export default function Degrees() {
  const [searchParams] = useSearchParams()
  const showAll = searchParams.get('all') === '1'
  const { data: degrees, isLoading } = useDegrees()
  const { data: templates } = useDegreeTemplates()
  const createDegree = useCreateDegree()

  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [template, setTemplate] = useState('')
  const [search, setSearch] = useState('')

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await createDegree.mutateAsync({ name, template: template || null })
    setName('')
    setTemplate('')
    setShowForm(false)
  }

  // אם יש בדיוק תואר אחד - נכנסים ישר אליו, בלי להציג קודם רשימה עם פריט
  // יחיד. אפשר להגיע בכל זאת לרשימה (כדי להוסיף תואר שני) דרך קישור עם
  // ?all=1 - ראו הקישור "כל התארים" במסך התואר.
  if (degrees && degrees.length === 1 && !showAll) {
    return <Navigate to={`/degrees/${degrees[0].id}`} replace />
  }

  const query = search.trim().toLowerCase()
  const filteredDegrees = degrees?.filter(
    (d) => !query || d.name.toLowerCase().includes(query) || d.institution?.toLowerCase().includes(query),
  )

  return (
    <div>
      <div className="degrees-header">
        <h1>התארים שלי</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{showForm ? 'ביטול' : '+ תואר חדש'}</Button>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 'var(--space-four)' }}>
          <form className="new-degree-form" onSubmit={handleCreate}>
            <Input placeholder="שם התואר" value={name} onChange={(e) => setName(e.target.value)} required />
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">בלי תבנית (קטלוג ריק)</option>
              {templates?.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.name} · {t.course_count} קורסים
                </option>
              ))}
            </select>
            <Button type="submit" disabled={createDegree.isPending}>
              {createDegree.isPending ? 'יוצרת…' : 'יצירת תואר'}
            </Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <p>טוען…</p>
      ) : !degrees || degrees.length === 0 ? (
        <EmptyState title="עוד אין תארים" subtitle="הוסיפי תואר כדי להתחיל לעקוב אחרי הקורסים שלך" />
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
                <div>
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
