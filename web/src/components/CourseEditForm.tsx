import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, Input } from '@/components/ui'
import { DEFAULT_MIN_EXAM_GRADE, DEFAULT_PASS_GRADE } from '@/lib/grades'
import { parseOptionalNumber } from '@/lib/items'
import { useSemesters, useUpdateCourse } from '@/lib/queries'
import type { CourseRead } from '@/lib/types'
import './CourseEditForm.css'

/** "עריכת קורס" מתפריט ⋯ בדף הקורס: פרטי הקורס, סמסטר, וציון העובר. */
export function CourseEditForm({ course, onDone }: { course: CourseRead; onDone: () => void }) {
  const updateCourse = useUpdateCourse()
  const { data: semesters } = useSemesters(course.degree_id ?? undefined)
  const [name, setName] = useState(course.name)
  const [credits, setCredits] = useState(String(course.credits))
  const [code, setCode] = useState(course.course_code ?? '')
  const [category, setCategory] = useState(course.category ?? '')
  const [semesterId, setSemesterId] = useState(course.semester_id?.toString() ?? '')
  const [passGrade, setPassGrade] = useState(course.pass_grade?.toString() ?? '')
  const [minExam, setMinExam] = useState(course.min_exam_grade?.toString() ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const creditsValue = Number(credits)
    if (!name.trim()) return setError('צריך שם לקורס')
    if (!credits.trim() || !Number.isFinite(creditsValue) || creditsValue < 0) return setError('נ"ז צריך להיות מספר')
    const pass = parseOptionalNumber(passGrade)
    const exam = parseOptionalNumber(minExam)
    if (pass === undefined || exam === undefined) return setError('ציונים הם מספרים בין 0 ל-100')
    setError(null)
    await updateCourse.mutateAsync({
      id: course.id,
      payload: {
        name: name.trim(),
        credits: creditsValue,
        course_code: code.trim() || null,
        category: category.trim() || null,
        semester_id: semesterId ? Number(semesterId) : null,
        pass_grade: pass,
        min_exam_grade: exam,
      },
    })
    onDone()
  }

  return (
    <Card className="ce">
      <form onSubmit={handleSave}>
        <h2 className="ce__title">עריכת קורס</h2>
        <div className="ce__grid">
          <label className="cd-field ce__wide">
            שם הקורס
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="cd-field">
            נ"ז
            <Input type="number" min={0} step="any" inputMode="decimal" value={credits} onChange={(e) => setCredits(e.target.value)} />
          </label>
          <label className="cd-field">
            מספר קורס
            <Input value={code} onChange={(e) => setCode(e.target.value)} maxLength={20} placeholder="למשל 20407" />
          </label>
          <label className="cd-field">
            קטגוריה
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="למשל בחירה" />
          </label>
          {semesters && semesters.length > 0 && (
            <label className="cd-field">
              סמסטר
              <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)}>
                <option value="">בלי סמסטר</option>
                {semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="cd-field">
            ציון עובר בקורס
            <Input type="number" min={0} max={100} placeholder={String(DEFAULT_PASS_GRADE)} value={passGrade} onChange={(e) => setPassGrade(e.target.value)} />
          </label>
          <label className="cd-field">
            ציון מינימום בבחינה
            <Input type="number" min={0} max={100} placeholder={String(DEFAULT_MIN_EXAM_GRADE)} value={minExam} onChange={(e) => setMinExam(e.target.value)} />
          </label>
        </div>
        <p className="ce__hint">קורס שהושלם בציון נמוך מהציון העובר מסומן "לא עבר", והנ"ז שלו לא נספרים בתואר ובממוצע.</p>
        {error && (
          <p className="cd-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ce__actions">
          <Button type="submit" disabled={updateCourse.isPending}>
            שמירה
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            ביטול
          </Button>
        </div>
      </form>
    </Card>
  )
}
