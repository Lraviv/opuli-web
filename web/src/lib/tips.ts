// עזרים ללשונית העצות במסך הקורס

/** "לפני 3 ימים" עד שבוע, ואחר כך תאריך מלא. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime()
  const hour = 3600_000
  const day = 24 * hour
  if (diff < hour) return 'עכשיו'
  if (diff < day) {
    const hours = Math.round(diff / hour)
    return hours === 1 ? 'לפני שעה' : `לפני ${hours} שעות`
  }
  const days = Math.round(diff / day)
  if (days === 1) return 'אתמול'
  if (days < 7) return `לפני ${days} ימים`
  return new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })
}
