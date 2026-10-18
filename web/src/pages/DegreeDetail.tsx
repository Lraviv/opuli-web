import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, EmptyState, IconPicker } from '@/components/ui'
import { DegreeRequirements } from '@/components/DegreeRequirements'
import { DegreeCatalog } from '@/components/DegreeCatalog'
import { MoreMenu } from '@/components/StatusMenu'
import { SemesterPlanner } from '@/components/SemesterPlanner'
import { PageSkeleton } from '@/components/Skeleton'
import { DEFAULT_DEGREE_ICON, DegreeIcons } from '@/lib/constants'
import { EMPTY_FILTER } from '@/lib/catalog'
import type { CatalogFilter } from '@/lib/catalog'
import { useCatalog, useCourses, useDegree, useDeleteDegree, useUpdateDegree } from '@/lib/queries'
import { countsTowardDegree, formatGrade } from '@/lib/grades'
import { useMediaQuery } from '@/lib/useMediaQuery'
import type { CourseRead, CourseStatus } from '@/lib/types'
import './DegreeDetail.css'

// מסך התואר = התואר והקטלוג שלו. ניהול הקורסים האישיים (רשימות, הוספה ידנית,
// תכנון סמסטרים) נמצא רק במסך הקורסים - כאן מוצג רק סיכום שמקשר אליו.
const SUMMARY: { status: CourseStatus; label: string; tab: string }[] = [
  { status: 'done', label: 'הושלמו', tab: 'done' },
  { status: 'current', label: 'בתהליך', tab: 'current' },
  { status: 'planned', label: 'בתכנון', tab: '' },
]

// במחשב הדרישות בטור צדדי קבוע, ובטלפון הן לשונית
type Tab = 'requirements' | 'plan' | 'catalog'
const TAB_LABELS: Record<Tab, string> = { requirements: 'דרישות', plan: 'תכנון', catalog: 'קטלוג' }

export default function DegreeDetail() {
  const { degreeId } = useParams()
  const id = Number(degreeId)
  const navigate = useNavigate()
  const wide = useMediaQuery('(min-width: 900px)')

  const { degree, isLoading: degreeLoading } = useDegree(id)
  const { data: catalog } = useCatalog(id)
  const { data: courses } = useCourses({ degree_id: id })

  const deleteDegree = useDeleteDegree()
  const updateDegree = useUpdateDegree()
  const [pickingIcon, setPickingIcon] = useState(false)

  // ?show=unselected (מ"+ מהקטלוג" במסך הקורסים) ו-?category=... פותחים את הקטלוג מסונן
  const [params] = useSearchParams()
  const { hash } = useLocation()
  const [filter, setFilter] = useState<CatalogFilter>(() => ({
    ...EMPTY_FILTER,
    state: params.get('show') === 'unselected' ? 'unselected' : 'all',
    category: params.get('category'),
  }))
  const [chosenTab, setChosenTab] = useState<Tab | null>(() =>
    hash === '#catalog' || params.has('show') || params.has('category') ? 'catalog' : params.get('tab') === 'plan' ? 'plan' : null,
  )
  const tabsRef = useRef<HTMLDivElement>(null)

  // הגעה מ"+ הוספה מהקטלוג" בלוח התכנון - גוללים לקטלוג אחרי שנטען
  const catalogLoaded = catalog !== undefined
  useEffect(() => {
    if (hash === '#catalog' && catalogLoaded) tabsRef.current?.scrollIntoView()
  }, [hash, catalogLoaded])

  // תכנון הסמסטרים נמצא רק כאן (גם בתואר בלי תבנית - שם פשוט אין הצעות לפי סמסטר)
  const tabs: Tab[] = [...(wide ? [] : (['requirements'] as Tab[])), 'plan', 'catalog']
  const defaultTab: Tab = wide ? 'plan' : 'requirements'
  const tab = chosenTab && tabs.includes(chosenTab) ? chosenTab : defaultTab

  function showCategory(category: string) {
    setFilter({ ...EMPTY_FILTER, category })
    setChosenTab('catalog')
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function handleDeleteDegree() {
    const count = courses?.length ?? 0
    const kept = count === 0 ? '' : count === 1 ? ' הקורס שלך בתואר יישאר ברשימת הקורסים.' : ` ${count} הקורסים שלך בתואר יישארו ברשימת הקורסים.`
    if (!confirm(`למחוק את התואר "${degree?.name}"? הקטלוג והדרישות יימחקו ואי אפשר לבטל.${kept}`)) return
    await deleteDegree.mutateAsync(id)
    navigate('/degrees')
  }

  if (degreeLoading) return <PageSkeleton variant="detail" />
  if (!degree) {
    return (
      <Card>
        <EmptyState title="התואר לא נמצא" />
        <Link to="/degrees?all=1" className="dd-all-degrees-link">
          ← כל התארים
        </Link>
      </Card>
    )
  }

  const myCourses = courses ?? []
  const requirements = (
    <DegreeRequirements degreeId={id} courses={myCourses} catalog={catalog ?? []} targetCredits={degree.target_credits} degreeName={degree.name} institution={degree.institution} onCategoryClick={catalog?.length ? showCategory : undefined} />
  )

  return (
    <div className="dd">
      <div className="dd-header">
        <div className="dd-header__main">
          <Link to="/degrees?all=1" className="dd-all-degrees-link">
            ← כל התארים
          </Link>
          <div className="dd-title-row">
            <button
              type="button"
              className="dd-icon"
              aria-label="שינוי אייקון התואר"
              aria-expanded={pickingIcon}
              title="שינוי אייקון"
              onClick={() => setPickingIcon((v) => !v)}
            >
              <span aria-hidden>{degree.icon || DEFAULT_DEGREE_ICON}</span>
            </button>
            <div className="dd-title">
              <h1>{degree.name}</h1>
              {degree.institution && <p>{degree.institution}</p>}
            </div>
          </div>
        </div>
        <MoreMenu label="פעולות נוספות לתואר" items={[{ label: 'מחיקת תואר', danger: true, onSelect: handleDeleteDegree }]} />
      </div>

      {pickingIcon && (
        <Card style={{ marginBottom: 'var(--space-four)' }}>
          <IconPicker
            icons={DegreeIcons}
            value={degree.icon || DEFAULT_DEGREE_ICON}
            label="אייקון התואר"
            onChange={(icon) => {
              updateDegree.mutate({ id, payload: { icon } })
              setPickingIcon(false)
            }}
          />
        </Card>
      )}

      <div className="dd-layout">
        <aside className="dd-side" aria-label="ההתקדמות שלי בתואר">
          <ProgressCard courses={myCourses} target={degree.target_credits} onPlanClick={() => setChosenTab('plan')} />
          {wide && requirements}
        </aside>

        <div className="dd-main">
          <div className="dd-tabs" role="tablist" aria-label="אזורי התואר" ref={tabsRef} id="catalog">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                id={`dd-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="dd-panel"
                className={`dd-tab${tab === t ? ' dd-tab--active' : ''}`}
                onClick={() => setChosenTab(t)}
              >
                {wide && t === 'plan' ? 'תכנון סמסטרים' : TAB_LABELS[t]}
                {t === 'catalog' && catalog && catalog.length > 0 && <span className="dd-tab__count">{catalog.length}</span>}
              </button>
            ))}
          </div>
          <div id="dd-panel" role="tabpanel" aria-labelledby={`dd-tab-${tab}`}>
            {tab === 'requirements' && requirements}
            {tab === 'plan' && catalog && <SemesterPlanner degreeId={id} catalog={catalog} courses={myCourses} />}
            {tab === 'catalog' && catalog && <DegreeCatalog degreeId={id} catalog={catalog} courses={myCourses} filter={filter} setFilter={setFilter} />}
          </div>
        </div>
      </div>
    </div>
  )
}

/** נ"ז מול היעד (הושלם / בתהליך / בתכנון), מספר הקורסים בכל מצב וממוצע משוקלל */
function ProgressCard({ courses, target, onPlanClick }: { courses: CourseRead[]; target: number | null; onPlanClick: () => void }) {
  const done = courses.filter(countsTowardDegree)
  const credits = (status: CourseStatus) => courses.filter((c) => c.status === status).reduce((sum, c) => sum + c.credits, 0)
  const earned = done.reduce((sum, c) => sum + c.credits, 0)
  const graded = done.filter((c) => c.grade != null)
  const gradedCredits = graded.reduce((sum, c) => sum + c.credits, 0)
  const average = gradedCredits > 0 ? graded.reduce((sum, c) => sum + c.grade! * c.credits, 0) / gradedCredits : null
  const scale = Math.max(target ?? 0, 1)
  const pct = (n: number) => `${Math.min((n / scale) * 100, 100)}%`

  return (
    <Card className="dd-progress-card">
      <div className="dd-credits">
        <span>
          <strong>{formatGrade(earned)}</strong>
          {target ? ` מתוך ${formatGrade(target)}` : ''} נ"ז
        </span>
        {target ? <span className="dd-credits__pct">{Math.min(Math.round((earned / target) * 100), 100)}%</span> : null}
      </div>
      {target ? (
        <div
          className="dr-bar"
          role="img"
          aria-label={`${formatGrade(earned)} נ"ז הושלמו, ${formatGrade(credits('current'))} בתהליך, ${formatGrade(credits('planned'))} בתכנון, מתוך ${formatGrade(target)}`}
        >
          <span className="dr-bar__seg dr-bar__seg--done" style={{ width: pct(earned) }} />
          <span className="dr-bar__seg dr-bar__seg--current" style={{ width: pct(credits('current')) }} />
          <span className="dr-bar__seg dr-bar__seg--planned" style={{ width: pct(credits('planned')) }} />
        </div>
      ) : null}
      <div className="dd-summary">
        {SUMMARY.map((s) => {
          // "הושלמו" סופר רק קורסים שעברו, כמו בבית; קורס שלא עבר לא נספר
          const count = s.status === 'done' ? done.length : courses.filter((c) => c.status === s.status).length
          const content = (
            <>
              <strong>{count}</strong>
              <span>{s.label}</span>
            </>
          )
          // הקורסים המתוכננים מנוהלים בלשונית התכנון של המסך הזה
          return s.status === 'planned' ? (
            <button key={s.status} type="button" className="dd-summary__item dd-summary__item--button" onClick={onPlanClick}>
              {content}
            </button>
          ) : (
            <Link key={s.status} to={`/courses?tab=${s.tab}`} className="dd-summary__item">
              {content}
            </Link>
          )
        })}
        <div className="dd-summary__item">
          <strong>{average != null ? average.toFixed(1) : '—'}</strong>
          <span>ממוצע</span>
        </div>
      </div>
    </Card>
  )
}
