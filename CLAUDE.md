# CLAUDE.md: Ajali Kit

You are building Ajali Kit, a mobile web app (PWA) that helps Kenyan motorists build a motor insurance claim pack after an accident, using Meta's Muse Spark 1.3 and SAM 3.1. This is a hackathon entry. Submission is due Wed Nov 4, 9 PM ET (Thu Nov 5, 5 AM EAT). Our internal deadline is Wed Nov 4, 10 PM EAT, and code freezes Wed Nov 4 at 12:00 EAT.

## How to use the docs

1. **SPEC.md is the source of truth** for what to build: flows (section 5), screens (6), data model (7), AI pipeline and prompts (8), stack (9), API notes (10), privacy (11), acceptance criteria (13), and the build order (14).
2. **PLAN.md** is the schedule, scope (MVP versus stretch), the cut list and the risks. If you are behind the PLAN.md checkpoints, cut features in the PLAN.md section 5 order. Never cut the damage AI step, the PDF, mock mode, or anything the demo needs.
3. If SPEC.md and the Meta docs disagree, the Meta docs at https://dev.meta.ai/docs win. Note the difference in `PROGRESS.md`.
4. Anything marked "Unverified" in SPEC.md must be checked against the docs or a real call before you rely on it.

## Build order

Follow SPEC.md section 14, phase by phase: 0 Scaffold, 1 Data and shell, 2 Scene capture, 3 Damage AI, 4 Other party / police / witnesses, 5 Claim draft, 6 PDF and share, 7 Polish and ship, 8 Stretch (only after Ian says the demo is recorded).

For each task:
- Plan briefly, build, then run `npm run lint`, `npm test` and `npm run build`.
- Check the matching acceptance criteria in SPEC.md section 13.
- Commit locally with a clear message (`feat(damage): SAM box prompts`).
- Add one line to `PROGRESS.md`: task id, what changed, what is left, any cost or API notes.
- Stop at the end of each phase and summarise for Ian.

Opus plans and reviews; Sonnet does the task work. Prefer small, typed, tested modules.

## Rules

- **No secrets in code.** The Meta key lives only in `MODEL_API_KEY` in `.env.local` (local) or Vercel env vars (deployed). Never prefix it with `NEXT_PUBLIC_`. Never log it. Never write it to any file other than `.env.local`. `.env.local` must be in `.gitignore`. Commit only `.env.example` with empty values.
- **All model calls go through server route handlers** (`src/app/api/*`). The browser never calls api.meta.ai directly.
- **Mock mode first.** Every AI route returns a fixture when `AJALI_MOCK=1` or the `x-ajali-mock: 1` header is set. Build and test the UI in mock mode to save credits. Only the smoke scripts and the final checks use real calls.
- **Standard mode models only** (`muse-spark-1.3`, `sam-3.1`). Never use `-contributor` models: user photos and documents are personal data.
- **Model IDs and base URL come from env vars** (`MUSE_MODEL`, `SAM_MODEL`, `META_BASE_URL`) with the defaults in SPEC.md section 10.5.
- **Do not log personal data or image bytes.** Log model, latency, token usage and error codes only.
- **No git push, no deploys, no package publishing.** Ian pushes and deploys himself.
- **Do not sign up for services, add paid services, or enable paid add-ons** (including Vercel Observability Plus).
- **No repair cost estimates and no fault decisions** anywhere in the app or prompts.
- **No insurer names or logos** in the UI or sample data. Use "your insurer".
- **Writing style for all UI copy, README and docs:** plain, short English. Do not use em dashes anywhere. Use commas, colons or full stops instead.
- **Demo data:** no real personal data in the repo. Put real test photos in `demo-assets/` and keep that folder in `.gitignore`.
- When stuck for more than 30 minutes on one problem, stop, write what you tried in `PROGRESS.md`, and propose a simpler path from PLAN.md section 5.

## Useful commands

```bash
npm run dev            # local dev (open on the phone via the LAN address)
npm run build          # production build check
npm test               # vitest
npx tsx scripts/smoke-muse.ts demo-assets/dent1.jpg   # real Muse Spark call (costs a little)
npx tsx scripts/smoke-sam.ts demo-assets/dent1.jpg car # real SAM 3.1 call (costs a little)
```

Node version: 22.x (the SAM parser needs Node ^20.17.0 or >=22.9.0).
