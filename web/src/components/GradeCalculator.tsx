import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Card, Input } from '@/components/ui'
import {
  averageGradedAssignments,
  effectiveExamWeight,
  finalGrade,
  formatGrade,
  minExamGrade,
  passGrade,
  requiredExamGrade,
  rulesFromCourse,
  totalAssignmentWeight,
} from '@/lib/grades'
import type { GradePart } from '@/lib/grades'
import { parseOptionalNumber } from '@/lib/items'
import { useUpdateCourse } from '@/lib/queries'
import type { CourseItemRead, CourseRead } from '@/lib/types'
import './GradeCalculator.css'

type Mode = 'target' | 'predict'

/**
 * מחשבון ציון סופי: "כמה אני צריכה בבחינה" / "מה יהיה הציון".
 * מטלות שנבדקו נספרות בציון שלהן; לשאר אפשר להזין ציון משוער או לסמן "לא אגיש"
 * (נספר כ-0). הציונים המשוערים הם תרחיש בלבד - לא נשמרים.
 */
export function GradeCalculator({
  course,
  assignments,
  rulesOpen,
  onRulesOpenChange,
}: {
  course: CourseRead
  assignments: CourseItemRead[]
  rulesOpen: boolean
  onRulesOpenChange: (open: boolean) => void
}) {
  const rules = rulesFromCourse(course)
  const weighted = assignments.filter((a) => (a.weight_percent ?? 0) > 0)
  const avg = averageGradedAssignments(weighted)

  const [mode, setMode] = useState<Mode>('target')
  // מתחילים ריק: מספר שלא הוזן נראה כמו נתון של הסטודנט
  const [target, setTarget] = useState('')
  const [exam, setExam] = useState('')
  const [defaultExpected, setDefaultExpected] = useState(String(avg ?? 80))
  const [expected, setExpected] = useState<Record<number, string>>({})
  const [skipped, setSkipped] = useState<Record<number, boolean>>({})

  const fallback = Number(defaultExpected)
  const parts: GradePart[] = weighted.map((a) => {
    if (a.grade != null) return { weight: a.weight_percent!, value: a.grade }
    if (skipped[a.id]) return { weight: a.weight_percent!, value: 0 }
    const own = expected[a.id]
    const value = own != null && own.trim() !== '' ? Number(own) : fallback
    return { weight: a.weight_percent!, value: Number.isFinite(value) ? value : 0 }
  })

  const examWeight = effectiveExamWeight(rules, parts)
  const assignmentsWeight = totalAssignmentWeight(parts)
  const ungraded = weighted.filter((a) => a.grade == null)
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (rulesOpen) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [rulesOpen])

  return (
    <div className="cd-section" ref={sectionRef} id="grade-calculator">
      <div className="cd-section-header">
        <h2>מחשבון ציון סופי</h2>
        <button type="button" className="ap-link" onClick={() => onRulesOpenChange(!rulesOpen)} aria-expanded={rulesOpen}>
          {rulesOpen ? 'סגירת כללי הציון' : 'כללי הציון בקורס'}
        </button>
      </div>

      {rulesOpen && <RulesEditor course={course} assignmentsWeight={totalAssignmentWeight(weighted.map((a) => ({ weight: a.weight_percent! })))} onDone={() => onRulesOpenChange(false)} />}

      <Card className="gc">
        <div className="gc__modes" role="tablist" aria-label="סוג החישוב">
          <button type="button" role="tab" aria-selected={mode === 'target'} className={`gc__mode${mode === 'target' ? ' gc__mode--active' : ''}`} onClick={() => setMode('target')}>
            כמה צריך בבחינה?
          </button>
          <button type="button" role="tab" aria-selected={mode === 'predict'} className={`gc__mode${mode === 'predict' ? ' gc__mode--active' : ''}`} onClick={() => setMode('predict')}>
            מה יהיה הציון?
          </button>
        </div>

        <div className="gc__main">
          <label className="gc__input">
            {mode === 'target' ? 'הציון הסופי שאני רוצה' : 'ציון בבחינה'}
            <Input
              type="number"
              min={0}
              max={100}
              inputMode="numeric"
              placeholder={mode === 'target' ? 'למשל 85' : 'למשל 80'}
              value={mode === 'target' ? target : exam}
              onChange={(e) => (mode === 'target' ? setTarget : setExam)(e.target.value)}
            />
          </label>
          <ResultView mode={mode} target={target} exam={exam} parts={parts} rules={rules} />
        </div>

        <p className="gc__weights">
          {examWeight > 0 ? `בחינה ${formatGrade(examWeight)}%` : 'בלי בחינה'}
          {assignmentsWeight > 0 && ` · מטלות ${formatGrade(assignmentsWeight)}%`}
          {rules.shield && ' · מגן'}
          {examWeight > 0 && ` · סף מעבר בבחינה ${formatGrade(minExamGrade(rules))}`}
          {` · ציון עובר ${formatGrade(passGrade(rules))}`}
        </p>

        {weighted.length === 0 ? (
          <p className="gc__note">
            למטלות בקורס לא הוגדר משקל, אז החישוב לפי הבחינה בלבד. אפשר להוסיף משקל לכל מטלה (עריכה ברשימת המטלות).
          </p>
        ) : (
          <details className="gc__parts" open={ungraded.length > 0}>
            <summary>
              המטלות בחישוב
              {ungraded.length > 0 && <span className="gc__parts-hint"> · {ungraded.length} עוד לא נבדקו</span>}
            </summary>
            {ungraded.length > 0 && (
              <label className="gc__default">
                ציון משוער למטלות שלא נבדקו
                <Input type="number" min={0} max={100} value={defaultExpected} onChange={(e) => setDefaultExpected(e.target.value)} />
              </label>
            )}
            <ul className="gc__list">
              {weighted.map((a) => (
                <li key={a.id} className="gc__item">
                  <span className="gc__item-title">{a.title}</span>
                  <span className="gc__item-weight">{formatGrade(a.weight_percent!)}%</span>
                  {a.grade != null ? (
                    <span className="gc__item-grade">{formatGrade(a.grade)}</span>
                  ) : (
                    <span className="gc__item-what-if">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`ציון משוער ל${a.title}`}
                        placeholder={defaultExpected}
                        disabled={!!skipped[a.id]}
                        value={expected[a.id] ?? ''}
                        onChange={(e) => setExpected((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      />
                      <label className="gc__skip">
                        <input
                          type="checkbox"
                          checked={!!skipped[a.id]}
                          onChange={(e) => setSkipped((prev) => ({ ...prev, [a.id]: e.target.checked }))}
                        />
                        לא אגיש
                      </label>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="gc__note">מטלה שלא תוגש נספרת כ-0. הציונים המשוערים כאן לא נשמרים.</p>
          </details>
        )}
      </Card>
    </div>
  )
}

function ResultView({ mode, target, exam, parts, rules }: { mode: Mode; target: string; exam: string; parts: GradePart[]; rules: ReturnType<typeof rulesFromCourse> }) {
  const raw = mode === 'target' ? target : exam
  const value = Number(raw)
  if (raw.trim() === '' || !Number.isFinite(value) || value < 0 || value > 100) {
    return (
      <div className="gc__result gc__result--muted" aria-live="polite">
        <p className="gc__caption">{raw.trim() === '' ? (mode === 'target' ? 'הזינו את הציון הסופי שאתם רוצים' : 'הזינו ציון בבחינה') : 'הזינו מספר בין 0 ל-100'}</p>
      </div>
    )
  }

  if (mode === 'predict') {
    const r = finalGrade(value, parts, rules)
    if (r.grade == null) {
      return (
        <div className="gc__result gc__result--muted" aria-live="polite">
          <p className="gc__caption">אין משקלים לחישוב</p>
        </div>
      )
    }
    return (
      <div className={`gc__result${r.failedExam || r.failedCourse ? ' gc__result--bad' : ''}`} aria-live="polite">
        <p className="gc__caption">הציון הסופי</p>
        <p className="gc__number">{formatGrade(Math.round(r.grade * 10) / 10)}</p>
        {r.failedExam ? (
          <p className="gc__sub">מתחת ל-{formatGrade(minExamGrade(rules))} בבחינה הקורס לא עובר</p>
        ) : r.failedCourse ? (
          <p className="gc__sub">מתחת ל-{formatGrade(passGrade(rules))} הקורס לא עובר</p>
        ) : rules.shield ? (
          <p className="gc__sub">{r.shieldUsed ? 'המטלות שיפרו את הציון' : 'נספרת הבחינה בלבד (מגן)'}</p>
        ) : null}
      </div>
    )
  }

  const r = requiredExamGrade(value, parts, rules)
  if (r.kind === 'no-exam') {
    const final = finalGrade(0, parts, rules).grade
    return (
      <div className="gc__result" aria-live="polite">
        <p className="gc__caption">בקורס בלי בחינה הציון לפי המטלות</p>
        <p className="gc__number">{final != null ? formatGrade(Math.round(final * 10) / 10) : '—'}</p>
      </div>
    )
  }
  if (r.kind === 'impossible') {
    return (
      <div className="gc__result gc__result--bad" aria-live="polite">
        <p className="gc__caption">גם 100 בבחינה לא יספיק</p>
        <p className="gc__number">{formatGrade(Math.round(r.best * 10) / 10)}</p>
        <p className="gc__sub">זה הציון הגבוה ביותר שאפשר לקבל עם המטלות האלה</p>
      </div>
    )
  }
  return (
    <div className="gc__result" aria-live="polite">
      <p className="gc__caption">צריך בבחינה לפחות</p>
      <p className="gc__number">{r.grade}</p>
      {value < passGrade(rules) ? (
        <p className="gc__sub">שימו לב: הציון העובר בקורס הוא {formatGrade(passGrade(rules))}</p>
      ) : (
        r.atMinimum && <p className="gc__sub">מספיק לעבור את סף הבחינה</p>
      )}
    </div>
  )
}

function RulesEditor({ course, assignmentsWeight, onDone }: { course: CourseRead; assignmentsWeight: number; onDone: () => void }) {
  const updateCourse = useUpdateCourse()
  const [examWeight, setExamWeight] = useState(course.exam_weight?.toString() ?? '')
  const [minExam, setMinExam] = useState(course.min_exam_grade?.toString() ?? '')
  const [minCount, setMinCount] = useState(course.min_assignments_count?.toString() ?? '')
  const [minWeight, setMinWeight] = useState(course.min_assignments_weight?.toString() ?? '')
  const [shield, setShield] = useState(course.assignments_shield)
  const [error, setError] = useState<string | null>(null)

  const autoExamWeight = useMemo(() => Math.max(0, 100 - assignmentsWeight), [assignmentsWeight])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    const values = {
      exam_weight: parseOptionalNumber(examWeight),
      min_exam_grade: parseOptionalNumber(minExam),
      min_assignments_count: parseOptionalNumber(minCount, 50),
      min_assignments_weight: parseOptionalNumber(minWeight),
    }
    if (Object.values(values).some((v) => v === undefined)) return setError('כל הערכים הם מספרים בין 0 ל-100')
    if (values.min_assignments_count != null && !Number.isInteger(values.min_assignments_count)) return setError('מספר המטלות צריך להיות מספר שלם')
    setError(null)
    await updateCourse.mutateAsync({
      id: course.id,
      payload: {
        exam_weight: values.exam_weight ?? null,
        min_exam_grade: values.min_exam_grade ?? null,
        min_assignments_count: values.min_assignments_count ?? null,
        min_assignments_weight: values.min_assignments_weight ?? null,
        assignments_shield: shield,
      },
    })
    onDone()
  }

  return (
    <Card className="gc-rules">
      <form onSubmit={handleSave}>
        <p className="gc-rules__intro">מילוי לפי חוברת הקורס. שדה ריק = ברירת המחדל שמופיעה בו.</p>
        <div className="gc-rules__grid">
          <label className="cd-field">
            משקל הבחינה (%)
            <Input type="number" min={0} max={100} step="any" placeholder={`אוטומטי: ${formatGrade(autoExamWeight)}`} value={examWeight} onChange={(e) => setExamWeight(e.target.value)} />
          </label>
          <label className="cd-field">
            ציון מינימום בבחינה
            <Input type="number" min={0} max={100} placeholder="60" value={minExam} onChange={(e) => setMinExam(e.target.value)} />
          </label>
          <label className="cd-field">
            מינימום מטלות להגשה
            <Input type="number" min={0} max={50} placeholder="אין" value={minCount} onChange={(e) => setMinCount(e.target.value)} />
          </label>
          <label className="cd-field">
            מינימום נק' מטלות להגשה
            <Input type="number" min={0} max={100} step="any" placeholder="אין" value={minWeight} onChange={(e) => setMinWeight(e.target.value)} />
          </label>
        </div>
        <label className="cd-check gc-rules__shield">
          <input type="checkbox" checked={shield} onChange={(e) => setShield(e.target.checked)} />
          <span>
            מטלות מגן
            <span className="gc-rules__hint">ציון המטלות נכלל רק אם הוא משפר את הציון</span>
          </span>
        </label>
        {error && (
          <p className="cd-form-error" role="alert">
            {error}
          </p>
        )}
        <div className="ap-form__actions">
          <Button type="submit" disabled={updateCourse.isPending}>
            שמירת הכללים
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            ביטול
          </Button>
        </div>
      </form>
    </Card>
  )
}
