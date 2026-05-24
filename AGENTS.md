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
- `app_request_logs` for request-level production debugging

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

### 8. User actions must leave a server-side trace

Mutating and auth-related API routes should write a row to `app_request_logs`
with:
- `request_id`
- route, method, and action
- username when known
- request payload summary
- response payload summary
- status, success flag, and duration
- serialized error details on failure

When returning an error from an API route, prefer including `requestId` in the
JSON response so production debugging can correlate a user-visible failure with
an exact log row.

### 9. Logging good practices

- Never log passwords, service-role keys, Gemini keys, session secrets, or full
  auth tokens.
- Prefer payload summaries over noisy dumps when the full body is not needed.
- For health notes and body notes, logging the raw note is acceptable for this
  private single-user app, but keep secrets and unrelated credentials out of
  request payloads.
- Logging must never block the user action from completing. Fail open if log
  writes fail.
- Schema changes require a new Supabase migration file, not edits to an old one.

### 10. Env good practices

- Local bcrypt hashes in `.env` that start with `$2...` should be quoted or the
  dollar signs escaped because env expansion can mangle them in some loaders.
- Vercel env values should mirror production-only secrets without exposing them
  to client bundles.
- After env changes on Vercel, redeploy or confirm a fresh deployment picked
  them up.

---

## Supabase Tables

| Table | Notes |
|---|---|
| `profile` | Single `id='current'` row for current profile/goals |
| `body_measurements` | Timestamped measurements |
| `daily_entries` | Raw notes plus validated parsed JSON |
| `daily_summaries` | One row per date, recalculated from active entries |
| `llm_runs` | Prompt/model/output audit table |
| `app_request_logs` | Request-level trace logs for auth and user actions |
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
