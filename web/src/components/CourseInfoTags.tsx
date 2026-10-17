import { Pill } from '@/components/ui'
import type { CourseInfo } from '@/lib/types'
import './CourseInfoTags.css'

/** מתי הקורס נפתח, אם צריך ידע קודם ומה הנושא - לפי רשימת הקורסים של האו"פ */
export function CourseInfoTags({ info }: { info: CourseInfo | null | undefined }) {
  if (!info) return null
  return (
    <div className="course-info-tags">
      <Pill tone={info.every_year ? 'neutral' : 'warning'}>{info.schedule_label}</Pill>
      <Pill tone={info.has_prerequisites ? 'warning' : 'success'}>
        {info.has_prerequisites ? 'דורש ידע קודם' : 'ללא ידע קודם'}
      </Pill>
      {info.subjects.length > 0 && <span className="course-info-tags__subjects">נושא: {info.subjects.join(', ')}</span>}
    </div>
  )
}
