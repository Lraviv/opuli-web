// בדיקות לוגיקה טהורה (ציונים / לו"ז / קישורים) - בלי framework: npm test
// מריצים בכמה אזורי זמן כדי לתפוס באגים של UTC מול שעון מקומי.
import assert from 'node:assert/strict'
import { finalGrade, requiredExamGrade, eligibility, effectiveExamWeight, isFailedCourse, countsTowardDegree } from '../src/lib/grades.ts'
import { statsFor, suggestFromCatalog } from '../src/lib/requirements.ts'
import { normalizeUrl } from '../src/lib/links.ts'
import { EMPTY_FILTER, catalogSemesters, groupCatalog, isFiltered, matchesFilter, openByDefault } from '../src/lib/catalog.ts'
import { relativeTime } from '../src/lib/tips.ts'
import { currentSemester, parseSemester, semesterName, semesterToAdd } from '../src/lib/semesters.ts'
import { collectUpcoming, groupByHorizon, horizonOf, relativeDays, weekSummary } from '../src/lib/upcoming.ts'
import { sessionOccursOn, parseDateKey, dateKey, startOfWeek, buildAgenda, addDays, defaultWeekStart } from '../src/lib/schedule.ts'

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
  assert.equal(weekSummary(entries), 'בשבוע הקרוב מחכים לך 2 מטלות ומבחן אחד (1 באיחור)')
  assert.equal(weekSummary([...entries, { ...entries[0], key: 'r', kind: 'reminder' }, { ...entries[0], key: 'r2', kind: 'reminder' }]), 'בשבוע הקרוב מחכים לך 2 מטלות, מבחן אחד ו-2 תזכורות (3 באיחור)')
  const firstAssignment = entries.find((e) => e.kind === 'assignment' && e.horizon === 'week')!
  assert.equal(weekSummary([firstAssignment]), 'בשבוע הקרוב מחכה לך מטלה אחת')
  assert.equal(weekSummary([firstAssignment, { ...firstAssignment, key: 'a2' }]), 'בשבוע הקרוב מחכות לך 2 מטלות')
  assert.equal(weekSummary([{ ...firstAssignment, kind: 'exam' }, { ...firstAssignment, key: 'e2', kind: 'exam' }]), 'בשבוע הקרוב מחכים לך 2 מבחנים')
  assert.equal(weekSummary([]), 'השבוע הקרוב פנוי, אין מטלות או מבחנים קרובים')
}
console.log('upcoming tests passed')

// הלו"ז פותח בשישי ובשבת על השבוע הבא (17.10.2026 = שבת)
assert.equal(dateKey(defaultWeekStart(new Date(2026, 9, 17, 10))), '2026-10-18')
assert.equal(dateKey(defaultWeekStart(new Date(2026, 9, 16, 10))), '2026-10-18')
assert.equal(dateKey(defaultWeekStart(new Date(2026, 9, 15, 10))), '2026-10-11')
// ---- עוזר בחירת קורסים לסמסטר ----
{
  const { planSemester, normalizeName } = await import('../src/lib/planner.ts')
  const info = (semesters: string[], required: string[] = [], has: boolean | null = required.length > 0 ? true : null) => ({
    semesters, every_year: semesters.length > 0, schedule_label: '', has_prerequisites: has, subjects: [], required_knowledge: required, recommended_knowledge: [],
  })
  let nextId = 1
  const cat = (name: string, code: string, i: any, selected = false) =>
    ({ id: nextId++, degree_id: 1, name, credits: 4, category: 'חובה', recommended_semester: null, notes: `מספר קורס: ${code}`, already_selected: selected, course_code: code, info: i }) as any
  const mine = (name: string, status: string, code: string | null = null) => ({ name, status, course_code: code }) as any

  assert.equal(normalizeName('הקורס חשבון אינפיניטסימלי 1 (20474).'), 'חשבון אינפיניטסימלי 1')

  const catalog = [
    cat('מבני נתונים ומבוא לאלגוריתמים', '20407', info(['א', 'ב'])),
    cat('אלגוריתמים', '20417', info(['א', 'ב'], ['מתמטיקה בדידה: תורת הקבוצות, קומבינטוריקה ותורת הגרפים', 'מבני נתונים ומבוא לאלגוריתמים או מבני נתונים (20433)'])),
    cat('חשבון אינפיניטסימלי 2', '20475', info(['א', 'ב', 'ג'], ['חשבון אינפיניטסימלי 1 (20474)'])),
    cat('לוגיקה למדעי המחשב', '20466', info(['ג'], ['שני קורסים במתמטיקה'])),
    cat('גרפיקה ממוחשבת', '20562', info(['ב'], ['חשבון אינפיניטסימלי 1 (20474) + חשבון אינפיניטסימלי 2 (20475)'])),
    cat('רשתות תקשורת מחשבים', '20948', { ...info([]), schedule_label: 'א2027 בלבד' }),
    cat('קורס שכבר נבחר', '20999', info(['א']), true),
  ]
  const courses = [mine('מתמטיקה בדידה: תורת הקבוצות, קומבינטוריקה ותורת הגרפים', 'done'), mine('מבני נתונים ומבוא לאלגוריתמים', 'current', '20407'), mine('חשבון אינפיניטסימלי 1', 'planned', '20474')]

  const a = planSemester('א', catalog, courses)
  // מבני נתונים כבר נבחר כקורס אישי? לא - already_selected=false, ולכן מוצע; אלגוריתמים מוכן כי מבני נתונים "בתהליך"
  assert.deepEqual(a.ready.map((e) => e.course.name), ['מבני נתונים ומבוא לאלגוריתמים', 'אלגוריתמים'])
  // אינפי 1 רק "מתוכנן" - לא נחשב ידע קודם
  assert.deepEqual(a.missing.map((e) => [e.course.name, e.missing]), [['חשבון אינפיניטסימלי 2', ['חשבון אינפיניטסימלי 1 (20474)']]])
  assert.deepEqual(a.unknown.map((e) => e.course.name), ['רשתות תקשורת מחשבים'])
  assert.equal(a.notOffered, 2) // לוגיקה (ג) וגרפיקה (ב)

  const c = planSemester('ג', catalog, courses)
  const logic = c.ready.find((e) => e.course.name === 'לוגיקה למדעי המחשב')!
  assert.deepEqual(logic.toCheck, ['שני קורסים במתמטיקה'])

  // צמד קורסים: צריך את שניהם
  const done2 = [mine('חשבון אינפיניטסימלי 1', 'done', '20474')]
  assert.equal(planSemester('ב', catalog, done2).missing.some((e) => e.course.name === 'גרפיקה ממוחשבת'), true)
  const doneBoth = [...done2, mine('חשבון אינפיניטסימלי 2', 'done', '20475')]
  assert.equal(planSemester('ב', catalog, doneBoth).ready.some((e) => e.course.name === 'גרפיקה ממוחשבת'), true)
  // "אלגוריתמים" לא מספק את "מבני נתונים ומבוא לאלגוריתמים"
  const onlyAlgo = [mine('אלגוריתמים', 'done'), mine('מתמטיקה בדידה: תורת הקבוצות, קומבינטוריקה ותורת הגרפים', 'done')]
  assert.deepEqual(planSemester('א', catalog, onlyAlgo).missing.find((e) => e.course.name === 'אלגוריתמים')!.missing, ['מבני נתונים ומבוא לאלגוריתמים או מבני נתונים (20433)'])
  // דרישה שהיא חלק משם של קורס שנלקח
  const lang = [cat('שפות תכנות', '20905', info(['ב'], ['מבוא לאלגוריתמים']))]
  const langPlan = planSemester('ב', lang, [mine('מבני נתונים ומבוא לאלגוריתמים', 'done')])
  assert.equal(langPlan.ready.length, 1)
  assert.deepEqual(langPlan.ready[0].toCheck, [])
  console.log('planner tests passed')
}

{
  // קטלוג התואר: סינון וקיבוץ
  const info = (semesters: string[], has_prerequisites: boolean | null) => ({ semesters, every_year: true, schedule_label: '', has_prerequisites, subjects: ['גרפים'], required_knowledge: [], recommended_knowledge: [] })
  const row = (id: number, name: string, category: string | null, selected: boolean, i: ReturnType<typeof info> | null = null) => ({
    id, degree_id: 1, name, credits: 6, category, recommended_semester: null, notes: null, already_selected: selected, course_code: id === 1 ? '20417' : null, info: i,
  })
  const catalog = [
    row(1, 'אלגוריתמים', 'חובה - מדעי המחשב', false, info(['א', 'ב'], true)),
    row(2, 'מבני נתונים', 'חובה - מדעי המחשב', true, info(['ב'], false)),
    row(3, 'גרפיקה', 'בחירה', false, info(['ג'], false)),
    row(4, 'קורס חופשי', null, false),
  ]
  assert.equal(isFiltered(EMPTY_FILTER), false)
  assert.deepEqual(groupCatalog(catalog, EMPTY_FILTER).map((g) => [g.category, g.courses.length, g.selected, g.total]), [
    ['חובה - מדעי המחשב', 2, 1, 2],
    ['בחירה', 1, 0, 1],
    ['בלי קטגוריה', 1, 0, 1],
  ])
  assert.deepEqual(groupCatalog(catalog, { ...EMPTY_FILTER, state: 'unselected' }).map((g) => g.courses.map((c) => c.id)), [[1], [3], [4]])
  assert.deepEqual(catalog.filter((c) => matchesFilter(c, { ...EMPTY_FILTER, semester: 'ב' })).map((c) => c.id), [1, 2])
  assert.deepEqual(catalog.filter((c) => matchesFilter(c, { ...EMPTY_FILTER, noPrerequisites: true })).map((c) => c.id), [2, 3])
  assert.deepEqual(catalog.filter((c) => matchesFilter(c, { ...EMPTY_FILTER, category: 'בלי קטגוריה' })).map((c) => c.id), [4])
  assert.deepEqual(catalog.filter((c) => matchesFilter(c, { ...EMPTY_FILTER, query: 'גרפ' })).map((c) => c.id), [1, 2, 3])
  // חיפוש לפי מספר קורס
  assert.deepEqual(catalog.filter((c) => matchesFilter(c, { ...EMPTY_FILTER, query: '20417' })).map((c) => c.id), [1])
  assert.deepEqual(catalogSemesters(catalog), ['א', 'ב', 'ג'])
  const groups = groupCatalog(catalog, EMPTY_FILTER)
  assert.equal(openByDefault(groups[0]), true)
  assert.equal(openByDefault(groups[1]), false)
  console.log('catalog tests passed')
}

{
  // דרישות מוצעות: חובה = סכום הקטלוג, השאר מהתבנית
  const row = (name: string, credits: number, category: string) =>
    ({ id: 0, degree_id: 1, name, credits, category, recommended_semester: null, notes: null, already_selected: false, course_code: null, info: null })
  const catalog = [row('א', 4, 'חובה - מתמטיקה'), row('ב', 6, 'חובה - מתמטיקה'), row('ג', 4, 'בחירה'), row('ד', 3, 'סמינר')]
  assert.deepEqual(suggestFromCatalog(catalog), [
    { category: 'חובה - מתמטיקה', min_credits: 10 },
    { category: 'בחירה', min_credits: null },
    { category: 'סמינר', min_credits: null },
  ])
  const fromTemplate = suggestFromCatalog(catalog, [{ category: 'בחירה', min_credits: 20 }, { category: 'חובה - מתמטיקה', min_credits: 99 }])
  assert.deepEqual(fromTemplate.map((r) => r.min_credits), [10, 20, null])
  // קטגוריה מהתבנית בלי קורסים בקטלוג (בחירה חופשית) נשארת בסוף
  const withFree = suggestFromCatalog(catalog, [{ category: 'בחירה חופשית', min_credits: 9 }])
  assert.deepEqual(withFree.at(-1), { category: 'בחירה חופשית', min_credits: 9 })
  console.log('requirements suggestion tests passed')
}

{
  // שמות סמסטרים בשיטת האו"פ
  assert.deepEqual(parseSemester('2027א'), { year: 2027, letter: 'א' })
  assert.deepEqual(parseSemester('2027 ב'), { year: 2027, letter: 'ב' })
  assert.deepEqual(parseSemester('סמסטר אביב 2027'), { year: 2027, letter: 'ב' })
  assert.deepEqual(parseSemester('סמסטר חורף 2026'), { year: 2026, letter: 'א' })
  assert.equal(parseSemester('השנה הבאה'), null)
  assert.deepEqual(currentSemester(new Date(2026, 9, 18)), { year: 2027, letter: 'א' })
  assert.deepEqual(currentSemester(new Date(2027, 2, 1)), { year: 2027, letter: 'ב' })
  assert.deepEqual(currentSemester(new Date(2027, 7, 1)), { year: 2027, letter: 'ג' })
  assert.equal(semesterName(semesterToAdd([], new Date(2026, 9, 18))), '2027ב')
  assert.equal(semesterName(semesterToAdd(['2027ב', '2027ג'], new Date(2026, 9, 18))), '2028א')
  console.log('semester tests passed')
}
