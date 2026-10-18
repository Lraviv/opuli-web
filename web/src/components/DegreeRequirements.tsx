import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button, Card, EmptyState, IconButton, Input } from '@/components/ui'
import { countsTowardDegree, formatGrade } from '@/lib/grades'
import { isMandatoryCategory, statsFor, suggestFromCatalog } from '@/lib/requirements'
import type { RowStats } from '@/lib/requirements'
import { Skeleton } from '@/components/Skeleton'
import { useDegreeTemplates, useReplaceDegreeRequirements, useDegreeRequirements } from '@/lib/queries'
import type { CatalogCourseRead, CourseRead, DegreeRequirementRead } from '@/lib/types'
import './DegreeRequirements.css'

/** כרטיס "דרישות התואר" במסך התואר: לכל קטגוריה - נ"ז שהושלמו/בתהליך/מתוכננים מול הדרישה. */
export function DegreeRequirements({
  degreeId,
  courses,
  catalog,
  targetCredits = null,
  degreeName,
  institution = null,
  onCategoryClick,
}: {
  degreeId: number
  courses: CourseRead[]
  catalog: CatalogCourseRead[]
  targetCredits?: number | null
  /** שם התואר והמוסד - לזיהוי התבנית שממנה נוצר, בשביל הדרישות המוצעות */
  degreeName?: string
  institution?: string | null
  /** לחיצה על שם קטגוריה - מציגה את הקורסים שלה בקטלוג */
  onCategoryClick?: (category: string) => void
}) {
  const { data: requirements, isLoading } = useDegreeRequirements(degreeId)
  const replace = useReplaceDegreeRequirements(degreeId)
  const [editing, setEditing] = useState(false)

  const list = requirements ?? []
  const categories = new Set(list.map((r) => r.category))
  const unmatched = courses
    .filter((c) => countsTowardDegree(c) && !categories.has((c.category ?? '').trim()))
    .reduce((s, c) => s + c.credits, 0)

  // תואר שנוצר מתבנית מקבל את הדרישות כבר ביצירה; לתואר ישן בלי דרישות מציעים את אלה של התבנית
  const { data: templates } = useDegreeTemplates()
  const template = templates?.find((t) => t.name === degreeName && t.institution === (institution ?? ''))
  const suggestion = suggestFromCatalog(catalog, template?.requirements)
  const catalogSums = new Map(
    suggestFromCatalog(catalog)
      .filter((s) => isMandatoryCategory(s.category))
      .map((s) => [s.category, s.min_credits!]),
  )

  const header = (
    <div className="dr-header">
      <h2>דרישות התואר</h2>
      {list.length > 0 && !editing && (
        <button type="button" className="dr-link" onClick={() => setEditing(true)}>
          עריכה
        </button>
      )}
    </div>
  )

  if (editing) {
    return (
      <RequirementsEditor
        header={header}
        initial={list.length ? list.map((r) => ({ category: r.category, min_credits: r.min_credits })) : suggestion}
        categories={suggestion.map((s) => s.category)}
        catalogSums={catalogSums}
        targetCredits={targetCredits}
        busy={replace.isPending}
        onCancel={() => setEditing(false)}
        onSave={async (rows) => {
          await replace.mutateAsync(rows)
          setEditing(false)
        }}
      />
    )
  }

  return (
    <Card className="dr-card">
      {header}
      {isLoading ? (
        <div className="dr-list" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton width="45%" height={15} style={{ marginBottom: 8 }} />
              <Skeleton height={8} radius={4} />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <>
          <EmptyState
            title="עוד לא הוגדרו דרישות"
            subtitle={
              suggestion.length
                ? template
                  ? 'נטען את הקטגוריות ואת הנ"ז הנדרשות מתבנית התואר.'
                  : 'נטען את הקטגוריות מהקטלוג. בקטגוריות החובה הדרישה תמולא אוטומטית, ובשאר תמלאו לפי הידיעון.'
                : 'מגדירים כמה נ"ז צריך בכל קטגוריה (חובה, בחירה, סמינר...) ועוקבים אחרי ההתקדמות.'
            }
          />
          <div className="dr-empty-actions">
            <Button type="button" onClick={() => setEditing(true)}>
              {suggestion.length ? 'הגדרת דרישות מהקטלוג' : 'הגדרת דרישות'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="dr-list">
            {list.map((r) => (
              <RequirementRow key={r.id} requirement={r} stats={statsFor(r.category, courses, catalog)} onCategoryClick={onCategoryClick} />
            ))}
          </ul>
          <div className="dr-legend" aria-hidden>
            <span><i className="dr-swatch dr-swatch--done" />הושלם</span>
            <span><i className="dr-swatch dr-swatch--current" />בתהליך</span>
            <span><i className="dr-swatch dr-swatch--planned" />מתוכנן</span>
          </div>
          {unmatched > 0 && <p className="dr-note">{formatGrade(unmatched)} נ"ז שהושלמו לא משויכות לאף קטגוריה (קורסים בלי קטגוריה או בקטגוריה אחרת).</p>}
        </>
      )}
    </Card>
  )
}

function RequirementRow({
  requirement,
  stats,
  onCategoryClick,
}: {
  requirement: DegreeRequirementRead
  stats: RowStats
  onCategoryClick?: (category: string) => void
}) {
  const required = requirement.min_credits
  const total = stats.done + stats.current + stats.planned
  const scale = Math.max(required ?? 0, total, 1)
  const pct = (n: number) => `${(n / scale) * 100}%`
  const complete = required != null && stats.done >= required
  const remaining = required != null ? Math.max(0, required - stats.done) : null

  return (
    <li className="dr-row">
      <div className="dr-row__top">
        {onCategoryClick ? (
          <button type="button" className="dr-row__name dr-row__name--link" onClick={() => onCategoryClick(requirement.category)} title="הצגת הקורסים בקטלוג">
            {requirement.category}
          </button>
        ) : (
          <span className="dr-row__name">{requirement.category}</span>
        )}
        <span className={`dr-row__value${complete ? ' dr-row__value--done' : ''}`}>
          {formatGrade(stats.done)}
          {required != null ? ` / ${formatGrade(required)}` : ''} נ"ז
        </span>
      </div>
      <div
        className="dr-bar"
        role="img"
        aria-label={`${requirement.category}: ${stats.done} הושלמו, ${stats.current} בתהליך, ${stats.planned} מתוכננים${required != null ? ` מתוך ${required}` : ''}`}
      >
        <span className="dr-bar__seg dr-bar__seg--done" style={{ width: pct(stats.done) }} />
        <span className="dr-bar__seg dr-bar__seg--current" style={{ width: pct(stats.current) }} />
        <span className="dr-bar__seg dr-bar__seg--planned" style={{ width: pct(stats.planned) }} />
        {required != null && total > required && <span className="dr-bar__goal" style={{ insetInlineStart: pct(required) }} />}
      </div>
      <p className="dr-row__meta">
        {complete
          ? 'הדרישה הושלמה'
          : remaining != null
            ? `נשארו ${formatGrade(remaining)} נ"ז`
            : stats.current + stats.planned > 0
              ? `${formatGrade(stats.current + stats.planned)} נ"ז בתהליך או בתכנון · אין יעד`
              : 'אין יעד נ"ז (אפשר להגדיר בעריכה)'}
        {stats.unselectedMandatory === 1 && ' · קורס חובה אחד שעוד לא בחרת'}
        {stats.unselectedMandatory > 1 && ` · ${stats.unselectedMandatory} קורסי חובה שעוד לא בחרת`}
      </p>
    </li>
  )
}

function RequirementsEditor({
  header,
  initial,
  categories,
  catalogSums,
  targetCredits,
  busy,
  onSave,
  onCancel,
}: {
  header: ReactNode
  initial: { category: string; min_credits: number | null }[]
  categories: string[]
  /** בקטגוריות חובה: סכום הנ"ז של הקורסים בקטלוג - הערך ש"איפוס לפי הקטלוג" מחזיר */
  catalogSums: Map<string, number>
  targetCredits: number | null
  busy: boolean
  onSave: (rows: { category: string; min_credits: number | null }[]) => Promise<void>
  onCancel: () => void
}) {
  const [rows, setRows] = useState(() =>
    (initial.length ? initial : [{ category: '', min_credits: null }]).map((r, i) => ({
      key: i,
      category: r.category,
      credits: r.min_credits?.toString() ?? '',
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const defined = rows.reduce((sum, r) => sum + (Number.isFinite(Number(r.credits)) ? Number(r.credits) : 0), 0)
  const nextKey = () => Math.max(-1, ...rows.map((r) => r.key)) + 1

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const cleaned = rows.filter((r) => r.category.trim())
    const names = cleaned.map((r) => r.category.trim())
    if (new Set(names).size !== names.length) return setError('כל קטגוריה יכולה להופיע פעם אחת')
    const parsed = cleaned.map((r) => ({ category: r.category.trim(), min_credits: r.credits.trim() === '' ? null : Number(r.credits) }))
    if (parsed.some((r) => r.min_credits != null && (!Number.isFinite(r.min_credits) || r.min_credits < 0 || r.min_credits > 500))) {
      return setError('נ"ז הוא מספר בין 0 ל-500')
    }
    setError(null)
    try {
      await onSave(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה')
    }
  }

  return (
    <Card className="dr-card">
      {header}
      <form className="dr-editor" onSubmit={handleSubmit}>
        <p className="dr-note dr-note--top">את הנ"ז הנדרשות בכל קטגוריה אפשר למצוא בידיעון של התוכנית. שדה נ"ז ריק = בלי יעד.</p>
        <datalist id="dr-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {rows.map((row, i) => (
          <div key={row.key} className="dr-editor__row">
            <Input
              list="dr-categories"
              placeholder="קטגוריה (כמו בקטלוג)"
              aria-label={`קטגוריה ${i + 1}`}
              value={row.category}
              onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, category: e.target.value } : r)))}
            />
            <Input
              type="number"
              min={0}
              max={500}
              step="any"
              placeholder='נ"ז'
              aria-label={`נ"ז נדרשות לקטגוריה ${i + 1}`}
              className="dr-editor__credits"
              value={row.credits}
              onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, credits: e.target.value } : r)))}
            />
            <IconButton icon="delete" tone="danger" label={`הסרת ${row.category || 'השורה'}`} onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))} />
            <ResetToCatalog
              expected={catalogSums.get(row.category.trim())}
              value={row.credits}
              onReset={(v) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, credits: String(v) } : r)))}
            />
          </div>
        ))}
        <button type="button" className="dr-link dr-add" onClick={() => setRows((prev) => [...prev, { key: nextKey(), category: '', credits: '' }])}>
          + קטגוריה
        </button>
        <p className="dr-total" aria-live="polite">
          הוגדרו {formatGrade(defined)}
          {targetCredits ? ` מתוך ${formatGrade(targetCredits)}` : ''} נ"ז
          {targetCredits && defined < targetCredits ? ` · עוד ${formatGrade(targetCredits - defined)} לחלק` : ''}
        </p>
        {error && (
          <p className="dr-error" role="alert">
            {error}
          </p>
        )}
        <div className="dr-editor__actions">
          <Button type="submit" disabled={busy}>
            שמירה
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            ביטול
          </Button>
        </div>
      </form>
    </Card>
  )
}

/** בקטגוריית חובה שהנ"ז בה שונה מסכום הקורסים בקטלוג - מציג את הערך מהקטלוג וכפתור להחזיר אליו */
function ResetToCatalog({ expected, value, onReset }: { expected: number | undefined; value: string; onReset: (v: number) => void }) {
  if (expected == null || Number(value) === expected) return null
  return (
    <p className="dr-editor__reset">
      לפי הקטלוג: {formatGrade(expected)} נ"ז ·{' '}
      <button type="button" className="dr-link" onClick={() => onReset(expected)}>
        איפוס לפי הקטלוג
      </button>
    </p>
  )
}
