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
- `/app/profile`
- `/app/analysis`

---

## Critical Invariants

### 1. Raw note first, derived summary second

Daily notes must be stored as raw entries before the day summary is recalculated.
Gemini may suggest structure, but it must never directly mutate database state.

Correct flow:
- insert/update `daily_entries.raw_note`
- mark parse state on the entry
- store validated parsed JSON on the entry
- recalculate `daily_summaries` from active entries

Accepted parse states:
- `pending`
- `parsed`
- `failed`

If parsing fails, keep the raw note row visible and return a user-facing warning.
Do not drop the input or pretend it was parsed cleanly.

### 2. Model choice is internal

Do not require the user to provide a Gemini model env var.

Current routing:
- routine daily parsing -> fast Gemini Flash Lite path (`gemini-3.1-flash-lite`)
- brand/menu/restaurant uncertainty -> stronger Gemini Flash path (`gemini-3.5-flash`)
- body/profile parsing -> fast Gemini Flash Lite path (`gemini-3.1-flash-lite`)

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

Current component model:
- `BMR` comes from Mifflin-St Jeor
- `baseTdee = BMR * baselineLifestyleMultiplier`
- `baselineActivity = baseTdee - BMR`
- `TEF` is dynamic from today's macros and alcohol
- `EAT` is explicit logged exercise
- `TDEE = baseTdee + TEF + EAT`
- `Deficit = TDEE - intakeCalories`

Baseline activity means conservative non-exercise daily living only. Runs, gym,
sports, deliberate step sessions, and other explicit exercise must stay separate.
Do not reintroduce a remainder-style "physical activity" component that subtracts
TEF back out of baseline TDEE, and do not reuse traditional broad PAL-style
activity multipliers that silently include assumed exercise.

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
The session authentication cookie (`healthlog_session`) must strictly use `sameSite: "strict"` to protect the private single-user app from CSRF vulnerabilities.

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
- Blank optional env vars should be treated as `undefined`, not as invalid
  configured values. Empty strings in local env files can otherwise cause Zod
  validation to fail at request time and break unrelated flows such as session
  verification.
- Vercel env values should mirror production-only secrets without exposing them
  to client bundles.
- After env changes on Vercel, redeploy or confirm a fresh deployment picked
  them up.

### 11. Supabase API schema exposure is required

The app uses the Supabase Data API with `db.schema = "healthlog"`. That means the
Supabase project must expose `healthlog` in:
- `Project Settings`
- `API`
- `Exposed schemas`

If `healthlog` is missing there, app reads and writes will fail with:
- `PGRST106`
- `Invalid schema: healthlog`

Do not treat this as an app-code bug before checking schema exposure first.

### 12. Supabase schema grants are required too

Exposing a non-`public` schema is not enough by itself. The API role being used
must also have grants on that schema and its objects.

For this app, server-side requests use the `service_role` key, so `service_role`
needs at minimum:
- `usage` on schema `healthlog`
- table privileges in schema `healthlog`
- sequence privileges in schema `healthlog`
- routine privileges in schema `healthlog`
- default privileges for future objects in schema `healthlog`

If schema exposure is correct but grants are missing, requests can fail with:
- `42501`
- `permission denied for schema healthlog`

When that happens, fix the grants in Supabase SQL before treating it as an
application bug.

### 13. Langfuse generation usage must use the SDK's accepted fields

For manual Langfuse generation logging:
- pass Gemini token counts via `usage` and `usageDetails`
- do not try to pass `promptTokens`, `completionTokens`, or `totalTokens`
  as top-level generation fields in app code

Current useful mapping from Gemini `usageMetadata`:
- `promptTokenCount` -> `usage.promptTokens` and `usageDetails.input`
- `candidatesTokenCount + thoughtsTokenCount` -> `usage.completionTokens` and
  `usageDetails.output`
- `thoughtsTokenCount` -> `usageDetails.thoughts`
- `totalTokenCount` -> `usage.totalTokens` and `usageDetails.total`

If Langfuse traces show `cost = 0`, do not assume the request was free. First
check whether usage metadata is actually being forwarded and whether the model
name matches a priced Langfuse model definition.

---

## Supabase Tables

| Table | Notes |
|---|---|
| `profile` | Single `id='current'` row for current profile/goals |
| `body_measurements` | Timestamped measurements |
| `body_notes` | Raw body/profile note history plus parse status |
| `daily_entries` | Raw notes plus validated parsed JSON |
| `daily_summaries` | One row per date, recalculated from active entries; also stores `profile_snapshot` JSONB for the profile state used during recalculation |
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

## Good Practice Reminders

- Prefer preserving a user action with a warning over rejecting it after partial work
- Treat unknown nutrition as incomplete, not zero
- Keep mobile interactions tap-friendly; do not rely on hover-only affordances for important detail
- Prefer compact, list-first mobile summaries over decorative metric cards when density matters
- Compact mobile tables should bias width toward the middle content column. Time and numeric measurement columns can be kept tight because labels like `19:48` and `1000 kcal` are short; avoid truncating item names too aggressively just to preserve extra side-column whitespace.
- Daily dashboard is a single-column mobile-first feed (Calories → Water → Entries, max-w-2xl). New entries use a floating action button (FAB) opening a dialog — do not reintroduce an inline textarea form at the bottom of the page.
- Profile page is the setup/control center. It uses two primary cards: Essential Fields and Flexible Memory, and it is never blocked even when setup is incomplete.
- Profile editing is conversational only via an indigo `MessageCircle` FAB. Do not reintroduce inline field editors on the Profile page.
- Daily and Analysis must block with a centered setup overlay until these essentials are present: age, sex, height, weight, and baseline lifestyle (`activityLevel`).
- `body_notes` stays in the database as the audit trail, but the Profile UI no longer shows a recent-notes history section.
- Use `daily_summaries.profile_snapshot` to store essentials, derived BMR/NEAT/water target values, override values, and `snapshotAt` during recalculation.
- When resetting profile state for testing, back up the current `profile` row first, then clear only `profile`, `body_notes`, `body_measurements`, and `analysis_reports`. Do not clear `daily_entries`, `daily_summaries`, `app_request_logs`, or `llm_runs`.
- Prefer icons over text labels when the icon meaning is unambiguous in context (chevron for expand/collapse, pencil for edit, trash for delete, RotateCcw for back-to-today, FileText for raw note). Do not add redundant text labels beside them. Color alone is sufficient to convey status states (green = good, amber = warning) — avoid adding text badges that restate what the color already says.
- Treat intake as one concept: food, calorie-bearing drinks, and water belong to the same daily intake story
- **Section card pattern**: all major dashboard sections use a shared `SectionHeader` component (icon box + 10px uppercase caption + `text-base font-bold` title + optional right action). Cards use `bg-stone-50/60` with `border-stone-200` and a neutral shadow. Icon boxes get a subtle section-themed tint (orange-50 for energy, sky-50 for hydration, stone-50 for entries).
- **Progress bar rules**: use single semantic colors — not decorative per-row gradients. Sub-level breakdown bars (macro rows, TDEE components) are always `bg-stone-300`. Top-level status bars use one meaningful color: water is always `bg-sky-500`; energy intake bar is `bg-emerald-500` (deficit) or `bg-amber-400` (surplus). Never use multi-colored gradients just for visual variety.
- **Nutrition display**: use `NutritionIcons` component (Flame/Dumbbell/custom-fat-SVG/Wheat/Wine/Droplets) instead of pipe-separated text strings. Zero and null values are hidden.
- When adding Supabase objects in `healthlog`, include grants and defaults in the migration
- When changing prompt contracts, update the normalizers and tests in the same pass
- When the user is iterating on shipped UI tweaks and asks for changes in this repo, default to committing and pushing at the end of each completed pass unless they explicitly ask to keep it local. Do not repeatedly stop at "not pushed yet" for these small follow-up refinements.
- Do NOT verify or poll Vercel deployment status after pushing to GitHub. Running Vercel CLI checks or waiting for builds consumes excessive context tokens and time. Simply verify the local build compiles cleanly, push changes, and let Vercel handle automatic deployment.

---

## Session Insights & Lessons Learnt

### 1. Model Demands & Spikes (503 Errors)
- **Problem**: Older/experimental model configurations (like `gemini-2.5-flash-lite`) experienced frequent `503 Service Unavailable` errors during periods of high demand, resulting in unstable parsing states.
- **Solution**: Upgraded model routing to standard 2026 releases: `gemini-3.1-flash-lite` for daily/body quick notes and `gemini-3.5-flash` for complex brand/restaurant grounding. This immediately restored stable, sub-second parsing with zero timeout spikes.
- **Lesson**: Do not rely on temporary, unreleased, or non-GA model variations. Align standard routing with active, robust Flash-Lite offerings.

### 2. Langfuse Observability Specifications
- **Problem**: Passing token metrics (like `promptTokens`, `completionTokens`, or `totalTokens`) as top-level trace generation fields led to telemetry conflicts or silently dropped usage metadata in Langfuse.
- **Solution**: Unified all manual generation logging under standard SDK attributes—passing token numbers within the `usage` sub-object (`usage.promptTokens`, `usage.completionTokens`, `usage.totalTokens`) and using `usageDetails` for granular splits.
- **Lesson**: Ensure manual telemetry calls exactly match the SDK's schema definitions rather than passing intuitive top-level parameters.

### 3. Soft Delete UX Client-Side Handling
- **Problem**: Displaying soft-deleted items dimmed in the UI creates cluttered feeds, leading to a suboptimal user experience.
- **Solution**: Maintained database soft delete invariants (`is_active = false`) for auditability, but completely filtered them out on the client side (`entries.filter(...)`) and standard API retrievals. This achieves the visual responsiveness of immediate deletion while respecting database history.

### 4. Next.js Route Type Generation Can Lag Behind New App Routes
- **Problem**: Adding a new App Router API route can leave `tsc --noEmit` in a broken state with transient `.next/types` validator errors until Next regenerates route types.
- **Solution**: Run `next typegen` before plain TypeScript checks. The repo script now uses `next typegen && tsc --noEmit`.
- **Lesson**: When new App Router pages or API routes are added, do not trust a raw `tsc` failure against `.next/types` until route types have been regenerated.

### 5. Water-Bearing Beverages Must Count In Two Places
- **Problem**: Drinks like barley tea can carry both calories and liquid volume. Treating them as only `food` or only `water` makes the daily screen inconsistent.
- **Solution**: Keep calorie-bearing beverages classified as `food` when appropriate, but still include `waterMl` and surface them in both the Food and Water breakdown sections.
- **Lesson**: Summary totals and breakdown sections must derive from the same normalized items, with water contribution determined by `waterMl`, not by item kind alone.

### 6. Baseline Activity Must Stay Separate From Logged Exercise
- **Problem**: Treating "physical activity" as a leftover after subtracting BMR and TEF from baseline TDEE makes the model hard to understand and can blur the line between default daily movement and explicitly logged exercise.
- **Solution**: Use a conservative `baselineLifestyleMultiplier` instead of standard broad TDEE activity multipliers, define `baselineActivity = baseTdee - BMR`, calculate `TEF` dynamically from macros, map explicit exercise into `EAT`, and compute `TDEE = baseTdee + TEF + EAT`.
- **Lesson**: Baseline lifestyle represents ordinary non-exercise living only, not workouts and not assumed average exercise. Explicit exercise belongs in `EAT` and must never be implicitly folded back into the lifestyle component.

### 7. Intake And Output Need Different Presentation Logic
- **Problem**: Reusing the same card-heavy visual treatment for both intake and output wastes vertical space on mobile and blurs the conceptual difference between intake nutrients and TDEE components.
- **Solution**: Keep the daily dashboard compact and operational. Intake should read as one grouped story about food and drinks. Output should read as one TDEE breakdown, with explanatory details available behind tap-friendly info affordances.
- **Lesson**: On this app, mobile density and clarity beat decorative symmetry. Prefer list rows, fewer nested surfaces, and dialogs for deeper explanation.
