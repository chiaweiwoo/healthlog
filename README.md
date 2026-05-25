# HealthLog

HealthLog is a private single-user health logging app built for fast daily capture
from messy free-text notes. The app keeps raw notes, parses them into structured
records with Gemini, and recalculates a daily summary for intake, output, TDEE,
and deficit or surplus.

The app also keeps request-level debug traces in Supabase so production issues can
be tied back to a `requestId` and a server-side log row. LLM parse attempts are
also recorded in `llm_runs`, and raw body/profile notes are preserved in
`body_notes`.

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
- `/app/profile`
- `/app/analysis`

## Local Setup

1. Install dependencies with `npm install`
2. Copy `.env.example` into your local env setup
3. Generate a password hash with `npm run hash-password -- your-password`
4. If the bcrypt hash starts with `$2...`, quote it or escape the dollar signs in local env files
5. Run the Supabase migrations in `supabase/migrations`
6. Start the app with `npm run dev`

## Supabase Setup Notes

- The app uses schema `healthlog`, not `public`
- In Supabase `Project Settings -> API -> Exposed schemas`, include `healthlog`
- `service_role` needs grants on schema `healthlog`, its tables, sequences, and routines
- The migration `supabase/migrations/20260525113000_harden_note_lifecycle.sql` includes the current grant baseline
- After schema or grant changes, verify the app can read and write `healthlog.daily_entries`

## Debug Logging

- User actions and auth-related API requests are written to `healthlog.app_request_logs`
- Every Gemini parse attempt is written to `healthlog.llm_runs`
- Raw body/profile notes are written to `healthlog.body_notes`
- Error responses may include a `requestId`
- Use that `requestId` to find the matching log row in Supabase when debugging production issues

## Current Behavior

- Daily notes are inserted first with parse state `pending`, then updated to `parsed` or `failed`
- Failed parsing keeps the raw note visible instead of dropping the user input
- Daily summaries treat unknown calories and macros as incomplete, not zero
- Intake is one grouped story: food, calorie-bearing drinks, and water all contribute to daily intake
- Water-bearing beverages can appear in both food/drink and water breakdowns when `waterMl` is known
- Output uses a component model:
  - `BMR` from Mifflin-St Jeor
  - `baseTdee = BMR * baselineLifestyleMultiplier`
  - `baselineActivity = baseTdee - BMR`
  - `TEF` from today's protein, carbs, fat, and alcohol
  - `EAT` from explicitly logged exercise
  - `TDEE = baseTdee + TEF + EAT`
- Deficit is calculated as `TDEE - intake calories`
- Mobile warning details open in a tap-friendly dialog
- Baseline lifestyle and profile context can be managed from the profile page
- The mobile dashboard prefers dense list rows over decorative metric cards

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
