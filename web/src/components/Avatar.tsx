// תמונת פרופיל קטנה - משותפת ללשונית העצות ולעמוד הקהילה
export function Avatar({ name, icon, small }: { name: string; icon: string | null; small?: boolean }) {
  return (
    <span className={`tp-avatar${small ? ' tp-avatar--small' : ''}`} aria-hidden>
      {icon || name.charAt(0)}
    </span>
  )
}
