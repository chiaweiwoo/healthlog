# HealthLog V1 Plan

## Summary
HealthLog is a private single-user web app for recording a healthier journey through messy free-text notes. Gemini turns notes into structured records without losing remarks or uncertainty. V1 focuses on food, water, exercise, body profile/measurements, daily calorie/TDEE/deficit summary, and a lightweight analysis placeholder.

## Product Behavior
- `/login`: username/password login with `APP_USERNAME` and `APP_PASSWORD_HASH`, signed HttpOnly cookie, 3-day expiry.
- `/app`: daily dashboard with date picker, free-text input, raw records list, and daily summary.
- `/app/body`: free-text profile/body input plus progressive measurements history.
- `/app/analysis`: placeholder for future weekly analysis.
- Daily summary stays compact: calories, protein, fat, carbs, water, exercise calories, estimated TDEE, estimated deficit/surplus.
- Detailed food/water/exercise breakdowns are expandable so the daily screen stays focused.
- Low-confidence items remain visible and show warnings explaining uncertainty and what would improve the estimate.
- Mentioned time is preserved when available.

## Implementation Notes
- Stack: Next.js App Router, TypeScript, shadcn-style UI primitives, Supabase, Gemini, Langfuse, Zod, date-fns, Vitest.
- Gemini model selection is internal to the code. Routine parsing uses a fast default model; uncertain brand/menu/restaurant parsing can use a stronger search-oriented path.
- Stable query fields are scalar columns. Evolving or unknown structures are JSONB.
- Raw notes are stored first. Summaries are recalculated from active entries. The LLM never directly mutates database state.
- Singapore is the default food context unless the user says otherwise.
- TDEE uses Mifflin-St Jeor by default and warns instead of faking precision when profile fields are missing.

## User Setup
- Provide Supabase URL and service role key in Vercel/local env.
- Provide Langfuse keys if tracing should be active.
- Run the Supabase migration in `supabase/migrations`.
- Deploy env vars in Vercel.

## Deferrals
- Sleep, medication, reminders, self-improving prompt rules, full weekly analysis, photo/label input, multi-user auth, and public sharing/export.
