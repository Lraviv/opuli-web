// הועתק מ-mobile/src/constants/theme.ts - פלטת ה"צבע ראשי" הניתנת לבחירה במסך הפרופיל
export const AccentColorPresets = [
  { label: 'כחול', value: '#3C87F7' },
  { label: 'אינדיגו', value: '#6366F1' },
  { label: 'סגול', value: '#8B5CF6' },
  { label: 'ורוד', value: '#EC4899' },
  { label: 'אדום', value: '#F43F5E' },
  { label: 'כתום', value: '#F97316' },
  { label: 'ענבר', value: '#F5A524' },
  { label: 'ירוק', value: '#22C55E' },
  { label: 'טורקיז', value: '#14B8A6' },
  { label: 'תכלת', value: '#0EA5E9' },
] as const

// אייקונים לבחירה - אימוג'י (נשמרים כמחרוזת בשרת, מוצגים זהה בכל מכשיר בלי ספריית אייקונים)
export const DEFAULT_DEGREE_ICON = '🎓'
export const DegreeIcons = ['🎓', '💻', '🧮', '📐', '🧪', '🔬', '🧬', '🩺', '🧠', '⚖️', '📊', '🏛️', '🌍', '🎨', '🎵', '📚'] as const
export const AvatarIcons = ['🦊', '🐱', '🐶', '🐼', '🦉', '🐸', '🦄', '🐙', '🐝', '🌸', '🌻', '⭐', '🚀', '🎧', '☕', '🧠'] as const
