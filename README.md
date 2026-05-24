# HealthLog

HealthLog is a private single-user health logging app built for fast daily capture
from messy free-text notes. The app keeps raw notes, parses them into structured
records with Gemini, and recalculates a daily summary for calories, macros, water,
exercise, TDEE, and deficit or surplus.

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
4. Run the Supabase migration in `supabase/migrations/20260524154000_init_healthlog.sql`
5. Start the app with `npm run dev`

## Validation

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
