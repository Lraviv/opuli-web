// בדיקות לוגיקה טהורה (ציונים / לו"ז / קישורים) - בלי framework: npm test
// מריצים בכמה אזורי זמן כדי לתפוס באגים של UTC מול שעון מקומי.
import assert from 'node:assert/strict'
import { finalGrade, requiredExamGrade, eligibility, effectiveExamWeight, isFailedCourse, countsTowardDegree } from '../src/lib/grades.ts'
import { statsFor } from '../src/lib/requirements.ts'
import { normalizeUrl } from '../src/lib/links.ts'
import { relativeTime } from '../src/lib/tips.ts'
import { collectUpcoming, groupByHorizon, horizonOf, relativeDays, weekSummary } from '../src/lib/upcoming.ts'
import { sessionOccursOn, parseDateKey, dateKey, startOfWeek, buildAgenda, addDays } from '../src/lib/schedule.ts'

const rules = { examWeight: null, minExamGrade: null, passGrade: null, minAssignmentsCount: null, minAssignmentsWeight: null, shield: false }
const parts = [{ weight: 10, value: 90 }, { weight: 10, value: 80 }]
assert.equal(effectiveExamWeight(rules, parts), 80)
// (900+800+80*70)/100 = 73
assert.equal(finalGrade(70, parts, rules).grade, 73)
assert.equal(finalGrade(50, parts, rules).failedExam, true)
// ציון עובר בקורס: 73 עובר ב-60, לא עובר כשהציון העובר הוא 75
assert.equal(finalGrade(70, parts, rules).failedCourse, false)
assert.equal(finalGrade(70, parts, { ...rules, passGrade: 75 }).failedCourse, true)
// קורס שהושלם מתחת לציון העובר לא נספר בנ"ז
const doneCourse = { status: 'done', grade: 58, pass_grade: null }
assert.equal(isFailedCourse(doneCourse), true)
assert.equal(countsTowardDegree(doneCourse), false)
assert.equal(countsTowardDegree({ ...doneCourse, pass_grade: 55 }), true)
assert.equal(countsTowardDegree({ ...doneCourse, grade: null }), true)
assert.equal(isFailedCourse({ status: 'current', grade: 40, pass_grade: null }), false)
{
  const mk = (credits: number, grade: number | null) => ({ category: 'חובה', status: 'done', credits, grade, pass_grade: null }) as any
  assert.equal(statsFor('חובה', [mk(6, 90), mk(4, 50)], []).done, 6)
}
// target 85: (85*100 - 1700)/80 = 85
assert.deepEqual(requiredExamGrade(85, parts, rules), { kind: 'ok', grade: 85, atMinimum: false })
// target 60: (6000-1700)/80 = 53.75 -> floor 60
assert.deepEqual(requiredExamGrade(60, parts, rules), { kind: 'ok', grade: 60, atMinimum: true })
// impossible: parts at 0
const low = [{ weight: 30, value: 0 }]
const r = requiredExamGrade(90, low, rules)
assert.equal(r.kind, 'impossible'); assert.equal((r as any).best, 70)
// shield: exam 70, weighted (low assignments) lower -> exam alone
const shield = { ...rules, shield: true }
const lowParts = [{ weight: 20, value: 40 }]
assert.equal(finalGrade(70, lowParts, shield).grade, 70)
assert.equal(finalGrade(70, lowParts, shield).shieldUsed, false)
assert.equal(finalGrade(70, [{ weight: 20, value: 100 }], shield).grade, 76)
// shield required: target 75 with low parts -> min(75, (7500-800)/80=83.75) = 75
assert.deepEqual(requiredExamGrade(75, lowParts, shield), { kind: 'ok', grade: 75, atMinimum: false })
// explicit exam weight 70 with assignments 20 (weights normalized by 90)
assert.equal(Math.round(finalGrade(80, [{ weight: 20, value: 100 }], { ...rules, examWeight: 70 }).grade! * 100) / 100, 84.44)
// no exam
assert.deepEqual(requiredExamGrade(80, [{ weight: 100, value: 80 }], rules), { kind: 'no-exam' })
// float: target where needed is exactly integer after fp error
assert.equal((requiredExamGrade(70, [{ weight: 30, value: 70 }], rules) as any).grade, 70)

const items = [
  { id: 1, title: 'a', is_done: true, weight_percent: 5, is_mandatory: true },
  { id: 2, title: 'b', is_done: false, weight_percent: 5, is_mandatory: true },
  { id: 3, title: 'c', is_done: true, weight_percent: 3, is_mandatory: false },
]
let e = eligibility(items, { ...rules, minAssignmentsWeight: 10 })
assert.equal(e.status, 'missing'); assert.equal(e.missingWeight, 2); assert.equal(e.mandatoryMissing.length, 1)
e = eligibility(items.map(i => ({ ...i, is_done: true })), { ...rules, minAssignmentsCount: 3 })
assert.equal(e.status, 'eligible')
assert.equal(eligibility(items.map(i => ({ ...i, is_mandatory: false })), rules).status, 'none')

assert.equal(normalizeUrl('opal.openu.ac.il'), 'https://opal.openu.ac.il')
assert.equal(normalizeUrl('javascript:alert(1)'), null)
assert.equal(normalizeUrl('JAVASCRIPT:alert(1)'), null)
assert.equal(normalizeUrl('data:text/html,x'), null)
assert.equal(normalizeUrl('localhost:5173/a'), 'https://localhost:5173/a')
assert.equal(normalizeUrl('https://a b'), null)

// 2026-10-04 is Sunday
assert.equal(startOfWeek(parseDateKey('2026-10-07')).getDay(), 0)
assert.equal(dateKey(startOfWeek(parseDateKey('2026-10-07'))), '2026-10-04')
const biweekly = { weekday: 1, interval_weeks: 2, start_date: '2026-10-20', end_date: '2026-11-30' }
assert.equal(sessionOccursOn(biweekly, parseDateKey('2026-10-19')), false) // before start
assert.equal(sessionOccursOn(biweekly, parseDateKey('2026-10-26')), true)  // week 0 (start week Sun 18.10)
assert.equal(sessionOccursOn(biweekly, parseDateKey('2026-11-02')), false)
assert.equal(sessionOccursOn({ ...biweekly, start_date: '2026-10-26' }, parseDateKey('2026-10-26')), true)
assert.equal(sessionOccursOn(biweekly, parseDateKey('2026-11-09')), true)  // across DST change (25.10)
assert.equal(sessionOccursOn(biweekly, parseDateKey('2026-12-07')), false) // after end
const weekly = { weekday: 3, interval_weeks: 1, start_date: null, end_date: null }
assert.equal(sessionOccursOn(weekly, parseDateKey('2026-10-07')), true)

const days = Array.from({ length: 7 }, (_, i) => addDays(parseDateKey('2026-10-04'), i))
const agenda = buildAgenda(days, {
  sessions: [{ id: 1, course_id: 1, weekday: 3, start_time: '18:00', end_time: '20:00', title: null, location: null, interval_weeks: 1, start_date: null, end_date: null }],
  exams: [{ id: 1, course_id: 1, date_time: new Date(2026, 9, 7, 9, 0).toISOString(), location: null }],
  assignments: [{ id: 1, course_id: 1, title: 'ממ"ן 11', due_date: new Date(2026, 9, 7).toISOString(), is_done: false }],
  reminders: [],
  courseName: () => 'קורס',
})
assert.deepEqual(agenda.get('2026-10-07')!.map(i => i.kind), ['exam', 'session', 'assignment'])
console.log('all logic tests passed')

// זמן יחסי בתגובות העצות
{
  const now = Date.parse('2026-10-10T12:00:00Z')
  assert.equal(relativeTime('2026-10-10T11:30:00Z', now), 'עכשיו')
  assert.equal(relativeTime('2026-10-10T11:00:00Z', now), 'לפני שעה')
  assert.equal(relativeTime('2026-10-10T07:00:00Z', now), 'לפני 5 שעות')
  assert.equal(relativeTime('2026-10-09T12:00:00Z', now), 'אתמול')
  assert.equal(relativeTime('2026-10-07T12:00:00Z', now), 'לפני 3 ימים')
  assert.match(relativeTime('2026-09-01T12:00:00Z', now), /2026/)
}

// "מה מחכה לי" - קבוצות זמן ומיון (שעון מקומי)
{
  const now = new Date(2026, 9, 17, 10, 0) // שבת 17.10.2026 10:00
  assert.equal(horizonOf(new Date(2026, 9, 16, 23, 0), now), 'overdue')
  assert.equal(horizonOf(new Date(2026, 9, 17, 23, 30), now), 'today')
  assert.equal(horizonOf(new Date(2026, 9, 24, 23, 59), now), 'week')
  assert.equal(horizonOf(new Date(2026, 9, 25, 0, 0), now), 'later')
  assert.equal(horizonOf(null, now), 'undated')
  assert.equal(relativeDays(new Date(2026, 9, 18, 1, 0), now), 'מחר')
  assert.equal(relativeDays(new Date(2026, 9, 21), now), 'עוד 4 ימים')

  const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString()
  const entries = collectUpcoming({
    assignments: [
      { id: 1, course_id: 1, title: 'ממ"ן 12', due_date: iso(2026, 9, 21), is_done: false, weight_percent: 5 },
      { id: 2, course_id: 1, title: 'ממ"ן 11', due_date: iso(2026, 9, 1), is_done: true },
      { id: 3, course_id: 2, title: 'ממ"ח 02', due_date: iso(2026, 9, 15), is_done: false },
    ],
    exams: [
      { id: 1, course_id: 1, date_time: iso(2027, 1, 14, 9), location: 'רעננה' },
      { id: 2, course_id: 1, date_time: iso(2026, 9, 17, 8), location: null }, // היום, כבר התחיל - נשאר
      { id: 3, course_id: 1, date_time: iso(2026, 9, 10, 9), location: null }, // עבר
    ],
    reminders: [
      { id: 1, title: 'בלי תאריך', due_date: null, is_done: false },
      { id: 2, title: 'סגורה', due_date: iso(2026, 9, 18), is_done: true },
    ],
    sessions: [{ id: 1, course_id: 1, weekday: 0, interval_weeks: 1, start_date: null, end_date: null, start_time: '18:00', title: null, location: 'זום' }],
  }, now)
  assert.deepEqual(entries.map((e) => e.key), ['assignment-3', 'exam-2', 'session-1-2026-10-18', 'assignment-1', 'exam-1', 'reminder-1'])
  assert.deepEqual(groupByHorizon(entries).map((g) => [g.horizon, g.entries.length]), [['overdue', 1], ['today', 1], ['week', 2], ['later', 1], ['undated', 1]])
  // מפגשים, "בהמשך" ו"בלי תאריך" לא נספרים
  assert.equal(weekSummary(entries), 'השבוע מחכים לך 2 מטלות ומבחן אחד (1 באיחור)')
  assert.equal(weekSummary([...entries, { ...entries[0], key: 'r', kind: 'reminder' }, { ...entries[0], key: 'r2', kind: 'reminder' }]), 'השבוע מחכים לך 2 מטלות, מבחן אחד ו-2 תזכורות (3 באיחור)')
  assert.equal(weekSummary([]), 'השבוע פנוי, אין מטלות או מבחנים קרובים')
}
console.log('upcoming tests passed')
