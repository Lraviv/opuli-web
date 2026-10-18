import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, DateInput, EmptyState, Input } from '@/components/ui'
import { CourseItemRow } from '@/components/CourseItemRow'
import { eligibility, formatGrade, rulesFromCourse } from '@/lib/grades'
import { parseOptionalNumber } from '@/lib/items'
import { useAddCourseItem, useApplySharedStructure, useBatchAddAssignments, useSharedStructure } from '@/lib/queries'
import type { AssignmentKind, CourseItemRead, CourseRead, SharedStructureRead } from '@/lib/types'
import './AssignmentsPanel.css'

const KIND_OPTIONS: { value: AssignmentKind; label: string }[] = [
  { value: 'mmn', label: 'ממ"ן' },
  { value: 'mmh', label: 'ממ"ח' },
  { value: 'other', label: 'אחר' },
]

/** הכותרת הבאה המוצעת לפי הסוג: ממ"ן 11, 12... / ממ"ח 01, 02... */
function nextTitle(kind: AssignmentKind, assignments: CourseItemRead[]): string {
  if (kind === 'other') return ''
  const pattern = kind === 'mmn' ? /ממ"ן\s*(\d+)/ : /ממ"ח\s*(\d+)/
  const numbers = assignments.map((a) => a.title.match(pattern)?.[1]).filter(Boolean).map(Number)
  const next = numbers.length ? Math.max(...numbers) + 1 : kind === 'mmn' ? 11 : 1
  return kind === 'mmn' ? `ממ"ן ${next}` : `ממ"ח ${String(next).padStart(2, '0')}`
}

/** תאריך ההגשה של המטלה ה-i בסדרה, לתצוגה המקדימה: "21.10" */
function seriesDate(first: string, index: number, intervalWeeks: number): string {
  const d = new Date(first)
  d.setDate(d.getDate() + index * intervalWeeks * 7)
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

/** מדור המטלות במסך הקורס: סטטוס זכאות לבחינה, הוספה (בודדת / סדרה), ורשימה. */
export function AssignmentsPanel({ course, assignments, onEditRules }: { course: CourseRead; assignments: CourseItemRead[]; onEditRules: () => void }) {
  const addItem = useAddCourseItem(course.id)
  const batchAdd = useBatchAddAssignments(course.id)

  const [mode, setMode] = useState<'single' | 'batch' | null>(null)
  const [kind, setKind] = useState<AssignmentKind>('mmn')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [weight, setWeight] = useState('')
  const [mandatory, setMandatory] = useState(false)
  const [count, setCount] = useState('4')
  const [startNumber, setStartNumber] = useState('')
  const [firstDue, setFirstDue] = useState('')
  const [intervalWeeks, setIntervalWeeks] = useState('3')
  const [error, setError] = useState<string | null>(null)

  const rules = rulesFromCourse(course)
  const elig = eligibility(assignments, rules)
  const suggested = nextTitle(kind, assignments)

  // ממוינות: קודם פתוחות לפי מועד, אחר כך שהוגשו
  const sorted = useMemo(() => {
    const due = (a: CourseItemRead) => (a.due_date ? new Date(a.due_date).getTime() : Infinity)
    return [...assignments].sort((a, b) => Number(a.is_done) - Number(b.is_done) || due(a) - due(b) || a.id - b.id)
  }, [assignments])

  function resetForm() {
    setTitle('')
    setDue('')
    setWeight('')
    setMandatory(false)
    setStartNumber('')
    setFirstDue('')
    setError(null)
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    const finalTitle = title.trim() || suggested
    if (!finalTitle) return setError('חסרה כותרת למטלה')
    const weightValue = parseOptionalNumber(weight)
    if (weightValue === undefined) return setError('משקל הוא מספר בין 0 ל-100')
    await addItem.mutateAsync({
      type: 'assignment',
      title: finalTitle,
      kind,
      is_mandatory: mandatory,
      weight_percent: weightValue,
      due_date: due ? new Date(due).toISOString() : null,
    })
    resetForm()
  }

  async function handleBatch(e: FormEvent) {
    e.preventDefault()
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > 20) return setError('אפשר ליצור בין 1 ל-20 מטלות')
    const weightValue = parseOptionalNumber(weight)
    if (weightValue === undefined) return setError('משקל הוא מספר בין 0 ל-100')
    const start = startNumber.trim() ? Number(startNumber) : null
    if (start !== null && (!Number.isInteger(start) || start < 0 || start > 99)) return setError('מספר התחלה בין 0 ל-99')
    const interval = Number(intervalWeeks)
    if (firstDue && (!Number.isInteger(interval) || interval < 1 || interval > 12)) return setError('המרווח הוא בין 1 ל-12 שבועות')
    await batchAdd.mutateAsync({
      kind,
      count: n,
      start_number: start,
      weight_percent: weightValue,
      is_mandatory: mandatory,
      first_due_date: firstDue ? new Date(firstDue).toISOString() : null,
      interval_weeks: firstDue ? interval : null,
    })
    resetForm()
    setMode(null)
  }

  const requiredWeight = rules.minAssignmentsWeight
  const barMax = requiredWeight || elig.totalWeight
  const barPercent = barMax > 0 ? Math.min(100, (elig.submittedWeight / barMax) * 100) : 0

  return (
    <div className="cd-section">
      <div className="cd-section-header">
        <h2>מטלות</h2>
        {assignments.length > 0 && (
          <span className="ap-count">
            {elig.submittedCount}/{elig.totalCount} הוגשו
          </span>
        )}
      </div>

      {assignments.length > 0 && (
        <Card className="ap-status">
          <EligibilityLine elig={elig} rules={rules} onEditRules={onEditRules} />
          {barMax > 0 && (
            <div className="ap-bar-wrap">
              <div
                className="ap-bar"
                role="progressbar"
                aria-label="משקל המטלות שהוגשו"
                aria-valuemin={0}
                aria-valuemax={barMax}
                aria-valuenow={elig.submittedWeight}
              >
                <div className={`ap-bar__fill${elig.status === 'eligible' ? ' ap-bar__fill--ok' : ''}`} style={{ width: `${barPercent}%` }} />
              </div>
              <span className="ap-bar__label">
                {formatGrade(elig.submittedWeight)}
                {requiredWeight ? ` / ${formatGrade(requiredWeight)} נק' נדרשות` : ` / ${formatGrade(elig.totalWeight)}% הוגשו`}
              </span>
            </div>
          )}
        </Card>
      )}

      {sorted.length === 0 && mode === null && <SharedStructureOffer courseId={course.id} />}

      <Card>
        {sorted.length === 0 ? (
          <EmptyState title="אין עדיין מטלות" subtitle='הוסיפו ממ"נים וממ"חים אחד-אחד, או סדרה שלמה בבת אחת' />
        ) : (
          sorted.map((item) => <CourseItemRow key={item.id} item={item} />)
        )}

        {mode === null ? (
          <div className="ap-add-buttons">
            <Button type="button" variant="secondary" onClick={() => { resetForm(); setMode('single') }}>
              + מטלה
            </Button>
            <Button type="button" variant="secondary" onClick={() => { resetForm(); setMode('batch') }}>
              + סדרת מטלות
            </Button>
          </div>
        ) : (
          <form className="ap-form" onSubmit={mode === 'single' ? handleAdd : handleBatch}>
            <div className="ap-kind" role="radiogroup" aria-label="סוג המטלה">
              {KIND_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === o.value}
                  className={`ap-kind__option${kind === o.value ? ' ap-kind__option--active' : ''}`}
                  onClick={() => setKind(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            {mode === 'single' ? (
              <div className="ap-form__row">
                <Input
                  className="ap-form__title"
                  placeholder={suggested || 'כותרת'}
                  aria-label="כותרת"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  autoFocus
                />
                <DateInput label="תאריך הגשה" placeholder="תאריך הגשה" value={due} onChange={setDue} />
              </div>
            ) : (
              <div className="ap-form__row">
                <label className="cd-field">
                  כמה מטלות
                  <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} autoFocus />
                </label>
                <label className="cd-field">
                  מספר ראשון
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    placeholder={kind === 'mmn' ? '11' : '1'}
                    value={startNumber}
                    onChange={(e) => setStartNumber(e.target.value)}
                  />
                </label>
                <DateInput label="הגשה ראשונה (לא חובה)" placeholder="הגשה ראשונה" value={firstDue} onChange={setFirstDue} />
                {firstDue && (
                  <label className="cd-field">
                    כל כמה שבועות
                    <Input type="number" min={1} max={12} value={intervalWeeks} onChange={(e) => setIntervalWeeks(e.target.value)} />
                  </label>
                )}
              </div>
            )}

            <div className="ap-form__row ap-form__row--compact">
              <label className="cd-field">
                {mode === 'batch' ? 'משקל כל מטלה (%)' : 'משקל (%)'}
                <Input type="number" min={0} max={100} step="any" inputMode="decimal" placeholder="לא חובה" value={weight} onChange={(e) => setWeight(e.target.value)} />
              </label>
              <label className="cd-check">
                <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
                {mode === 'batch' ? 'כולן מטלות חובה' : 'מטלת חובה'}
              </label>
            </div>

            {mode === 'batch' && Number(count) > 0 && (
              <p className="ap-preview">
                ייווצרו:{' '}
                {Array.from({ length: Math.min(Number(count) || 0, 20) }, (_, i) => {
                  const start = startNumber.trim() ? Number(startNumber) : kind === 'mmn' ? 11 : 1
                  const n = start + i
                  const name = kind === 'mmn' ? `ממ"ן ${n}` : kind === 'mmh' ? `ממ"ח ${String(n).padStart(2, '0')}` : `מטלה ${n}`
                  return firstDue ? `${name} (${seriesDate(firstDue, i, Number(intervalWeeks) || 3)})` : name
                }).join(', ')}
              </p>
            )}

            {error && (
              <p className="cd-form-error" role="alert">
                {error}
              </p>
            )}
            <div className="ap-form__actions">
              <Button type="submit" disabled={addItem.isPending || batchAdd.isPending}>
                {mode === 'single' ? 'הוספה' : `יצירת ${Number(count) || ''} מטלות`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setMode(null)}>
                ביטול
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  )
}

function EligibilityLine({
  elig,
  rules,
  onEditRules,
}: {
  elig: ReturnType<typeof eligibility>
  rules: ReturnType<typeof rulesFromCourse>
  onEditRules: () => void
}) {
  if (elig.status === 'none') {
    return (
      <p className="ap-line">
        <span className="ap-line__text">כמה מטלות צריך להגיש כדי לגשת לבחינה?</span>
        <button type="button" className="ap-link" onClick={onEditRules}>
          הגדרת תנאי זכאות
        </button>
      </p>
    )
  }
  if (elig.status === 'eligible') {
    return (
      <p className="ap-line ap-line--ok">
        <span className="ap-dot" aria-hidden />
        <span className="ap-line__text">עומדת בתנאי ההגשה - זכאית לבחינה</span>
      </p>
    )
  }
  const missing: string[] = []
  if (elig.missingCount > 0) missing.push(elig.missingCount === 1 ? 'מטלה אחת' : `${elig.missingCount} מטלות`)
  if (elig.missingWeight > 0) missing.push(`${formatGrade(elig.missingWeight)} נק'`)
  return (
    <div className="ap-line ap-line--warn">
      <span className="ap-dot" aria-hidden />
      <div className="ap-line__text">
        {missing.length > 0 && <p>חסרות עוד {missing.join(' ו-')} לזכאות לבחינה</p>}
        {elig.mandatoryMissing.length > 0 && (
          <p>
            {elig.mandatoryMissing.length === 1 ? 'מטלת חובה שעוד לא הוגשה: ' : 'מטלות חובה שעוד לא הוגשו: '}
            {elig.mandatoryMissing.map((a) => a.title).join(', ')}
          </p>
        )}
        {(rules.minAssignmentsCount || rules.minAssignmentsWeight) && (
          <button type="button" className="ap-link" onClick={onEditRules}>
            עריכת התנאים
          </button>
        )}
      </div>
    </div>
  )
}

/** "4 ממ"נים · 30% מהציון · חובה להגיש 3" */
function describeStructure(s: SharedStructureRead): string {
  const count = (kind: string, one: string, many: string) => {
    const n = s.assignments.filter((a) => a.kind === kind).length
    return n === 0 ? null : n === 1 ? one : `${n} ${many}`
  }
  const parts = [count('mmn', 'ממ"ן אחד', 'ממ"נים'), count('mmh', 'ממ"ח אחד', 'ממ"חים'), count('other', 'מטלה אחת', 'מטלות')].filter(Boolean)
  const weight = s.assignments.reduce((sum, a) => sum + (a.weight_percent ?? 0), 0)
  if (weight > 0) parts.push(`${formatGrade(weight)}% מהציון`)
  if (s.rules.min_assignments_count) parts.push(`חובה להגיש ${s.rules.min_assignments_count}`)
  else if (s.assignments.some((a) => a.is_mandatory)) parts.push(`${s.assignments.filter((a) => a.is_mandatory).length} מטלות חובה`)
  return parts.join(' · ')
}

/** בקורס בלי מטלות: הצעה להשתמש במבנה שסטודנטים אחרים כבר הזינו לאותו קורס */
function SharedStructureOffer({ courseId }: { courseId: number }) {
  const { data: structure } = useSharedStructure(courseId, true)
  const apply = useApplySharedStructure(courseId)
  if (!structure) return null
  const others = structure.students - 1
  return (
    <Card className="ap-shared">
      <p className="ap-shared__title">יש מבנה מוכן לקורס הזה</p>
      <p className="ap-shared__summary">{describeStructure(structure)}</p>
      <p className="ap-shared__meta">
        הוזן על ידי {structure.entered_by}
        {others > 0 ? ` ועוד ${others === 1 ? 'סטודנט אחד' : `${others} סטודנטים`} שמשתמשים בו` : ''}. נשאר רק להוסיף תאריכי הגשה.
      </p>
      {apply.isError && (
        <p className="ap-shared__error" role="alert">
          {apply.error instanceof Error ? apply.error.message : 'לא הצלחנו להעתיק את המבנה'}
        </p>
      )}
      <div className="ap-form__actions">
        <Button type="button" disabled={apply.isPending} onClick={() => apply.mutate()}>
          שימוש במבנה הזה
        </Button>
      </div>
    </Card>
  )
}
