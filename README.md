# HealthLog

HealthLog is a private single-user health logging app built for fast daily capture
from messy free-text notes. The app keeps raw notes, parses them into structured
records with Gemini, and recalculates a daily summary for intake, output, TDEE,
and deficit or surplus.

The app also keeps request-level debug traces in Supabase so production issues can
be tied back to a `requestId` and a server-side log row. LLM parse attempts are
also recorded in `llm_runs`, and raw body/profile notes are preserved in
`profile_notes`.

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
6. Run `npm run check:schema` to confirm the required live schema objects are present
7. Start the app with `npm run dev`

## Supabase Setup Notes

- The app uses schema `healthlog`, not `public`
- In Supabase `Project Settings -> API -> Exposed schemas`, include `healthlog`
- `service_role` needs grants on schema `healthlog`, its tables, sequences, and routines
- The migration `supabase/migrations/20260525113000_harden_note_lifecycle.sql` includes the current grant baseline
- After schema or grant changes, verify the app can read and write `healthlog.daily_entries`
- Production schema work is not complete when code and migrations are merged. Apply the SQL to the live project in the same pass or hand off the exact SQL and verification steps explicitly.
- After adding a new table or column that app code depends on, reload the PostgREST schema cache and run `npm run check:schema`

## Debug Logging

- User actions and auth-related API requests are written to `healthlog.app_request_logs`
- Every Gemini parse attempt is written to `healthlog.llm_runs`
- Raw body/profile notes are written to `healthlog.profile_notes`
- Error responses may include a `requestId`
- Use that `requestId` to find the matching log row in Supabase when debugging production issues
- If `app_request_logs` is missing, treat that as a production deployment bug and fall back to Supabase API/Postgres logs until it is repaired

## Current Behavior

- Daily notes are inserted first with parse state `pending`, then updated to `parsed` or `failed`
- Failed parsing keeps the raw note visible instead of dropping the user input
- If summary recalculation fails after a raw note row or parsed row has already been saved, the API returns the saved entry with a non-fatal summary warning instead of treating it as a total save failure
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
- The Analysis page is a compact rolling review, not a card-heavy coaching surface
- Analysis uses one clean outer card with compact `Good` / `Watch` rows
- Analysis row titles are Title Case: `Calorie Outcome`, `Protein Intake`, `Water Intake`, `Energy Split`
- Each Analysis row is one short visible sentence, not a metric block plus a second explanation line
- `Watch` copy should give a concrete suggestion; `Good` copy should briefly reinforce what is working
- Avoid spending the compact row sentence on generic limited-data caveats when there is already enough signal to give a useful takeaway
- The Analysis "Energy split" row uses calorie contribution, not gram percentages:
  - protein = 4 kcal/g
  - carbs = 4 kcal/g
  - fat = 9 kcal/g
  - alcohol = 7 kcal/g
- Alcohol is included in the energy decomposition when present because the row is about calorie sources
- The current analysis job reviews the last 14 calendar days before the current local day and treats "complete days" as days with active parsed entries
- The current analysis job forces low confidence when fewer than 7 days are present in that window

## Good Practices

- Keep all secrets server-side
- Add a new migration for every schema change
- Do not log passwords, API keys, or session secrets
- Keep request logging best-effort so app behavior does not fail just because logging failed
- Run `npm run check:schema` after schema-dependent changes and before debugging mysterious request-id production failures

## Validation

- `npm run check:schema`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
