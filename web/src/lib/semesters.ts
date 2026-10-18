// שמות סמסטרים בשיטת האו"פ: "2027א" = סמסטר סתיו שמתחיל באוקטובר 2026, "2027ב" = אביב, "2027ג" = קיץ.

import type { SemesterLetter } from './planner'

export interface OuSemester {
  year: number
  letter: SemesterLetter
}

const LETTERS: SemesterLetter[] = ['א', 'ב', 'ג']
// שמות ישנים מלוח התכנון ("סמסטר אביב 2027") - האו"פ לא מכירה "חורף", הוא חלק מסמסטר א
const SEASON_LETTER: Record<string, SemesterLetter> = { סתיו: 'א', חורף: 'א', אביב: 'ב', קיץ: 'ג' }

export const semesterName = (s: OuSemester) => `${s.year}${s.letter}`

/** "2027א", "2027 א", "א2027", "סמסטר אביב 2027" -> {year, letter}. null אם אין שנה או סמסטר */
export function parseSemester(name: string): OuSemester | null {
  const year = name.match(/\d{4}/)?.[0]
  if (!year) return null
  const letter = name.match(new RegExp(`(?:^|\\d|\\s)([אבג])(?:$|\\d|\\s|')`))?.[1] as SemesterLetter | undefined
  const season = Object.keys(SEASON_LETTER).find((s) => name.includes(s))
  const found = letter ?? (season ? SEASON_LETTER[season] : undefined)
  return found ? { year: Number(year), letter: found } : null
}

/** הסמסטר שרץ עכשיו: אוקטובר-ינואר = א (של השנה הבאה מאוקטובר), פברואר-יוני = ב, יולי-ספטמבר = ג */
export function currentSemester(today: Date): OuSemester {
  const m = today.getMonth()
  const y = today.getFullYear()
  if (m >= 9) return { year: y + 1, letter: 'א' }
  if (m === 0) return { year: y, letter: 'א' }
  if (m <= 5) return { year: y, letter: 'ב' }
  return { year: y, letter: 'ג' }
}

export function nextSemester(s: OuSemester): OuSemester {
  const i = LETTERS.indexOf(s.letter)
  return i < 2 ? { year: s.year, letter: LETTERS[i + 1] } : { year: s.year + 1, letter: 'א' }
}

const order = (s: OuSemester) => s.year * 3 + LETTERS.indexOf(s.letter)

/** הסמסטר שכדאי להוסיף: אחרי האחרון שכבר בתכנון, או הבא אחרי הסמסטר הנוכחי */
export function semesterToAdd(existingNames: string[], today: Date): OuSemester {
  const parsed = existingNames.map(parseSemester).filter((s): s is OuSemester => s !== null)
  const last = parsed.length ? parsed.reduce((a, b) => (order(b) > order(a) ? b : a)) : currentSemester(today)
  return nextSemester(last)
}
