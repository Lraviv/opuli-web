// קישורים קבועים של האתר (footer, עמוד הפרופיל)

export const LINKEDIN_URL = 'https://www.linkedin.com/in/lihi-raviv-35b166289'

/** "צרו קשר" מוביל לטופס המשוב בעמוד הפרופיל - הוא שולח דרך השרת ונופל ל-mailto כשצריך */
export const CONTACT_PATH = '/profile#feedback'

/** כתובת המייל ליצירת קשר - גיבוי לטופס המשוב, ולמי שלא מחובר/ת */
export const FEEDBACK_EMAIL = 'lihirweb@gmail.com'

/** דפי המידע הסטטיים (footer, פרופיל, דפי ההתחברות) */
export const INFO_LINKS = [
  { id: 'help', path: '/help', label: 'עזרה' },
  { id: 'faq', path: '/faq', label: 'שאלות נפוצות' },
  { id: 'privacy', path: '/privacy', label: 'פרטיות' },
  { id: 'terms', path: '/terms', label: 'תנאי שימוש' },
] as const
