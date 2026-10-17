import { Pill } from '@/components/ui'
import type { CourseInfo } from '@/lib/types'
import './CourseInfoTags.css'

/** מתי הקורס נפתח, איזה ידע קודם הוא דורש ומה הנושא - לפי רשימת הקורסים ודפי הקורסים של האו"פ */
export function CourseInfoTags({ info }: { info: CourseInfo | null | undefined }) {
  if (!info) return null
  return (
    <div className="course-info">
      <div className="course-info-tags">
        {info.schedule_label && <Pill tone={info.every_year ? 'neutral' : 'warning'}>{info.schedule_label}</Pill>}
        {info.has_prerequisites !== null && (
          <Pill tone={info.has_prerequisites ? 'warning' : 'success'}>
            {info.has_prerequisites ? 'דורש ידע קודם' : 'ללא ידע קודם'}
          </Pill>
        )}
        {info.subjects.length > 0 && <span className="course-info__text">נושא: {info.subjects.join(', ')}</span>}
      </div>
      {info.required_knowledge.length > 0 && (
        <p className="course-info__text">
          <strong>ידע קודם דרוש:</strong> {info.required_knowledge.join(' · ')}
        </p>
      )}
      {info.recommended_knowledge.length > 0 && (
        <p className="course-info__text">
          <strong>מומלץ:</strong> {info.recommended_knowledge.join(' · ')}
        </p>
      )}
    </div>
  )
}
