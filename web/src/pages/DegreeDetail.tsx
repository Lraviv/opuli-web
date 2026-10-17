import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, EmptyState, IconPicker, Input, Pill } from '@/components/ui'
import { DegreeRequirements } from '@/components/DegreeRequirements'
import { CourseInfoTags } from '@/components/CourseInfoTags'
import { PageSkeleton } from '@/components/Skeleton'
import { DEFAULT_DEGREE_ICON, DegreeIcons } from '@/lib/constants'
import { useCatalog, useCourses, useDegree, useDeleteDegree, useSelectCatalogCourse, useUpdateDegree } from '@/lib/queries'
import type { CourseStatus } from '@/lib/types'
import './DegreeDetail.css'

// מסך התואר = התואר והקטלוג שלו. ניהול הקורסים האישיים (רשימות, הוספה ידנית,
// תכנון סמסטרים) נמצא רק במסך הקורסים - כאן מוצג רק סיכום שמקשר אליו.
const STATUS_LABEL: Record<CourseStatus, string> = { done: 'הושלם', current: 'בתהליך', planned: 'מתוכנן' }
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

  const selectCatalogCourse = useSelectCatalogCourse(id)
  const deleteDegree = useDeleteDegree()
  const updateDegree = useUpdateDegree()
  const [pickingIcon, setPickingIcon] = useState(false)

  const [search, setSearch] = useState('')
  const [addStatus, setAddStatus] = useState<CourseStatus>('planned')

  // הגעה מ"+ הוספה מהקטלוג" בלוח התכנון - גוללים לקטלוג אחרי שנטען
  const { hash } = useLocation()
  const catalogLoaded = catalog !== undefined
  useEffect(() => {
    if (hash === '#catalog' && catalogLoaded) document.getElementById('catalog')?.scrollIntoView()
  }, [hash, catalogLoaded])

  async function handleDeleteDegree() {
    if (!confirm(`למחוק את התואר "${degree?.name}"? הקורסים האישיים יישמרו.`)) return
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

  const query = search.trim().toLowerCase()
  const filteredCatalog = catalog?.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query) ||
      c.category?.toLowerCase().includes(query) ||
      c.info?.subjects.some((s) => s.toLowerCase().includes(query)),
  )

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
        <Button variant="danger" onClick={handleDeleteDegree}>
          מחיקת תואר
        </Button>
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

      <DegreeRequirements degreeId={id} courses={myCourses} catalog={catalog ?? []} />

      <div className="dd-section" id="catalog">
        <div className="dd-section-header">
          <h2>קטלוג קורסים</h2>
          {query && catalog && (
            <span className="dd-search-count">
              {filteredCatalog!.length} מתוך {catalog.length}
            </span>
          )}
        </div>
        {!catalog || catalog.length === 0 ? (
          <Card>
            <EmptyState
              title="אין קטלוג לתואר הזה"
              subtitle="קורסים שלא בקטלוג אפשר להוסיף ידנית במסך הקורסים"
            />
          </Card>
        ) : (
          <>
            <div className="dd-catalog-controls">
              <Input
                type="search"
                placeholder="חיפוש בקטלוג לפי שם, קטגוריה או נושא…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="dd-add-as">
                הוספה בתור
                <select value={addStatus} onChange={(e) => setAddStatus(e.target.value as CourseStatus)}>
                  {(['planned', 'current', 'done'] as CourseStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Card>
              {filteredCatalog!.length === 0 && <EmptyState title="לא נמצאו קורסים תואמים" />}
              {filteredCatalog!.map((c) => (
                <div className="dd-row" key={c.id}>
                  <div>
                    <p className="dd-row__title">{c.name}</p>
                    <p className="dd-row__meta">
                      {c.credits} נ"ז{c.category ? ` · ${c.category}` : ''}
                    </p>
                    <CourseInfoTags info={c.info} />
                  </div>
                  {c.already_selected ? (
                    <Pill tone="success">נבחר</Pill>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={selectCatalogCourse.isPending}
                      onClick={() => selectCatalogCourse.mutate({ id: c.id, payload: { status: addStatus } })}
                    >
                      הוספה
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
