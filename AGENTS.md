# HealthLog - AI Session Memory

Auto-loaded by Codex. Records hard invariants and current architecture that
must stay aligned with the repo.

**Scope:** this session is HealthLog only (`chiaweiwoo/healthlog`). Do not edit,
commit, or push any other repository from this thread.

---

## Project Overview

HealthLog is a private single-user web app for recording food, water, exercise,
body profile, and measurements from messy free-text notes.

Stack:
- Next.js App Router + TypeScript
- Supabase schema `healthlog`
- Gemini for structured parsing
- Langfuse for LLM observability
- Zod for validation

Current V1 routes:
- `/login`
- `/app`
- `/app/body`
- `/app/analysis`

---

## Critical Invariants

### 1. Raw note first, derived summary second

Daily notes must be stored as raw entries before the day summary is recalculated.
Gemini may suggest structure, but it must never directly mutate database state.

Correct flow:
- insert/update `daily_entries.raw_note`
- store validated parsed JSON on the entry
- recalculate `daily_summaries` from active entries

### 2. Model choice is internal

Do not require the user to provide a Gemini model env var.

Current routing:
- routine daily parsing -> fast Gemini Flash Lite path
- brand/menu/restaurant uncertainty -> stronger Gemini Flash path
- body/profile parsing -> fast Gemini Flash Lite path

If models change, update the model map in code and tests/docs together.

### 3. Unknown structure belongs in JSONB

Use scalar columns for stable query/sort/summarize fields. Use JSONB for evolving
payloads such as parsed items, warnings, metadata, breakdowns, LLM outputs, and
future analysis reports.

### 4. Low confidence remains visible

Never drop an uncertain food, water, exercise, or measurement item just because
the estimate is weak. Keep the row visible, lower confidence, and attach warnings
with a clear `improveWith` hint.

### 5. TDEE must not fake precision

TDEE uses Mifflin-St Jeor. If age, sex, height, weight, or activity level is
missing, return `null` for incomplete values and show warnings instead of making
up defaults.

### 6. JSON reliability comes from prompt contract + tolerant parsing

Gemini calls use strict JSON-only prompts, Zod validation, and tolerant JSON
object extraction. Do not assume raw `JSON.parse(response.text)` is sufficient.

### 7. Secrets stay server-side

Keep these server-side only:
- `APP_PASSWORD_HASH`
- `SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- Langfuse secret key

Do not expose them via client components or public env vars.

---

## Supabase Tables

| Table | Notes |
|---|---|
| `profile` | Single `id='current'` row for current profile/goals |
| `body_measurements` | Timestamped measurements |
| `daily_entries` | Raw notes plus validated parsed JSON |
| `daily_summaries` | One row per date, recalculated from active entries |
| `llm_runs` | Prompt/model/output audit table |
| `analysis_reports` | Placeholder for future weekly analysis |

Migration lives in `supabase/migrations`.

---

## Testing

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI should run lint, typecheck, tests, and production build.
