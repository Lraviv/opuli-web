import { useState } from 'react'
import { useUpdateCourse } from '@/lib/queries'
import type { CourseRead } from '@/lib/types'

/** שדה ציון לקורס שהושלם - נשמר ביציאה מהשדה או ב-Enter (ריק = מחיקת הציון). */
export function GradeInput({ course }: { course: CourseRead }) {
  const updateCourse = useUpdateCourse()
  const [value, setValue] = useState(course.grade?.toString() ?? '')

  function save() {
    const trimmed = value.trim()
    const grade = trimmed === '' ? null : Number(trimmed)
    if (grade !== null && (Number.isNaN(grade) || grade < 0 || grade > 100)) {
      setValue(course.grade?.toString() ?? '')
      return
    }
    if (grade === course.grade) return
    updateCourse.mutate({ id: course.id, payload: { grade } })
  }

  return (
    <input
      className="ui-input grade-input"
      type="number"
      min={0}
      max={100}
      placeholder="ציון"
      aria-label={`ציון ב${course.name}`}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}
