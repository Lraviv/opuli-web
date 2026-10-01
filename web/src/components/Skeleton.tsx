import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import './Skeleton.css'

/** בלוק "שלד" עם shimmer - מחזיק מקום לתוכן שעוד נטען. */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number
  style?: CSSProperties
}) {
  return <span className="sk" aria-hidden style={{ width, height, borderRadius: radius, ...style }} />
}

/** שורת רשימה טיפוסית: כותרת + שורת משנה, ואופציונלית "גלולה" בצד */
function SkeletonRow({ pill = true, check = false }: { pill?: boolean; check?: boolean }) {
  return (
    <div className="sk-row">
      {check && <Skeleton width={20} height={20} radius={5} />}
      <div className="sk-row__text">
        <Skeleton width="55%" height={15} />
        <Skeleton width="32%" height={12} />
      </div>
      {pill && <Skeleton width={64} height={22} radius={999} />}
    </div>
  )
}

/** כרטיס שלד עם כמה שורות - במקום "טוען…" בתוך כרטיס */
export function SkeletonList({ rows = 3, pill = true, check = false }: { rows?: number; pill?: boolean; check?: boolean }) {
  return (
    <div className="sk-list" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} pill={pill} check={check} />
      ))}
    </div>
  )
}

/**
 * מעטפת לטעינה של מסך שלם: aria-busy + הודעה לקוראי מסך, ואם הטעינה נמשכת
 * יותר מ-slowAfterMs - הסבר שהשרת מתעורר (השרת החינמי ב-Render "נרדם" אחרי
 * 15 דקות בלי תנועה, והבקשה הראשונה יכולה לקחת עד דקה).
 */
export function PageSkeleton({ variant = 'list', slowAfterMs = 4000 }: { variant?: 'home' | 'list' | 'detail'; slowAfterMs?: number }) {
  const slow = useSlowFlag(slowAfterMs)
  return (
    <div className="sk-page" aria-busy="true">
      <p className="sk-sr" role="status">
        טוען…
      </p>
      {slow && (
        <p className="sk-slow" role="status">
          השרת מתעורר, זה יכול לקחת עד דקה בפעם הראשונה
        </p>
      )}
      {variant === 'home' && <HomeShape />}
      {variant === 'list' && <ListShape />}
      {variant === 'detail' && <DetailShape />}
    </div>
  )
}

function useSlowFlag(ms: number) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return slow
}

function HomeShape() {
  return (
    <>
      <Skeleton width={220} height={30} style={{ marginBottom: 10 }} />
      <Skeleton width={160} height={14} style={{ marginBottom: 32 }} />
      <div className="sk-grid3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk-card sk-card--center">
            <Skeleton width={44} height={28} />
            <Skeleton width={90} height={12} />
          </div>
        ))}
      </div>
      <div className="sk-card" style={{ marginBottom: 32 }}>
        <Skeleton width="40%" height={16} />
        <Skeleton height={10} radius={5} />
      </div>
      <Skeleton width={110} height={14} style={{ marginBottom: 8 }} />
      <div className="sk-card">
        <SkeletonList rows={3} />
      </div>
    </>
  )
}

function ListShape() {
  return (
    <>
      <Skeleton width={180} height={28} style={{ marginBottom: 24 }} />
      <div className="sk-card">
        <SkeletonList rows={5} />
      </div>
    </>
  )
}

function DetailShape() {
  return (
    <>
      <Skeleton width={90} height={14} style={{ marginBottom: 12 }} />
      <Skeleton width="60%" height={28} style={{ marginBottom: 8 }} />
      <Skeleton width={80} height={14} style={{ marginBottom: 16 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={70} height={32} radius={12} />
        ))}
      </div>
      <Skeleton width={100} height={14} style={{ marginBottom: 8 }} />
      <div className="sk-card" style={{ marginBottom: 32 }}>
        <SkeletonList rows={3} check />
      </div>
      <Skeleton width={100} height={14} style={{ marginBottom: 8 }} />
      <div className="sk-card">
        <SkeletonList rows={2} check />
      </div>
    </>
  )
}
