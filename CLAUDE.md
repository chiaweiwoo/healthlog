# HealthLog - AI Session Memory

Auto-loaded by Claude Code. Mirrors `AGENTS.md` so assistant sessions preserve
the same invariants.

**Scope:** HealthLog only (`chiaweiwoo/healthlog`). Do not edit, commit, or push
any other repository from this thread.

## Hard Invariants

- Store raw daily/body notes before deriving structured state.
- Gemini never directly mutates Supabase.
- Do not require a user-provided Gemini model name; route models in code.
- Use JSONB for evolving structures and scalar columns for stable query fields.
- Keep low-confidence items visible with warnings.
- TDEE must return incomplete warnings instead of fake precision.
- TDEE uses a component model: `BMR`, conservative `baseline activity`, `TEF`, and `EAT` are separate, and `TDEE = baseTdee + TEF + EAT`.
- Baseline activity means non-exercise lifestyle only, not traditional PAL/TDEE activity assumptions.
- Treat intake as one story: food, calorie-bearing drinks, and water belong together in daily intake summaries.
- Parse LLM JSON defensively and validate with Zod.
- Mutating and auth-related API routes should write request traces to `app_request_logs`.
- Never log passwords, API keys, service role keys, or session secrets.
- Keep service role, Gemini, Langfuse secret, password hash, and session secret server-side only.
- The session authentication cookie must strictly use `sameSite: "strict"` to eliminate CSRF risks.
- Keep important mobile interactions tap-friendly and prefer dense list summaries over decorative card grids.
- Daily dashboard uses a single-column mobile-first layout (max-w-2xl, no grid): Calories → Water → Entries. New entries are added via a floating action button (FAB), not an inline form.
- All three dashboard sections use a shared `SectionHeader` (icon box + uppercase caption + title). Cards use `bg-stone-50/60`. Icon boxes have a subtle section tint: orange-50 for energy, sky-50 for hydration, stone-50 for entries.
- Progress bars use single semantic colors only. Sub-level breakdown bars are `bg-stone-300`. Water bar is always `bg-sky-500`. Energy intake bar is `bg-emerald-500` (deficit) or `bg-amber-400` (surplus). No decorative per-row color gradients.
- Nutrition item display uses `NutritionIcons` (Flame/Dumbbell/fat-SVG/Wheat/Wine/Droplets) — not pipe-separated text. Zero/null values hidden.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
