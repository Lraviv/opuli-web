// אייקוני קו לסרגל הניווט - מקבלים את צבע הטקסט (currentColor) ולכן עובדים במצב בהיר וכהה

const PATHS: Record<string, string[]> = {
  home: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  schedule: ['M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z', 'M3 10h18', 'M8 3v4', 'M16 3v4'],
  degree: ['M2 9l10-5 10 5-10 5z', 'M6 11v5c3 2 9 2 12 0v-5'],
  courses: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 19V5'],
  reminders: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10 21a2 2 0 0 0 4 0'],
  community: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21c.8-3.6 3.5-6 7-6s6.2 2.4 7 6', 'M16 3.3a4 4 0 0 1 0 7.4', 'M18 15c2 .7 3.4 2.9 4 6'],
  profile: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c1-4 4-6 8-6s7 2 8 6'],
}

export type NavIconName = keyof typeof PATHS

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
