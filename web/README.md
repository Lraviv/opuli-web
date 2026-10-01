# עוזר הסטודנט — Web

גרסת ה-web של האפליקציה: React רגיל (Vite, בלי Expo/React Native), מדבר עם
ה-backend (FastAPI, בתיקיית `../backend`) דרך REST API בלבד - אין שום גישה
ישירה ל-SQL מהדפדפן.

## הרצה מקומית

צריך להריץ שני שרתים במקביל, בשני טרמינלים נפרדים:

**1. Backend** (מתיקיית `backend/`):

```bash
cd backend
source .venv/bin/activate   # ה-venv כבר מוכן עם כל התלויות מותקנות
uvicorn app.main:app --reload
```

עולה על http://localhost:8000 . משתמש כרגע ב-SQLite מקומי (`backend/dev.db`) -
לא צריך Docker/Postgres כדי לפתח.

**2. Web** (מתיקיית `web/`):

```bash
cd web
npm install   # פעם ראשונה בלבד
npm run dev
```

עולה על http://localhost:5173 ומצפה שה-backend רץ על http://localhost:8000
(אפשר לשנות ב-`.env`, מפתח `VITE_API_URL`).

## מבנה

```
src/
  lib/
    api.ts        # קליינט REST דק (fetch) - הרשאות JWT, refresh אוטומטי
    queries.ts     # React Query hooks
    types.ts       # טיפוסי TS תואמים לסכמות ה-Pydantic של ה-backend
    theme.css      # טוקני עיצוב - הועתקו מ-mobile/src/constants/theme.ts
    grades.ts / schedule.ts / requirements.ts / links.ts  # לוגיקה טהורה, זהה לאפליקציה
  auth/
    AuthContext.tsx  # התחברות/הרשמה/התנתקות, שמירת טוקנים ב-localStorage
  components/      # Shell, רכיבי UI, Skeleton, מחשבון ציון, מטלות, מפגשים, קישורים, דרישות תואר
  pages/           # Login, Register, Home, Schedule, Degrees, DegreeDetail, Courses, CourseDetail, Reminders, Profile
tests/
  logic.test.ts    # npm test - בלי framework, רץ בכמה אזורי זמן
```

## בנייה לפרודקשן

```bash
npm run build
```

יוצר `dist/` - קבצים סטטיים שאפשר להעלות לכל שירות אחסון סטטי (Netlify,
Vercel, Cloudflare Pages וכו'). האתר עצמו פרוס ב-Vercel, ומשתנה הסביבה
`VITE_API_URL` שם מצביע לשרת ב-Render.
