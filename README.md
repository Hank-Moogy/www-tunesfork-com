# TunesFork

TunesFork is a web app and Electron sync client for Ableton project
collaboration.

## Web App

```bash
npm install
npm run dev
```

The local web app runs on `http://localhost:8080`.

## Electron Sync App

```bash
cd electron
npm install
npm run dev:all
```

For staging against the owned Supabase backend:

```bash
TUNESFORK_URL=http://localhost:8080 \
TUNESFORK_FUNCTIONS_URL=https://urrxrntdkmmmqqwaihfj.supabase.co/functions/v1 \
TUNESFORK_STATE_DIR=/tmp/tunesfork-sync-staging-state \
npm run dev:all
```

## Backend

Supabase migrations and Edge Functions live under `supabase/`.
See `docs/OWNED_BACKEND_MIGRATION.md` for the owned-backend migration notes.
