// קישורים אישיים - ולידציה בצד הלקוח (זהה לשרת: רק http/https) והצעות מוכנות.

export interface LinkPreset {
  title: string
  /** ריק = מציעים רק את הכותרת, את הכתובת מדביקים */
  url: string
}

/** הצעות לקישורים כלליים (מסך הבית) */
export const GLOBAL_LINK_PRESETS: LinkPreset[] = [
  { title: 'שאילתא', url: 'https://sheilta.apps.openu.ac.il/' },
  { title: 'אתר הקורסים (אופל)', url: 'https://opal.openu.ac.il/' },
]

/** הצעות לקישורים של קורס - הכתובות שונות מקורס לקורס */
export const COURSE_LINK_PRESETS: LinkPreset[] = [
  { title: 'אתר הקורס', url: '' },
  { title: 'הקלטות', url: '' },
  { title: 'מאגר מבחנים', url: '' },
]

/** מוסיפה https:// כשאין פרוטוקול. מחזירה null אם הכתובת לא http/https תקינה. */
export function normalizeUrl(raw: string): string | null {
  let url = raw.trim()
  if (!url || /\s/.test(url)) return null
  if (url.startsWith('//')) url = `https:${url}`
  else if (!/^[a-z][a-z0-9+.-]*:/i.test(url) || /^[^/:]+:\d/.test(url)) url = `https://${url}`
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    return url
  } catch {
    return null
  }
}

/** "https://www.opal.openu.ac.il/x" -> "opal.openu.ac.il" */
export function displayHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
