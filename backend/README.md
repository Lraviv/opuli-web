# OpuLi — Backend (FastAPI)

The full API from the app spec: sign-up/sign-in (JWT, plus Google sign-in), degrees and course catalogs, picking a course from the catalog, manual personal courses, progress items (lessons/assignments), exams with reminders, push token registration, and an internal endpoint that sends the reminders that are due. The main flows are covered by a `pytest` suite.

**Not included here:** the mobile app itself (it isn't in this repository).

> **Note:** if you don't have Docker/Postgres installed locally, you can skip step 1
> (docker compose) and just set `DATABASE_URL` in `.env` to `sqlite:///./dev.db`.
> That's enough for web development (it's the current default). Production
> uses a real Postgres connection string.

## Running locally

1. **Database**: start a local Postgres with Docker (from the project root, not `backend/`):

   ```bash
   docker compose up -d
   ```

2. **Python environment**:

   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate   # on Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Environment file**:

   ```bash
   cp .env.example .env
   # then edit .env and set JWT_SECRET to a random value, for example:
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

4. **Start the server**:

   ```bash
   uvicorn app.main:app --reload
   ```

   The server runs on http://localhost:8000. Interactive API docs (Swagger) are at http://localhost:8000/docs, handy for trying endpoints without writing client code.

   Outside production, the server creates any missing tables on startup (`create_all`, see `app/db.py`), so local development works without running migrations.

## Migrations (Alembic)

In production the schema is managed only by Alembic migrations: the Docker image runs `alembic upgrade head` before starting the server (see `Dockerfile`), and `create_all` is skipped.

To apply migrations by hand:

```bash
alembic upgrade head
```

Every change to the models (`app/models.py`) gets a new migration:

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

## Running the tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

The tests run against a temporary SQLite database (with foreign keys enforced) and cover: sign-up/sign-in/token refresh, creating a degree and its course catalog, picking a catalog course (including "already picked"), manual courses, progress items, exams with default and custom reminders, push sending through `/internal/check-reminders` (with the network call mocked), course tips, the community forum (including event RSVPs and who can see attendee emails), and isolation between users (one user can't touch another user's data).

## Quick check that everything works

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"supersecret1","display_name":"Test"}'
```

You should get back JSON with an `access_token` and a `refresh_token`.

## Folder structure

```
backend/
  app/
    main.py         # creates the FastAPI app: CORS, lifespan, routers
    config.py       # settings from environment variables / .env
    db.py           # database connection
    models.py       # all SQLModel tables (User, Degree, CatalogCourse, Course, ...)
    security.py     # password hashing + creating and decoding JWTs
    schemas.py      # request/response models (Pydantic) for the API
    deps.py         # dependency that identifies the signed-in user from the token
    authz.py        # helpers that check ownership of a resource (degree/course/exam/item)
    push.py         # push sending via Expo (no extra dependency, plain httpx)
    routers/
      auth.py          # /auth/register, /auth/login, /auth/refresh, /me
      degrees.py       # /degrees, /degrees/{id}/catalog, /catalog-courses/...
      courses.py       # /courses, /courses/{id}/items, /items/{id}
      exams.py         # /exams, /courses/{id}/exams, /exams/{id}
      tips.py          # /courses/{id}/tips (shared course tips and votes)
      forum.py         # /forum/... (community forum per institution: posts, events, comments, reports)
      push_tokens.py   # /push-tokens
      internal.py      # /internal/check-reminders (for the external trigger)
      ...              # calendar, feedback, planner, reminders, semesters, study_topics
  alembic/            # migrations
  tests/              # pytest suite (conftest.py has the client and sign-up fixtures)
  requirements.txt
  requirements-dev.txt # requirements.txt + pytest
  .env.example
```

## Endpoints

See the app spec (`app-spec.md`) for the full list, or open http://localhost:8000/docs after starting the server: Swagger lists every endpoint and lets you try them from the browser.

## Degree templates (`app/catalog_templates.py`)

A fixed course catalog, the same for every user (currently "B.Sc. in Computer Science, Open University of Israel": 72 courses, following the latest official program), is defined in one place in `app/catalog_templates.py` and exposed through the API:

- `GET /degree-templates`: the available templates.
- `POST /degrees` with `template: "cs_open_university"` in the body creates a degree and loads the template's whole course catalog into it. This is the recommended way to create a CS degree from the app; no script needed.

## Scripts (`scripts/`)

### `seed_cs_catalog.py`

**A backup/repair tool only.** Usually not needed, since `POST /degrees` with `template` (above) does the same thing from the app. Mostly useful for a degree that was created manually before the template existed, or to refill a catalog that was deleted by mistake. It reads from the same source (`app/catalog_templates.py`) so the two can't drift apart. It also marks the three courses already noted as completed/in progress (skip with `--skip-progress`). It's idempotent: safe to run again, it just skips courses that already exist.

**Important:** sign up once through the app first. The script finds the user by email; it doesn't create an account.

```bash
cd backend
source .venv/bin/activate
python scripts/seed_cs_catalog.py --email your@email.com
```

(Make sure `docker compose up -d` is running and `.env` is set up, just like for running the server.)

## Still missing

- Per-token handling of the Expo response (right now `app/push.py` only checks whether the whole batch succeeded; a future improvement is to detect invalid tokens and delete them)
- Email verification, rate limiting and a broader security policy (listed as an open topic in the app spec)
