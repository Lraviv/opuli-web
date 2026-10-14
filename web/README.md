# OpuLi — Web

The web version of the app: plain React (Vite, no Expo/React Native). It talks to
the backend (FastAPI, in `../backend`) only through the REST API; the browser
never touches SQL directly.

## Running locally

Run two servers side by side, in two terminals:

**1. Backend** (from `backend/`):

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

Runs on http://localhost:8000. It uses a local SQLite database (`backend/dev.db`),
so you don't need Docker/Postgres for development.

**2. Web** (from `web/`):

```bash
cd web
npm install   # first time only
npm run dev
```

Runs on http://localhost:5173 and expects the backend on http://localhost:8000
(change it with `VITE_API_URL` in `.env`).

## Structure

```
src/
  lib/
    api.ts        # thin REST client (fetch): JWT auth, automatic refresh
    queries.ts    # React Query hooks
    types.ts      # TS types matching the backend's Pydantic schemas
    theme.css     # design tokens, copied from mobile/src/constants/theme.ts
    grades.ts / schedule.ts / requirements.ts / links.ts / tips.ts  # pure logic, same as the mobile app
  auth/
    AuthContext.tsx  # sign-in/sign-up/sign-out, tokens kept in localStorage
  components/      # Shell, UI pieces, Skeleton, grade calculator, assignments, sessions, links, degree requirements, course tips
  pages/           # Login, Register, Home, Schedule, Degrees, DegreeDetail, Courses, CourseDetail, Reminders, Profile
tests/
  logic.test.ts    # npm test, no framework, runs in several time zones
```

## Production build

```bash
npm run build
```

Creates `dist/`, static files you can upload to any static host.

The live site is https://opuli.web.app (Firebase Hosting). Deploy it with
`sh scripts/deploy-hosting.sh` from `web/`: it builds with `VITE_API_URL`
pointing at the Cloud Run backend and uploads the result. It needs `gcloud`
on your PATH and signed in.
