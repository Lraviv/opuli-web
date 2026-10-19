// טקסט חופשי של משתמשים (עצות, פוסטים): כתובות הופכות לקישורים שנפתחים בלשונית חדשה
import type { ReactNode } from 'react'

export function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc">
        {part}
      </a>
    ) : (
      part
    ),
  )
}
