# Student App — Backend (FastAPI)

מימוש מלא של ה-API לפי מסמך האיפיון: הרשמה/התחברות (JWT), תארים וקטלוג קורסים, בחירת קורס מהקטלוג, קורסים אישיים ידניים, פריטי התקדמות (שיעורים/מטלות), מבחנים עם תזכורות, רישום טוקני Push, ו-endpoint פנימי ששולח את התזכורות שהגיע זמנן. מכוסה בסוויטת בדיקות (`pytest`) שרצה על כל הזרימה המרכזית.

**מה עוד לא כלול כאן:** אפליקציית ה-React Native עצמה (מתוכננת בשלב הבא).

> **הערה:** אם אין לך Docker/Postgres מותקן מקומית, אפשר לדלג על שלב 1 (docker
> compose) ופשוט לשנות ב-`.env` את `DATABASE_URL` ל-`sqlite:///./dev.db` -
> זה מספיק לגמרי לפיתוח ה-web (כרגע זו ברירת המחדל שהוגדרה). לפני עלייה
> לאוויר/פרודקשן כדאי לחזור למחרוזת Postgres אמיתית.

## הרצה מקומית

1. **מסד נתונים** — מפעילים Postgres מקומי עם Docker (מתיקיית השורש של הפרויקט, לא `backend/`):

   ```bash
   docker compose up -d
   ```

2. **סביבת פייתון**:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # ב-Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **קובץ סביבה**:

   ```bash
   cp .env.example .env
   # ואז לערוך את .env ולהחליף את JWT_SECRET לערך אקראי, למשל:
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

4. **הרצת השרת**:

   ```bash
   uvicorn app.main:app --reload
   ```

   השרת עולה על http://localhost:8000 . תיעוד ה-API האינטראקטיבי (Swagger) זמין ב-http://localhost:8000/docs — נוח לבדוק endpoints בלי לכתוב קוד קליינט.

   בהפעלה הראשונה השרת יוצר את כל הטבלאות אוטומטית (`create_all`). זה נוח לפיתוח; לניהול שינויי סכימה מסודר בהמשך (כשיהיו נתונים אמיתיים שלא רוצים לאבד) עוברים למיגרציות Alembic — ראו למטה.

## מיגרציות (Alembic)

יש כבר מיגרציה ראשונית (`alembic/versions/..._init.py`) שיוצרת את כל הטבלאות. כרגע, לנוחות הפיתוח המקומי, השרת עדיין יוצר טבלאות אוטומטית עם `create_all` באתחול (ראו `app/db.py`) - זה עובד גם בלי להריץ מיגרציות בכלל.

**לפני חיבור למסד "אמיתי" (Neon בענן וכו')** עדיף לעבור לזרימת עבודה מסודרת של מיגרציות:

```bash
alembic upgrade head        # מפעיל את המיגרציה הראשונית
```

וכל שינוי עתידי במודלים (`app/models.py`) מקבל מיגרציה חדשה עם:

```bash
alembic revision --autogenerate -m "תיאור השינוי"
alembic upgrade head
```

## הרצת בדיקות

```bash
pip install -r requirements-dev.txt
pytest -q
```

הבדיקות (`tests/test_api.py`) רצות על מסד SQLite זמני ומכסות: הרשמה/התחברות/רענון טוקן, יצירת תואר וקטלוג קורסים, בחירת קורס מהקטלוג (כולל "כבר נבחר"), קורס ידני, פריטי התקדמות, מבחנים עם תזכורות ברירת מחדל ומותאמות אישית, שליחת Push דרך `/internal/check-reminders` (עם Mock לקריאת הרשת בפועל), ובידוד בין משתמשים (משתמש/ת לא יכולים לגעת בנתונים של אחר/ת).

## בדיקה מהירה שהכול עובד

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"supersecret1","display_name":"בדיקה"}'
```

אמורה לחזור תשובת JSON עם `access_token` ו-`refresh_token`.

## מבנה תיקיות

```
backend/
  app/
    main.py         # יצירת ה-FastAPI app, CORS, lifespan, חיבור ה-routers
    config.py       # הגדרות מתוך משתני סביבה / .env
    db.py           # חיבור למסד הנתונים
    models.py       # כל טבלאות ה-SQLModel (User, Degree, CatalogCourse, Course, ...)
    security.py     # הצפנת סיסמאות + יצירה ופענוח של JWT
    schemas.py      # מודלי בקשה/תשובה (Pydantic) ל-API
    deps.py         # dependency שמזהה את המשתמש המחובר מתוך הטוקן
    authz.py        # עזרים שמוודאים בעלות על משאב (תואר/קורס/מבחן/פריט)
    push.py         # שליחת Push דרך Expo (בלי תלות חיצונית, httpx ישיר)
    routers/
      auth.py        # /auth/register, /auth/login, /auth/refresh, /me
      degrees.py      # /degrees, /degrees/{id}/catalog, /catalog-courses/...
      courses.py      # /courses, /courses/{id}/items, /items/{id}
      exams.py         # /exams, /courses/{id}/exams, /exams/{id}
      push_tokens.py   # /push-tokens
      internal.py      # /internal/check-reminders (לטריגר החיצוני)
  alembic/            # מיגרציות (יש מיגרציה ראשונית, ראו מעלה)
  tests/
    conftest.py       # fixtures לבדיקות (client, הרשמה+התחברות)
    test_api.py        # בדיקות end-to-end על כל הזרימה המרכזית
  requirements.txt
  requirements-dev.txt # requirements.txt + pytest
  .env.example
```

## Endpoints הקיימים

ראו את מסמך האיפיון (`app-spec.md`) לרשימה המלאה, או פשוט את http://localhost:8000/docs אחרי הרצת השרת - Swagger עם כל ה-endpoints, כולל אפשרות לנסות אותם ישירות מהדפדפן.

## תבניות תואר (`app/catalog_templates.py`)

קטלוג קורסים קבוע וזהה לכל המשתמשים (כרגע: "תואר ראשון במדעי המחשב, האוניברסיטה הפתוחה" - 72 קורסים, לפי התכנית הרשמית העדכנית) מוגדר במקום אחד ב-`app/catalog_templates.py`, ונחשף ב-API:

- `GET /degree-templates` - רשימת התבניות הזמינות.
- `POST /degrees` עם `template: "cs_open_university"` בגוף הבקשה - יוצר תואר וטוען אליו אוטומטית את כל קטלוג הקורסים של התבנית. זו הדרך המומלצת ליצור תואר במדעי המחשב מהאפליקציה - אין יותר צורך בהרצת סקריפט.

## סקריפטים (`scripts/`)

### `seed_cs_catalog.py`

**כלי גיבוי/תיקון בלבד** - לרוב אין צורך בו, כי `POST /degrees` עם `template` (למעלה) עושה את אותו הדבר אוטומטית מהאפליקציה. שימושי בעיקר לתואר שכבר נוצר ידנית לפני שהתבנית הייתה קיימת, או כדי למלא מחדש קטלוג שנמחק בטעות. שואב את הנתונים מאותו מקור (`app/catalog_templates.py`) כדי שלא יהיו שני מקורות שיכולים "להתפצל". מסמן אוטומטית גם את שלושת הקורסים שכבר צוינו כהושלמו/בתהליך (אפשר לדלג עם `--skip-progress`). אידמפוטנטי - אפשר להריץ שוב בבטחה, הוא רק ידלג על קורסים שכבר קיימים.

**חשוב:** קודם צריך להירשם פעם אחת דרך האפליקציה (מסך הרשמה) - הסקריפט מוצא את המשתמש/ת לפי האימייל, לא יוצר חשבון חדש.

```bash
cd backend
source .venv/bin/activate
python scripts/seed_cs_catalog.py --email your@email.com
```

(ודאו ש-`docker compose up -d` רץ ו-`.env` מוגדר, בדיוק כמו להרצת השרת עצמו.)

## מה עדיין חסר

- אפליקציית React Native / Expo (השלב הבא)
- טיפול פר-טוקן בתשובת Expo (כרגע `app/push.py` בודק רק הצלחה/כישלון של הבאץ' כולו - שיפור עתידי: לזהות טוקנים לא תקפים ולמחוק אותם)
- אימות אימייל, rate limiting, ומדיניות אבטחה מורחבת (הוזכר כנושא פתוח במסמך האיפיון)
