# OpuLi

**כל התואר במקום אחד: מטלות, מבחנים, נ"ז ומה שנשאר לעשות השבוע.**

התחלתי את OpuLi כי באוניברסיטה הפתוחה המידע מפוזר בין שאילתא, אופל, החוברת של כל קורס ו-Excel אחד שהלך והסתבך. רציתי לפתוח מקום אחד ולדעת מה מגישים השבוע, כמה ממ"נים עוד חסרים כדי לגשת לבחינה, וכמה נ"ז נשארו עד התואר.

זה הריפו של האתר והשרת. האפליקציה לאייפון ולאנדרואיד נמצאת ב-[opu-li](https://github.com/Lraviv/opu-li).

<p align="center">
  <img src="docs/screenshots/web-home.png" alt="מסך הבית: קישורים מהירים, נ״ז, מטלות ומבחנים קרובים" width="720">
</p>

## מה יש בפנים

### ממ"נים וממ"חים, ומה חסר כדי לגשת לבחינה
מגדירים לכל מטלה סוג, משקל, תאריך הגשה ואם היא חובה. אם בקורס צריך להגיש לפחות 3 מטלות, או מטלות בשווי 15 נק', רואים מיד כמה עוד חסר ואיזו מטלת חובה עוד לא הוגשה. סדרה שלמה, למשל ממ"ן 11 עד 14, נוצרת בלחיצה אחת.

<img src="docs/screenshots/web-assignments.png" alt="רשימת מטלות עם סטטוס זכאות לבחינה" width="560">

### כמה צריך בבחינה?
מזינים את הציון הסופי שרוצים, והמחשבון אומר כמה צריך להוציא בבחינה. אפשר גם הפוך: להזין ציון בחינה ולראות מה יהיה הציון הסופי. המחשבון מתחשב במשקלים מהחוברת, בסף המעבר בבחינה ובמטלות מגן. למטלות שעוד לא נבדקו אפשר להזין ציון משוער או לסמן "לא אגיש" ולראות מה זה עושה לציון.

<img src="docs/screenshots/web-calculator.png" alt="מחשבון ציון סופי" width="560">

### דרישות התואר
מגדירים כמה נ"ז צריך בכל קטגוריה (חובה, בחירה, סמינר, סדנה) ורואים לכל אחת מה הושלם, מה בתהליך ומה רק מתוכנן. בקטגוריות החובה הדרישה מתמלאת לבד מהקטלוג, ולצידה מוצג גם כמה קורסי חובה עוד לא בחרת.

<img src="docs/screenshots/web-requirements.png" alt="דרישות התואר לפי קטגוריה" width="560">

### הלו"ז של השבוע
מפגשי הנחיה (גם כאלה שהם כל שבועיים), מבחנים, הגשות ותזכורות, יום אחרי יום. אפשר לסמן מטלה כהוגשה ישירות מהלו"ז.

<img src="docs/screenshots/web-schedule.png" alt="לו״ז שבועי" width="560">

### ייצוא ליומן
יוצרים כתובת מנוי אישית ומוסיפים אותה פעם אחת ל-Google Calendar, ל-Apple או ל-Outlook. מאותו רגע המבחנים, ההגשות והמפגשים מופיעים ביומן ומתעדכנים לבד. מי שמעדיף יכול גם להוריד קובץ ‎.ics.

### ועוד
- קישורים מהירים לשאילתא, לאופל, להקלטות ולמאגר מבחנים, במסך הבית וגם בכל קורס
- מעקב שיעורים וחומר ללימוד לקראת המבחן
- לוח תכנון סמסטרים וממוצע משוקלל
- תבנית מוכנה לתואר במדעי המחשב באו"פ, עם 72 קורסים בקטלוג
- מצב כהה, וצבע ראשי לבחירה

<p align="center">
  <img src="docs/screenshots/web-mobile-schedule-dark.png" alt="הלו״ז בנייד, מצב כהה" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/web-mobile-calculator-dark.png" alt="המחשבון בנייד, מצב כהה" width="260">
</p>

---

## למפתחים

| | |
|---|---|
| `backend/` | FastAPI + SQLModel, מסד Postgres (Supabase), מיגרציות Alembic. רץ על Render |
| `web/` | React + Vite + TanStack Query. רץ על Vercel |
| `docs/` | מסמכי תכנון וצילומי מסך |

### הרצה מקומית

```bash
# שרת (ברירת המחדל לפיתוח היא SQLite, אין צורך ב-Docker)
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload        # http://localhost:8000/docs

# אתר (בטרמינל נוסף)
cd web
npm install
npm run dev                          # http://localhost:5173
```

פרטים נוספים ב-[backend/README.md](backend/README.md) וב-[web/README.md](web/README.md).

### משתני סביבה

| איפה | משתנה | למה |
|---|---|---|
| Render | `DATABASE_URL`, `JWT_SECRET`, `INTERNAL_SECRET` | מסד הנתונים וחתימת טוקנים |
| Render | `CORS_ORIGINS` | כתובת האתר ב-Vercel |
| Render | `RESEND_API_KEY` | שליחת מיילים: משוב ואיפוס סיסמה |
| Render | `FEEDBACK_TO_EMAIL` | הכתובת שאליה מגיע המשוב |
| Render | `FRONTEND_URL` | לא חובה. הכתובת לקישורים במיילים (ברירת המחדל: האתר הראשון ב-`CORS_ORIGINS`) |
| Render | `GOOGLE_CLIENT_ID` | התחברות עם Google |
| Vercel | `VITE_API_URL` | כתובת השרת ב-Render |
| Vercel | `VITE_GOOGLE_CLIENT_ID` | התחברות עם Google |
| Vercel | `VITE_LINKEDIN_URL`, `VITE_AUTHOR_NAME` | הקישור ל-LinkedIn בפוטר (ריק = לא מוצג) |
| Vercel | `VITE_FEEDBACK_EMAIL` | לא חובה. כפתור הגיבוי "פתיחה באפליקציית המייל" במשוב |

### בדיקות

```bash
cd backend && pytest        # API: הרשאות, ולידציה, ייצוא יומן
cd web && npm test          # לוגיקת ציונים ולו"ז, בכמה אזורי זמן
```

הלוגיקה של הציונים, הלו"ז ודרישות התואר נמצאת ב-`web/src/lib/`, בפונקציות טהורות בלי React. אותם קבצים בדיוק קיימים גם באפליקציה, כדי ששני הצדדים יחשבו אותו דבר.
