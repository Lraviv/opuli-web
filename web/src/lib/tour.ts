// פתיחת חלון ההסבר (WelcomeTour) מכל מקום באתר - ה-Shell מאזין לאירוע הזה
export const OPEN_TOUR_EVENT = 'opuli:open-tour'

export function openWelcomeTour() {
  window.dispatchEvent(new Event(OPEN_TOUR_EVENT))
}
