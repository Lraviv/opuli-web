// בדיקות לוגיקה טהורה (ציונים / לו"ז / קישורים) - בלי framework: npm test
// מריצים בכמה אזורי זמן כדי לתפוס באגים של UTC מול שעון מקומי.
import assert from 'node:assert/strict'
import { finalGrade, requiredExamGrade, eligibility, effectiveExamWeight } from '../src/lib/grades.ts'
import { normalizeUrl } from '../src/lib/links.ts'
import { sessionOccursOn, parseDateKey, dateKey, startOfWeek, buildAgenda, addDays } from '../src/lib/schedule.ts'

const rules = { examWeight: null, minExamGrade: null, minAssignmentsCount: null, minAssignmentsWeight: null, shield: false }
const parts = [{ weight: 10, value: 90 }, { weight: 10, value: 80 }]
assert.equal(effectiveExamWeight(rules, parts), 80)
// (900+800+80*70)/100 = 73
assert.equal(finalGrade(70, parts, rules).grade, 73)
assert.equal(finalGrade(50, parts, rules).failedExam, true)
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
