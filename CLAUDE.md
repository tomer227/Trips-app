# CLAUDE.md – "הטיול הגדול" (Trips app)

Talk to the user in **Hebrew**. The user is not a developer: explain each step simply, one command at a time, and say exactly where to click.

## What this is
A mobile-first, Hebrew (RTL) PWA guide for young Israelis on the post-army "big trip" (East Asia, South America, Central America): country guides, an illustrated map of the "hummus trail" with reviews, trip planner and budget, journal and expenses, checklist, currency converter, phrasebook. Google Places (New) supplies live real-world places; Supabase provides accounts, private sync and shared reviews.

## Commands
```
npm install
npm run dev              # dev server; /api/places is served by server/vitePlugin.ts (needs GOOGLE_MAPS_API_KEY in .env.local)
npm test                 # vitest (154 tests)
npm run build            # tsc -b && vite build -> dist/
npm run build:functions  # bundles the Firebase function into functions/index.js
npm run weekly-places    # weekly places report (needs GOOGLE_MAPS_API_KEY)
```

## Layout
- `src/pages`, `src/components` – UI (React 19 + TypeScript + Vite, hash router in `src/router.ts`).
- `src/data` – curated content (countries, places, tips, checklist). Content was written from general knowledge and is **not verified** against official sources; the UI says so for visas/emergency/safety.
- `src/places` – Google layer: API client (memory cache only), mapping to the app's `Place`, filters, categories, hotspot model.
- `server/places.ts` – framework-free proxy for Google Places (key stays server-side, fixed field masks, validation, cache, rate limit). Adapters: `api/places/[action].ts` (Vercel), `netlify/functions/places.ts`, `functions/src/index.ts` (Firebase), `server/vitePlugin.ts` (dev/preview).
- `src/cloud` – accounts: `CloudBackend` interface, Supabase and in-memory implementations, private sync engine (`sync.ts`), `AuthContext`.
- `supabase/migrations/0001_init.sql` – schema + Row Level Security. `supabase/rls.test.ts` runs it on Postgres (PGlite).
- `scripts/weekly-places.ts` + `.github/workflows/weekly-places.yml` – weekly report as a GitHub issue.
- `docs/` – setup guides: `FIREBASE_DEPLOY.md`, `SUPABASE_SETUP.md`, `GOOGLE_PLACES_SETUP.md`, `WEEKLY_PLACES.md`.

## Rules that matter
- **Never commit or print secrets.** `.env*` is git-ignored (except `.env.example`). The Supabase `anon` key and URL are public by design; the **`service_role` key must never be requested, pasted or used**. The user pastes secrets into the terminal/dashboard themselves.
- **Google content:** do not store Google place content (names, ratings, hours, photos, coordinates) in the repo, localStorage or the database. Only place IDs may be kept. Show "מידע חיצוני מ־Google" and "Powered by Google" wherever Google data is shown.
- Google rating and community rating are different things and are always shown separately. A Google place is never called "Israeli hotspot" without community reports.
- UI copy is Hebrew and RTL. Keep the chunky, playful style already in `src/styles.css`.
- Run `npx tsc -b`, `npm test` and `npm run build` before committing. Commit on branch `claude/travel-app-user-friendly-n8gmzm`.
- **Ask the user before** anything that changes billing, deletes data, creates/rotates a secret, or is hard to undo.

## State of the project
Built and tested (unit tests + real browser runs at phone size): everything in the UI, the Google proxy (also against the real API), the weekly report script (real run), the Supabase SQL (on real Postgres), sync and accounts (against an in-memory backend).

**Not yet done / not verified on the real services:**
1. Nothing is deployed. Goal: Firebase Hosting + the `places` Cloud Function (Blaze plan is already active) – follow `docs/FIREBASE_DEPLOY.md`.
2. Supabase project is not set up: run the SQL, set Site URL and Redirect URLs, put `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` – follow `docs/SUPABASE_SETUP.md`. Real sign-up email confirmation and password-reset emails must be tested by hand after that.
3. The Google Maps API key used during development was pasted into a chat and must be treated as **compromised**: ask the user to create a new one (restricted to Places API (New) only, with quotas and a budget alert) and set it with `npx firebase-tools functions:secrets:set GOOGLE_MAPS_API_KEY` (the user pastes it).
4. GitHub Actions weekly job: needs the repo secret `GOOGLE_MAPS_API_KEY` and "Read and write" workflow permissions; not run on GitHub yet.
5. Known limits: a deletion on one device can be undone by another device (no per-item timestamps); review photos stay on the device; no Google sign-in; no moderation screen (hidden reviews are managed in the Supabase dashboard).

## Current task (from the user)
Put the app live and make every feature work: deploy to Firebase, connect Supabase accounts, verify the live site (sign-up, sign-in, sync, map, Google search, reviews), then report what works and what does not. Work step by step, show the user what you are about to do, and use the browser only for the dashboard steps that need it (Supabase SQL editor and URL settings, Google Cloud key/quota/budget).
