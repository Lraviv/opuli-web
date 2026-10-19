// אפשרויות פרסום של מנהלות: בשם "צוות OpuLi", נעיצה, ובקהילה גם לכל המוסדות
export interface TeamFlags {
  as_team: boolean
  pin: boolean
  all_institutions?: boolean
}

export function TeamOptions({
  value,
  onChange,
  withAllInstitutions,
}: {
  value: TeamFlags
  onChange: (next: TeamFlags) => void
  withAllInstitutions?: boolean
}) {
  const box = (key: keyof TeamFlags, label: string) => (
    <label className="team-opts__opt">
      <input type="checkbox" checked={!!value[key]} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
      {label}
    </label>
  )
  return (
    <fieldset className="team-opts">
      <legend>אפשרויות מנהלת</legend>
      {box('as_team', 'פרסום בשם צוות OpuLi')}
      {box('pin', 'נעיצה למעלה')}
      {withAllInstitutions && box('all_institutions', 'לכל המוסדות')}
    </fieldset>
  )
}

/** תג "רשמי" ליד השם בפוסט של צוות OpuLi */
export function TeamBadge() {
  return <span className="team-badge">רשמי</span>
}
