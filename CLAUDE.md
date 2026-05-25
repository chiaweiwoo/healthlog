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
- TDEE uses a component model: `BMR`, conservative `baseline activity`, `TEF`, and `logged exercise` are separate, and `TDEE = baseTdee + TEF + loggedExercise`.
- Baseline activity means non-exercise lifestyle only, not traditional PAL/TDEE activity assumptions.
- Treat intake as one story: food, calorie-bearing drinks, and water belong together in daily intake summaries.
- Parse LLM JSON defensively and validate with Zod.
- Mutating and auth-related API routes should write request traces to `app_request_logs`.
- Never log passwords, API keys, service role keys, or session secrets.
- Keep service role, Gemini, Langfuse secret, password hash, and session secret
  server-side only.
- Keep important mobile interactions tap-friendly and prefer dense list summaries over decorative card grids.

## Commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
