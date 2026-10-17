import { useCallback, useRef, useState } from 'react'
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react'
import { Button, Card, EmptyState, Input } from '@/components/ui'
import { CourseInfoTags } from '@/components/CourseInfoTags'
import { StatusMenu } from '@/components/StatusMenu'
import { catalogCategories, catalogSemesters, groupCatalog, isFiltered, openByDefault, selectedCourse, EMPTY_FILTER } from '@/lib/catalog'
import type { CatalogFilter, CatalogGroup, CatalogState } from '@/lib/catalog'
import { useSelectCatalogCourse, useUpdateCourse } from '@/lib/queries'
import { useDismiss } from '@/lib/useDismiss'
import type { CatalogCourseRead, CourseRead, CourseStatus } from '@/lib/types'
import './DegreeCatalog.css'

const STATUS_OPTIONS: { value: CourseStatus; label: string }[] = [
  { value: 'planned', label: 'מתוכנן' },
  { value: 'current', label: 'בתהליך' },
  { value: 'done', label: 'הושלם' },
]

const STATE_CHIPS: { value: CatalogState; label: string }[] = [
  { value: 'all', label: 'הכול' },
  { value: 'unselected', label: 'עוד לא נבחרו' },
  { value: 'selected', label: 'נבחרו' },
]

const isPhone = () => window.matchMedia('(max-width: 640px)').matches

function parseGrade(raw: string): number | null | undefined {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
}

/** קטלוג הקורסים של התואר: סינון בצ'יפים, קבוצות לפי קטגוריה, הוספה עם סטטוס, ובחירה מרוכזת */
export function DegreeCatalog({
  degreeId,
  catalog,
  courses,
  filter,
  setFilter,
}: {
  degreeId: number
  catalog: CatalogCourseRead[]
  courses: CourseRead[]
  filter: CatalogFilter
  setFilter: Dispatch<SetStateAction<CatalogFilter>>
}) {
  const groups = groupCatalog(catalog, filter)
  const categories = catalogCategories(catalog)
  const semesters = catalogSemesters(catalog)
  const hasPrereqInfo = catalog.some((c) => c.info?.has_prerequisites === false)
  const filtered = isFiltered(filter)
  const shownCount = groups.reduce((s, g) => s + g.courses.length, 0)

  // במחשב כל הקבוצות פתוחות; בטלפון רק קבוצות חובה שעוד חסרים בהן קורסים
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  const [phone] = useState(isPhone)
  const isOpen = (g: CatalogGroup) => filtered || (toggled[g.category] ?? (!phone || openByDefault(g)))

  const [bulk, setBulk] = useState(false)
  const [picked, setPicked] = useState<number[]>([])

  const patch = (p: Partial<CatalogFilter>) => setFilter((f) => ({ ...f, ...p }))

  return (
    <div className="dd-section" id="catalog">
      <div className="dd-section-header">
        <h2>קטלוג קורסים</h2>
        {filtered && (
          <span className="dd-search-count">
            {shownCount} מתוך {catalog.length}
          </span>
        )}
      </div>
      {catalog.length === 0 ? (
        <Card>
          <EmptyState title="אין קטלוג לתואר הזה" subtitle="קורסים שלא בקטלוג אפשר להוסיף ידנית במסך הקורסים" />
        </Card>
      ) : (
        <>
          <div className="dc-controls">
            <Input
              type="search"
              placeholder="חיפוש לפי שם, קטגוריה או נושא…"
              aria-label="חיפוש בקטלוג"
              value={filter.query}
              onChange={(e) => patch({ query: e.target.value })}
            />
            <div className="dc-chips" role="group" aria-label="סינון לפי קטגוריה">
              <Chip on={filter.category == null} onClick={() => patch({ category: null })}>
                כל הקטגוריות
              </Chip>
              {categories.map((c) => (
                <Chip key={c} on={filter.category === c} onClick={() => patch({ category: filter.category === c ? null : c })}>
                  {c}
                </Chip>
              ))}
            </div>
            <div className="dc-chips" role="group" aria-label="סינון לפי מצב">
              {STATE_CHIPS.map((s) => (
                <Chip key={s.value} on={filter.state === s.value} onClick={() => patch({ state: s.value })}>
                  {s.label}
                </Chip>
              ))}
              {semesters.map((s) => (
                <Chip key={s} on={filter.semester === s} onClick={() => patch({ semester: filter.semester === s ? null : s })}>
                  נפתח בסמסטר {s}
                </Chip>
              ))}
              {hasPrereqInfo && (
                <Chip on={filter.noPrerequisites} onClick={() => patch({ noPrerequisites: !filter.noPrerequisites })}>
                  בלי ידע קודם
                </Chip>
              )}
            </div>
            <div className="dc-toolbar">
              {filtered && (
                <button type="button" className="dc-link" onClick={() => setFilter(EMPTY_FILTER)}>
                  ניקוי הסינון
                </button>
              )}
              <button
                type="button"
                className="dc-link"
                aria-pressed={bulk}
                onClick={() => {
                  setBulk((v) => !v)
                  setPicked([])
                }}
              >
                {bulk ? 'ביטול הסימון' : 'סימון כמה קורסים'}
              </button>
            </div>
          </div>

          {groups.length === 0 ? (
            <Card>
              <EmptyState title="לא נמצאו קורסים תואמים" />
            </Card>
          ) : (
            <div className="dc-groups">
              {groups.map((g) => {
                const open = isOpen(g)
                return (
                  <Card key={g.category} className="dc-group">
                    <button
                      type="button"
                      className="dc-group__header"
                      aria-expanded={open}
                      onClick={() => setToggled((t) => ({ ...t, [g.category]: !open }))}
                    >
                      <span className="dc-group__name">{g.category}</span>
                      <span className="dc-group__count">
                        {g.selected} מתוך {g.total} נבחרו
                      </span>
                      <svg className="dc-group__chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {open &&
                      g.courses.map((c) => (
                        <CatalogRow
                          key={c.id}
                          degreeId={degreeId}
                          course={c}
                          mine={c.already_selected ? selectedCourse(c.id, courses) : undefined}
                          bulk={bulk}
                          picked={picked.includes(c.id)}
                          onPick={(on) => setPicked((p) => (on ? [...p, c.id] : p.filter((id) => id !== c.id)))}
                        />
                      ))}
                  </Card>
                )
              })}
            </div>
          )}

          {bulk && picked.length > 0 && (
            <BulkBar
              degreeId={degreeId}
              courses={picked.map((id) => catalog.find((c) => c.id === id)!).filter(Boolean)}
              onDone={() => {
                setPicked([])
                setBulk(false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`dc-chip${on ? ' dc-chip--on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

function CatalogRow({
  degreeId,
  course: c,
  mine,
  bulk,
  picked,
  onPick,
}: {
  degreeId: number
  course: CatalogCourseRead
  mine: CourseRead | undefined
  bulk: boolean
  picked: boolean
  onPick: (on: boolean) => void
}) {
  const updateCourse = useUpdateCourse()
  const selectable = bulk && !c.already_selected
  const body = (
    <div className="dc-row__body">
      <p className="dd-row__title">{c.name}</p>
      <p className="dd-row__meta">
        {c.credits} נ"ז{c.category ? ` · ${c.category}` : ''}
      </p>
      <CourseInfoTags info={c.info} />
    </div>
  )
  return (
    <div className={`dd-row dc-row${picked ? ' dc-row--picked' : ''}`}>
      {selectable ? (
        <label className="dc-row__pick">
          <input type="checkbox" checked={picked} onChange={(e) => onPick(e.target.checked)} aria-label={`סימון ${c.name}`} />
          {body}
        </label>
      ) : (
        body
      )}
      {mine ? (
        <div className="dc-row__status">
          <StatusMenu status={mine.status} onChange={(status) => updateCourse.mutate({ id: mine.id, payload: { status } })} />
          {mine.status === 'done' && mine.grade != null && <span className="dc-row__grade">{mine.grade}</span>}
        </div>
      ) : c.already_selected ? (
        <span className="dc-row__grade">נבחר</span>
      ) : (
        !bulk && <AddMenu degreeId={degreeId} course={c} />
      )}
    </div>
  )
}

/** "הוספה" פותח בחירה בין שלושת הסטטוסים; ב"הושלם" אפשר להוסיף ציון */
function AddMenu({ degreeId, course }: { degreeId: number; course: CatalogCourseRead }) {
  const select = useSelectCatalogCourse(degreeId)
  const [open, setOpen] = useState(false)
  const [doneForm, setDoneForm] = useState(false)
  const [grade, setGrade] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setDoneForm(false)
  }, [])
  useDismiss(ref, open, close)

  const add = (status: CourseStatus, g: number | null = null) => {
    select.mutate({ id: course.id, payload: { status, grade: g } })
    close()
  }

  function handleDone(e: FormEvent) {
    e.preventDefault()
    const g = parseGrade(grade)
    if (g === undefined) return
    add('done', g)
  }

  return (
    <div className="status-menu" ref={ref}>
      <Button variant="secondary" disabled={select.isPending} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        הוספה
      </Button>
      {open && (
        <div className="menu-popover menu-popover--end" role="menu" aria-label={`הוספת ${course.name}`}>
          {doneForm ? (
            <form className="dc-grade-form" onSubmit={handleDone}>
              <label>
                ציון (לא חובה)
                <Input type="number" min={0} max={100} inputMode="numeric" value={grade} onChange={(e) => setGrade(e.target.value)} autoFocus />
              </label>
              <Button type="submit">הוספה כהושלם</Button>
            </form>
          ) : (
            STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                className="menu-popover__item"
                onClick={() => (o.value === 'done' ? setDoneForm(true) : add(o.value))}
              >
                <span className={`status-dot status-dot--${o.value}`} aria-hidden />
                <span className="menu-popover__label">{o.label}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** סרגל תחתון במצב "סימון כמה קורסים": סטטוס אחד לכולם, וב"הושלם" ציון לכל קורס */
function BulkBar({ degreeId, courses, onDone }: { degreeId: number; courses: CatalogCourseRead[]; onDone: () => void }) {
  const select = useSelectCatalogCourse(degreeId)
  const [status, setStatus] = useState<CourseStatus>('done')
  const [grades, setGrades] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    const parsed = courses.map((c) => ({ c, grade: status === 'done' ? parseGrade(grades[c.id] ?? '') : null }))
    if (parsed.some((p) => p.grade === undefined)) return setError('ציון הוא מספר בין 0 ל-100')
    setError(null)
    setBusy(true)
    try {
      for (const p of parsed) await select.mutateAsync({ id: p.c.id, payload: { status, grade: p.grade ?? null } })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ההוספה נכשלה')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dc-bulk" role="region" aria-label="הוספת הקורסים שסומנו">
      <div className="dc-bulk__inner">
        <div className="dc-bulk__top">
          <strong>{courses.length === 1 ? 'סומן קורס אחד' : `סומנו ${courses.length} קורסים`}</strong>
          <div className="dc-chips" role="radiogroup" aria-label="סטטוס">
            {STATUS_OPTIONS.map((o) => (
              <button key={o.value} type="button" role="radio" aria-checked={status === o.value} className={`dc-chip${status === o.value ? ' dc-chip--on' : ''}`} onClick={() => setStatus(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
        {status === 'done' && (
          <div className="dc-bulk__grades">
            {courses.map((c) => (
              <label key={c.id} className="dc-bulk__grade">
                <span>{c.name}</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  inputMode="numeric"
                  placeholder="ציון"
                  aria-label={`ציון ב${c.name}`}
                  value={grades[c.id] ?? ''}
                  onChange={(e) => setGrades((g) => ({ ...g, [c.id]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        )}
        {error && (
          <p className="dr-error" role="alert">
            {error}
          </p>
        )}
        <Button onClick={handleAdd} disabled={busy}>
          {busy ? 'מוסיפים…' : 'הוספה לקורסים שלי'}
        </Button>
      </div>
    </div>
  )
}
