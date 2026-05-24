# HealthLog

HealthLog is a private single-user health logging app built for fast daily capture
from messy free-text notes. The app keeps raw notes, parses them into structured
records with Gemini, and recalculates a daily summary for calories, macros, water,
exercise, TDEE, and deficit or surplus.

The app also keeps request-level debug traces in Supabase so production issues can
be tied back to a `requestId` and a server-side log row.

## Stack

- Next.js App Router
- TypeScript
- Supabase
- Gemini
- Langfuse
- Zod
- Vitest

## Routes

- `/login`
- `/app`
- `/app/body`
- `/app/analysis`

## Local Setup

1. Install dependencies with `npm install`
2. Copy `.env.example` into your local env setup
3. Generate a password hash with `npm run hash-password -- your-password`
4. If the bcrypt hash starts with `$2...`, quote it or escape the dollar signs in local env files
5. Run the Supabase migrations in `supabase/migrations`
6. Start the app with `npm run dev`

## Debug Logging

- User actions and auth-related API requests are written to `healthlog.app_request_logs`
- Error responses may include a `requestId`
- Use that `requestId` to find the matching log row in Supabase when debugging production issues

## Good Practices

- Keep all secrets server-side
- Add a new migration for every schema change
- Do not log passwords, API keys, or session secrets
- Keep request logging best-effort so app behavior does not fail just because logging failed

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
