import { useSyncExternalStore } from 'react'

/** האם media query מתקיים עכשיו - מתעדכן כשהחלון משנה גודל */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
