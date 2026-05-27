# Prompt Optimization Plan — Execution Brief for Sonnet

> **Instructions for Sonnet:** Execute the three commits below in order. Each commit is pushed on its own. Run `npm run typecheck && npm test` after each commit (don't skip). After commit 3 ship the full `lint && test && build`, then push, then `gh run list --limit 1`. Per CLAUDE.md: always commit + push, check CI. Use TaskCreate to track these.
>
> **Do not check Vercel.** Local build + GitHub CI is enough.
>
> **Do not run any SQL.** No DB changes in this plan.
>
> **After done, delete this `PROMPT_OPTIMIZATION_PLAN.md` file as part of commit 3** (or in a tiny follow-up commit) so it doesn't linger.

---

## Background

We are doing three things in three separate commits:

1. **Make daily calls truly independent** — remove the `activeEntries` payload entirely, simplify `actionType` enum to `"create" | "clarify"` only. Edits/deletes already go through dedicated UI buttons (Pencil = PATCH with new text, Trash = DELETE by ID). The LLM never needed to know about existing entries.
2. **Slim both prompts** — compress personalization, reasoning, adminAlert blocks; cut body example JSONs from 5 to 2.
3. **Global localization** — replace hardcoded `"Singapore"` in prompts with a single `DEFAULT_COUNTRY` constant; add `city` to profile schema; let conversational body notes write country/city to profile fields.

Expected token savings:
- Daily prompt: ~50-60% reduction
- Body prompt: ~38% reduction
- Real benefit: lower latency, cleaner architecture, cleaner `llm_runs` data for `prompt-insights`.

---

## Commit 1 — Independent daily calls

**Files:**

### `src/lib/llm.ts`

- Change the `parseDailyNote` signature: **remove the `activeEntries` parameter entirely.**
- Remove the entire `Current active entries: ${JSON.stringify(...)}` block from the prompt body.
- The remaining prompt should reference only `Selected date`, `Profile`, `New note`.

### `src/lib/schemas.ts`

- Change `actionType` enum in `parsedDailyItemSchema`-context (the dailyParseResultSchema):
  ```ts
  actionType: z.enum(["create", "clarify"]).default("create"),
  ```
  (drop `"edit"` and `"delete"`)

### `src/lib/llm-normalizers.ts`

- Update `normalizeActionType`:
  ```ts
  function normalizeActionType(value: unknown) {
    if (typeof value !== "string") return "create";
    const normalized = value.toLowerCase().trim();
    if (["create", "clarify"].includes(normalized)) return normalized;
    // Map removed values gracefully so old data still loads
    if (["edit", "update", "updated", "change", "changed", "delete", "remove", "removed"].includes(normalized)) return "create";
    if (["eat", "drink", "exercise", "log", "record", "add"].includes(normalized)) return "create";
    return "create";
  }
  ```

### `src/app/api/daily-entries/route.ts`

- Locate both call sites for `parseDailyNote` (POST and PATCH).
- Remove the `activeEntries` argument from both calls.
- Remove the `listDailyEntries(date)` fetch from POST (currently at the same `Promise.all` as `getProfile()`). Profile-only fetch.
- In PATCH, remove the equivalent `listDailyEntries` fetch if it exists only to feed the LLM. **DO NOT remove** any `listDailyEntries` call that the route still needs for its own response or recalculation logic — read carefully.

### Tests

- Search for any test that constructs `actionType: "edit"` or `actionType: "delete"` and update them to `"create"`.
- Search for any test fixture that passes `activeEntries` into `parseDailyNote` and remove that argument.
- Specifically check `src/test/daily-entries-route.test.ts` and `src/test/llm-runs.test.ts` (these contain references — grep first).

**Verify before commit:**
```
npm run typecheck
npm test
```

**Commit message:**
```
refactor(llm): make daily parsing stateless, drop activeEntries payload

- Daily calls are independent: each parse only sees the new note + profile.
- Edits and deletes already flow through dedicated UI buttons (Pencil PATCH,
  Trash DELETE) — the LLM never needed to know existing entries.
- Drop "edit" and "delete" from actionType enum; normalizer maps legacy
  values to "create" so existing rows still load.
- Removes ~300-2000 tokens per call depending on day's log density.
```

Push.

---

## Commit 2 — Prompt slimming

**Files:** `src/lib/llm.ts` only.

### `parseDailyNote` prompt

Replace the verbose **personalization block** with this compressed version:

```
Personalization (use profile, not just defaults):
- Use profile.weightKg, sex, age for any kcal estimate, especially exercise.
- Read profile.metadata items as context cues (gym beginner -> lower MET; injury -> reduced load; vegetarian/halal -> bias food interpretation; medication/condition -> flag relevant items).
- Default intensity = conservative-low when no signal.
- profile.goal may inform portion-size assumptions when quantity is missing.
```

Replace the verbose **reasoning capture block** with:

```
Reasoning (always populate, never user-visible):
- reasoning.assumptions: non-obvious choices, e.g. "assumed 1 cup portion", "applied conservative-low intensity".
- reasoning.profileSignalsUsed: profile fields you consulted, e.g. ["weightKg", "metadata.gym-beginner"].
- reasoning.unresolvedAmbiguities: things you proceeded on without certainty.
```

Replace the verbose **admin alert block** with:

```
adminAlert (loose guardrail — null in almost all cases):
- Set only when something genuinely warrants admin review: harmful intent, adversarial input, model refusal ("critical"); schema near collapse or repeated noise ("warn").
- Low confidence is NOT a reason to set this.
- code: short snake_case slug. message: admin wording, not user-facing.
```

Compress the **self-check** to essentials. Replace with:

```
Before finalizing, self-check that:
- enum values are valid (actionType, item kind)
- identifiable food has calories populated (not null); macros may be null
- exercise has exerciseCalories populated (never null)
- beverages with volume include waterMl
- items array <= 20
- reasoning fields are populated (empty arrays are fine)
- adminAlert is null unless genuinely anomalous
```

### `parseBodyNote` prompt

Apply the same three compressions (personalization, reasoning, adminAlert blocks — adapt phrasing for body context).

**Cut the example JSONs from 5 to 2.** Keep:
- The first big example (`update` with profile + work-style memory item)
- The clarify example (`daily_log_wrong_place`)

Delete: medication, injury, override-only, unrelated-note examples. The schema and inline rules already cover these patterns.

**Verify before commit:**
```
npm run typecheck
npm test
```

**Commit message:**
```
perf(llm): slim daily and body prompts (~40-55% smaller)

Compresses personalization, reasoning, and adminAlert blocks; tightens
self-check; cuts body example JSONs from 5 to 2. Schema and inline rules
already cover the omitted examples.
```

Push.

---

## Commit 3 — Global localization

**Files:**

### New: `src/lib/config.ts`

```ts
export const DEFAULT_COUNTRY = "Singapore";
```

That's the entire file. Single source of truth for the hardcoded default. If you later want to change to another country or make this dynamic per-deployment, you change one line.

### `src/lib/schemas.ts`

Add `city` to `profileSchema`:

```ts
export const profileSchema = z.object({
  age: z.number().int().positive().nullable().optional(),
  sex: z.enum(["female", "male"]).nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
  weightKg: z.number().positive().nullable().optional(),
  activityLevel: activityLevelSchema.nullable().optional(),
  goal: z.string().nullable().optional(),
  country: z.string().default("Singapore"),    // keep existing
  city: z.string().nullable().optional(),       // NEW
  remarks: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
```

### `src/lib/llm.ts`

Import:
```ts
import { DEFAULT_COUNTRY } from "@/lib/config";
```

In `parseDailyNote`, replace the hardcoded line:
```
Use Singapore food context by default unless the note clearly says otherwise.
```
with:
```
Use ${(input.profile?.country ?? DEFAULT_COUNTRY)}${input.profile?.city ? "/" + input.profile.city : ""} food context by default unless the note clearly says otherwise.
```

In `parseBodyNote`, find any hardcoded Singapore references and apply the same pattern using `input.currentProfile`.

Also update the `parseBodyNote` prompt to instruct the model: when a note mentions location ("I'm in Tokyo", "based in Singapore", "moved to KL"), write to `profile.country` and `profile.city` — NOT to metadata memory. Add 2-3 lines under the existing profile-field guidance. Example:

```
Location facts (country, city) belong on profile.country and profile.city,
NOT in metadataUpserts. Examples: "I'm based in Singapore" -> profile.country = "Singapore".
"Just moved to Tokyo" -> profile.country = "Japan", profile.city = "Tokyo".
```

### `src/lib/llm-normalizers.ts`

Update `buildSparseProfilePatch` to handle `city`:

```ts
if (hasOwn(profile, "city") && typeof profile.city === "string" && profile.city.trim()) {
  patch.city = profile.city.trim();
}
```

Add this alongside the existing `country` handling block.

### Tests

- If any test references `profile.country = "Singapore"` as a hardcoded string, leave it as-is (still valid).
- If any test fixture passes a `profile` object to `parseDailyNote` or `parseBodyNote`, make sure adding `city` is optional (it is, via `.optional()`).

**Delete `PROMPT_OPTIMIZATION_PLAN.md`** as part of this commit (or do it as a separate tiny commit if you prefer — your call).

**Verify before commit:**
```
npm run typecheck
npm run lint
npm test
npm run build
```

**Commit message:**
```
feat(llm): dynamic country/city via DEFAULT_COUNTRY constant + profile

- Centralize hardcoded "Singapore" in src/lib/config.ts (single source of truth)
- Add optional city field to profileSchema
- Both prompts use profile.country / profile.city dynamically, falling back
  to DEFAULT_COUNTRY when unset
- parseBodyNote learns to extract location facts into profile fields, not
  metadata memory
```

Push.

---

## After all three commits

- `gh run list --limit 1` — wait for green CI.
- If CI fails, fix in a new commit (don't amend).
- Report summary: 3 commits pushed, CI status, file count changed, estimated tokens saved.

## What you must NOT do

- Don't change DB schema or run SQL in commits 1-3.
- Don't add Google Search grounding (out of scope — wait for `prompt-insights` to surface need).
- Don't amend commits. New commits for any fix.
- Don't introduce a Profile UI for country/city — must stay conversational per the AGENTS.md invariant.
- Don't bump `PROMPT_VERSION` again — the current `2026-05-28-personalize-v1` covers these slimming edits since the schema contract for downstream consumers is unchanged (we're only removing prompt verbosity and tightening the actionType enum to a subset). The normalizer maps legacy enum values to `"create"` so old llm_runs rows still load.

---

## Commit 4 — Rename `body` → `profile` (follow-up after commits 1-3 land green)

> Only proceed if commits 1-3 are green on CI. This is a mechanical naming cleanup — `body_notes` was always semantically about profile context (lifestyle, medication, injuries, preferences), not the human body. The data already flows into the profile, the test files are named `profile-*.test.ts`, and the reset script is `reset-profile-data.mjs`. The current naming is mixed and confusing.
>
> **Important distinction:** `body_measurements` (a separate table for weight/height/body-fat events) stays as `body_measurements`. The word "body" is legitimate for physical measurements. We are renaming only the `body_notes` profile-context concept.

### SQL migration (user runs in Supabase SQL editor)

```sql
ALTER TABLE healthlog.body_notes RENAME TO profile_notes;
```

Add a mirror migration file `supabase/migrations/20260528100000_rename_body_notes_to_profile_notes.sql` with the same statement (do NOT apply it; it's just for repo/live parity, matching how the prompt-insights migrations were handled).

### Code rename — find-replace across the repo

**Symbols:**
- `parseBodyNote` → `parseProfileNote`
- `bodyParseResultSchema` → `profileNoteParseResultSchema`
- `normalizeBodyResult` → `normalizeProfileNoteResult`
- `BodyParseResult` (type) → `ProfileNoteParseResult`
- `bodyNoteRow` (test fixtures) → `profileNoteRow`
- Variable names like `bodyNote`, `bodyNotes` → `profileNote`, `profileNotes`
- `body-notes` (URL slug) → `profile-notes`

**Table reference in `src/lib/db.ts`:**
- `supabase.from("body_notes")` → `supabase.from("profile_notes")` everywhere

**Do NOT rename:**
- `bodyMeasurementSchema` — measurements (weight, body fat) are legitimately about the body
- `body_measurements` table — same
- The `BodyMeasurement` type — same
- Anything related to the `body_measurements` table

### File moves / renames

- `src/app/api/body-notes/route.ts` → `src/app/api/profile-notes/route.ts` (use `git mv`)
- `src/test/body-notes-route.test.ts` → `src/test/profile-notes-route.test.ts`
- `src/app/app/body/page.tsx` — **READ the file first to decide**. Two options:
  - **(a)** If it's a separate conversational page that the Profile FAB navigates to: rename folder to `src/app/app/profile-notes/page.tsx` and update any `Link`/`useRouter` references.
  - **(b)** If it duplicates functionality now living in `src/app/app/profile/page.tsx` (the indigo MessageCircle FAB chat): delete the folder, update any router references.
  - Default to (a) if unclear — never delete pages without verification.

### Test fixtures

- `src/test/profile-incremental-patch.test.ts` already uses `profile` naming but references `parseBodyNote` etc internally. Update those references.
- `src/test/body-notes-route.test.ts` — rename file, update imports.
- Any inline string literals like `"body_notes"` in tests should become `"profile_notes"`.

### Docs

- `AGENTS.md` — update the Supabase Tables row (`body_notes` → `profile_notes`). Re-read full file for any inline references and fix in same edit (CLAUDE.md invariant: every doc update needs a conflict pass).
- `CLAUDE.md` — same conflict pass.
- `README.md` — same.
- `gemini_reviews.md` — same.

### Scripts

- `scripts/reset-profile-data.mjs` — already named with `profile` prefix; update internal `body_notes` table references to `profile_notes`.

### Verify before commit

```
npm run typecheck
npm run lint
npm test
npm run build
```

### Commit message

```
refactor: rename body_notes -> profile_notes (semantic cleanup)

body_notes was always about profile context (lifestyle, medication, injuries,
preferences), not the human body. The reset script, test files, and data flow
already used the "profile" naming — this aligns the rest of the code.

body_measurements (a separate table for weight/height/body-fat events) is
NOT renamed; "body" remains correct for physical measurements.

- Renames body_notes table, /api/body-notes route, parseBodyNote function,
  bodyParseResultSchema, normalizeBodyResult, /app/body page
- Keeps body_measurements and bodyMeasurementSchema unchanged
- Adds mirror migration file for repo/live parity (SQL applied separately
  by the user)
```

### After commit 4

- Push.
- `gh run list --limit 1` — wait for green.
- **User must run** `ALTER TABLE healthlog.body_notes RENAME TO profile_notes;` in Supabase SQL editor BEFORE the deployed code starts hitting the new table name. Hand the user the exact SQL in the final summary and ask them to confirm before considering the work done.

### What you must NOT do in commit 4

- Don't rename `body_measurements` or anything with "measurement" in the name.
- Don't delete `src/app/app/body/page.tsx` without reading it first to confirm it's redundant.
- Don't run the SQL migration yourself — hand it to the user.
