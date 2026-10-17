import { useEffect, useState } from 'react'
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
import type { CourseStatus } from '@/lib/types'
import './DegreeDetail.css'

// מסך התואר = התואר והקטלוג שלו. ניהול הקורסים האישיים (רשימות, הוספה ידנית,
// תכנון סמסטרים) נמצא רק במסך הקורסים - כאן מוצג רק סיכום שמקשר אליו.
const SUMMARY: { status: CourseStatus; label: string; tab: string }[] = [
  { status: 'done', label: 'הושלמו', tab: 'done' },
  { status: 'current', label: 'בתהליך', tab: 'current' },
  { status: 'planned', label: 'בתכנון', tab: 'plan' },
]

export default function DegreeDetail() {
  const { degreeId } = useParams()
  const id = Number(degreeId)
  const navigate = useNavigate()

  const { degree, isLoading: degreeLoading } = useDegree(id)
  const { data: catalog } = useCatalog(id)
  const { data: courses } = useCourses({ degree_id: id })

  const deleteDegree = useDeleteDegree()
  const updateDegree = useUpdateDegree()
  const [pickingIcon, setPickingIcon] = useState(false)

  // ?show=unselected (מ"+ מהקטלוג" במסך הקורסים) ו-?category=... פותחים את הקטלוג מסונן
  const [params] = useSearchParams()
  const [filter, setFilter] = useState<CatalogFilter>(() => ({
    ...EMPTY_FILTER,
    state: params.get('show') === 'unselected' ? 'unselected' : 'all',
    category: params.get('category'),
  }))

  // הגעה מ"+ הוספה מהקטלוג" בלוח התכנון - גוללים לקטלוג אחרי שנטען
  const { hash } = useLocation()
  const catalogLoaded = catalog !== undefined
  useEffect(() => {
    if (hash === '#catalog' && catalogLoaded) document.getElementById('catalog')?.scrollIntoView()
  }, [hash, catalogLoaded])

  function showCategory(category: string) {
    setFilter({ ...EMPTY_FILTER, category })
    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
  const earnedCredits = myCourses.filter((c) => c.status === 'done').reduce((sum, c) => sum + c.credits, 0)
  const target = degree.target_credits
  const progressPercent = target ? Math.min((earnedCredits / target) * 100, 100) : 0

  return (
    <div>
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
            <div>
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

      <div className="dd-section">
        <div className="dd-section-header">
          <h2>ההתקדמות שלי בתואר</h2>
          <Link to="/courses" className="dd-section-link">
            לניהול הקורסים ←
          </Link>
        </div>
        <Card>
          <div className="dd-credits">
            <span>נקודות זכות</span>
            <strong>
              {earnedCredits}
              {target ? ` / ${target}` : ''} נ"ז
            </strong>
          </div>
          {target && (
            <div className="dd-progress">
              <div className="dd-progress__bar" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
          <div className="dd-summary">
            {SUMMARY.map((s) => (
              <Link key={s.status} to={`/courses?tab=${s.tab}`} className="dd-summary__item">
                <strong>{myCourses.filter((c) => c.status === s.status).length}</strong>
                <span>{s.label}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <DegreeRequirements degreeId={id} courses={myCourses} catalog={catalog ?? []} targetCredits={target} onCategoryClick={catalog?.length ? showCategory : undefined} />

      {catalog && catalog.some((c) => c.info) && <SemesterPlanner degreeId={id} catalog={catalog} courses={myCourses} />}

      {catalog && <DegreeCatalog degreeId={id} catalog={catalog} courses={myCourses} filter={filter} setFilter={setFilter} />}
    </div>
  )
}
