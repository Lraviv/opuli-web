// לוגיקת ציונים וזכאות לבחינה - פונקציות טהורות, בלי React. אותה לוגיקה בדיוק
// קיימת גם באפליקציה (opu-li/src/lib/grades.ts) - שינוי כאן צריך להיעשות גם שם.

export const DEFAULT_MIN_EXAM_GRADE = 60
export const DEFAULT_PASS_GRADE = 60

export interface GradeRules {
  /** משקל הבחינה ב-%. null = 100 פחות סכום משקלי המטלות */
  examWeight: number | null
  minExamGrade: number | null
  /** הציון הסופי המינימלי לעבור את הקורס. null = 60 */
  passGrade: number | null
  minAssignmentsCount: number | null
  minAssignmentsWeight: number | null
  /** מגן: ציון המטלות נכלל רק אם הוא משפר */
  shield: boolean
}

export interface GradePart {
  weight: number
  /** הציון שנספר (ציון בפועל / משוער / 0 למטלה שלא תוגש) */
  value: number
}

export function rulesFromCourse(course: {
  exam_weight: number | null
  min_exam_grade: number | null
  pass_grade?: number | null
  min_assignments_count: number | null
  min_assignments_weight: number | null
  assignments_shield: boolean
}): GradeRules {
  return {
    examWeight: course.exam_weight,
    minExamGrade: course.min_exam_grade,
    passGrade: course.pass_grade ?? null,
    minAssignmentsCount: course.min_assignments_count,
    minAssignmentsWeight: course.min_assignments_weight,
    shield: course.assignments_shield,
  }
}

export function totalAssignmentWeight(parts: { weight: number }[]): number {
  return parts.reduce((sum, p) => sum + (p.weight > 0 ? p.weight : 0), 0)
}

export function effectiveExamWeight(rules: GradeRules, parts: { weight: number }[]): number {
  if (rules.examWeight != null) return Math.max(0, rules.examWeight)
  return Math.max(0, 100 - totalAssignmentWeight(parts))
}

export function minExamGrade(rules: GradeRules): number {
  return rules.minExamGrade ?? DEFAULT_MIN_EXAM_GRADE
}

export function passGrade(rules: GradeRules): number {
  return rules.passGrade ?? DEFAULT_PASS_GRADE
}

/** קורס שהושלם עם ציון נמוך מהציון העובר שלו - לא עבר */
export function isFailedCourse(course: { status: string; grade: number | null; pass_grade?: number | null }): boolean {
  return course.status === 'done' && course.grade != null && course.grade < (course.pass_grade ?? DEFAULT_PASS_GRADE)
}

/** קורס שנספר בנ"ז ובממוצע: הושלם, ולא נכשל */
export function countsTowardDegree(course: { status: string; grade: number | null; pass_grade?: number | null }): boolean {
  return course.status === 'done' && !isFailedCourse(course)
}

const clamp = (n: number) => Math.min(100, Math.max(0, n))

/** הממוצע המשוקלל (בלי מגן). null אם אין שום משקל. */
function weighted(examGrade: number, parts: GradePart[], examWeight: number): number | null {
  const total = totalAssignmentWeight(parts) + examWeight
  if (total <= 0) return null
  const sum = parts.reduce((s, p) => s + clamp(p.value) * Math.max(0, p.weight), 0) + clamp(examGrade) * examWeight
  return sum / total
}

export interface FinalGradeResult {
  /** הציון הסופי המחושב */
  grade: number | null
  /** ציון הבחינה נמוך מהסף - הקורס לא עובר */
  failedExam: boolean
  /** הציון הסופי נמוך מהציון העובר בקורס */
  failedCourse: boolean
  /** במגן: האם המטלות שיפרו את הציון */
  shieldUsed: boolean
}

export function finalGrade(examGrade: number, parts: GradePart[], rules: GradeRules): FinalGradeResult {
  const examWeight = effectiveExamWeight(rules, parts)
  const exam = clamp(examGrade)
  const failedExam = examWeight > 0 && exam < minExamGrade(rules)
  const w = weighted(exam, parts, examWeight)
  if (w == null) return { grade: null, failedExam, failedCourse: false, shieldUsed: false }
  const grade = rules.shield && examWeight > 0 ? Math.max(exam, w) : w
  const failedCourse = grade < passGrade(rules)
  return { grade, failedExam, failedCourse, shieldUsed: rules.shield && examWeight > 0 && w > exam }
}

export type RequiredExamResult =
  | { kind: 'ok'; grade: number; atMinimum: boolean }
  | { kind: 'impossible'; best: number }
  | { kind: 'no-exam' }

/** כמה צריך בבחינה כדי שהציון הסופי יהיה לפחות target. */
export function requiredExamGrade(target: number, parts: GradePart[], rules: GradeRules): RequiredExamResult {
  const examWeight = effectiveExamWeight(rules, parts)
  if (examWeight <= 0) return { kind: 'no-exam' }
  const totalWeight = totalAssignmentWeight(parts) + examWeight
  const fromParts = parts.reduce((s, p) => s + clamp(p.value) * Math.max(0, p.weight), 0)
  let needed = (target * totalWeight - fromParts) / examWeight
  // במגן מספיק שאחד מהשניים יגיע ליעד: הבחינה לבד, או הממוצע המשוקלל
  if (rules.shield) needed = Math.min(needed, target)
  const floor = minExamGrade(rules)
  const atMinimum = needed <= floor
  // ציונים שלמים - מעגלים למעלה (עם סובלנות לשגיאות עיגול של נקודה צפה)
  const grade = Math.max(floor, 0, Math.ceil(needed - 1e-9))
  if (grade > 100) {
    return { kind: 'impossible', best: finalGrade(100, parts, rules).grade ?? 0 }
  }
  return { kind: 'ok', grade, atMinimum }
}

// ---------------------------------------------------------------------------
// זכאות לבחינה
// ---------------------------------------------------------------------------

export interface AssignmentLike {
  id: number
  title: string
  is_done: boolean
  weight_percent: number | null
  is_mandatory: boolean
}

export interface Eligibility {
  submittedCount: number
  totalCount: number
  submittedWeight: number
  totalWeight: number
  /** כמה מטלות עוד חסרות לעמידה במינימום (0 אם אין דרישה או שהיא מולאה) */
  missingCount: number
  missingWeight: number
  mandatoryMissing: AssignmentLike[]
  /** 'none' = לא הוגדרו כללי זכאות ואין מטלות חובה */
  status: 'eligible' | 'missing' | 'none'
}

export function eligibility(assignments: AssignmentLike[], rules: GradeRules): Eligibility {
  const submitted = assignments.filter((a) => a.is_done)
  const submittedWeight = submitted.reduce((s, a) => s + (a.weight_percent ?? 0), 0)
  const totalWeight = assignments.reduce((s, a) => s + (a.weight_percent ?? 0), 0)
  const missingCount = rules.minAssignmentsCount ? Math.max(0, rules.minAssignmentsCount - submitted.length) : 0
  const missingWeight = rules.minAssignmentsWeight ? Math.max(0, rules.minAssignmentsWeight - submittedWeight) : 0
  const mandatoryMissing = assignments.filter((a) => a.is_mandatory && !a.is_done)
  const hasRules = !!rules.minAssignmentsCount || !!rules.minAssignmentsWeight || assignments.some((a) => a.is_mandatory)
  const status = !hasRules
    ? 'none'
    : missingCount === 0 && missingWeight < 1e-9 && mandatoryMissing.length === 0
      ? 'eligible'
      : 'missing'
  return {
    submittedCount: submitted.length,
    totalCount: assignments.length,
    submittedWeight,
    totalWeight,
    missingCount,
    missingWeight,
    mandatoryMissing,
    status,
  }
}

/** ממוצע הציונים של המטלות שכבר נבדקו (לא משוקלל), מעוגל. null אם אין. */
export function averageGradedAssignments(items: { grade: number | null }[]): number | null {
  const graded = items.filter((i) => i.grade != null)
  if (graded.length === 0) return null
  return Math.round(graded.reduce((s, i) => s + i.grade!, 0) / graded.length)
}

export function formatGrade(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export const ASSIGNMENT_KIND_LABEL: Record<'mmn' | 'mmh' | 'other', string> = {
  mmn: 'ממ"ן',
  mmh: 'ממ"ח',
  other: 'אחר',
}
