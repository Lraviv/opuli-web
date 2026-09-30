# שרת ה-API של OpuLi לייצור (Render). בעלייה: מריץ מיגרציות ואז uvicorn.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ENVIRONMENT=production

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

# משתמש לא-root; הקבצים מועתקים בבעלותו (במק חלק מהקבצים הם 600, כך ש-root
# כבעלים היה חוסם את הקריאה שלהם).
RUN useradd --create-home opuli
COPY --chown=opuli:opuli alembic.ini .
COPY --chown=opuli:opuli alembic ./alembic
COPY --chown=opuli:opuli app ./app
USER opuli

# worker יחיד: ה-scheduler של התזכורות רץ בתוך התהליך, ועם כמה workers
# כל תזכורת הייתה נשלחת כמה פעמים. Render מגדיר PORT.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
