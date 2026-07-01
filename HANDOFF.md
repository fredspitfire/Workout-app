# Training Coach — Handoff

A personal, single-user AI training coach that replicates **JEFIT Adaptive** (so the
owner can drop the subscription) and adds what JEFIT can't: planning around a real
hockey-game calendar and recovering gracefully from missed workouts.

- **Owner/only user:** trains at home (full gym: barbell, dumbbells, rack, cables,
  machines), plays hockey on fixed days (Tue/Thu) + occasional dated games.
- **Repo:** https://github.com/fredspitfire/Workout-app (branch `main`)
- **Full product plan:** `C:\Users\fred_\.claude\plans\that-s-a-good-point-melodic-hinton.md`

---

## Core idea

- **A deterministic engine owns every number** (weights, reps, sets, rest,
  progression, deloads) — reproducible and testable.
- **Claude (AI) only does fuzzy work**: picks *which* exercise fills each slot, and
  applies natural-language tweaks. It never computes loads. If the AI is
  unavailable, everything falls back to a deterministic pick.

---

## Tech stack

| Piece | Choice |
|---|---|
| App | SvelteKit (Svelte 5 runes) + `@sveltejs/adapter-node` |
| DB | SQLite via `@libsql/client` + Drizzle ORM (single file `data/coach.db`) |
| AI | `@anthropic-ai/sdk`, model `claude-sonnet-4-6` |
| Frontend | PWA (installable, dark mobile-first), server-rendered |
| Deploy target | Docker container on the owner's Home Assistant **mini PC** (not a Lovelace dashboard); phone uses the PWA icon |

Node 24, `npm`. Everything is TypeScript.

---

## How to run

```bash
npm install
npm run db:push        # create tables from the Drizzle schema
npm run db:seed        # equipment + 26-exercise seed library
npm run import:catalog # ~840 free-exercise-db exercises (public domain)
npm run import:jefit   # imports ./Jefit Data/*.csv (owner's history) — one-time
npm run dev -- --host  # dev server (loads .env)
```

Other scripts: `build`, `preview`, `check`, `db:studio`, `dedup:catalog`,
`db:backup` (one-off SQLite snapshot), and dev spikes (`explore`, `sanity`, `ramp`,
`backup-sanity`) under `spikes/`.

**Env** (`.env`, gitignored):
- `DATABASE_URL=file:./data/coach.db`
- `ANTHROPIC_API_KEY=sk-ant-...`  ⚠️ see Security below.

---

## Project structure

```
src/lib/engine/           # deterministic engine (pure, framework-agnostic)
  types.ts goals.ts progression.ts ramp.ts rest.ts mesocycle.ts index.ts
src/lib/import/jefitCsv.ts        # parser for JEFIT's multi-section CSV export
src/lib/server/db/                # schema.ts, index.ts, seed.ts, import-cli.ts,
                                  # import-catalog.ts, dedup-catalog.ts, exerciseName.ts
src/lib/server/plan/              # generatePlan.ts, splitTemplates.ts, schedule.ts, applyTweak.ts
src/lib/server/ai/                # selectExercises.ts, tweakPlan.ts
src/routes/                       # / (Today) , /setup, /workout, /history
Dockerfile, .dockerignore         # adapter-node build -> container
spikes/                           # dev-only diagnostics/harnesses (not shipped)
Jefit Data/                       # owner's CSV export (gitignored, personal)
```

---

## How it works (data flow)

1. **/setup** — goal, plan structure (full-body / upper-lower / PPL / auto),
   equipment, days/week, time budget, hockey weekdays. Saved to `profile` +
   `equipment` + `recurring_commitments`.
2. **Generate** (`generatePlan`) — creates a mesocycle `block` + `block_phases`
   (On-Ramp → Accumulation → Intensification → Deload), then `generateWeek` builds
   the current week: recovery-aware lift days (`schedule.ts`), split day templates
   (`splitTemplates.ts`), AI exercise selection (`selectExercises.ts`) from an
   equipment-matched candidate pool preferring the owner's real lifts, and
   deterministic prescriptions.
3. **/workout** — one exercise at a time (swipe/arrows), ramp-to-top-set logging,
   engine-prescribed rest timer, "Previous sessions" history, finish → persists
   `logged_sets`, marks session done, raises the working max, and **auto-advances
   the block** when the week is complete.
4. **advanceWeek** — banks completed sessions; if the phase target is met → next
   phase (weights climb via `PHASE_INTENSITY`); else → **extend the phase** a week.
5. **Adjust box** — free-text tweak → `applyTweak` → Claude returns validated
   swaps → engine recomputes the swapped weights.
6. **Games** — add dated games; `generateWeek` folds any game in the week into the
   recovery schedule (legs off the day before, upper nearer).

---

## Engine rules (must preserve — these came from the owner)

- **Prescribe weight + target rep range; the owner caps reps at the TOP of the
  range** (never exceeds). Signal = did you reach the top / did reps hold.
- **Ramp to a top set** for compounds (climb weight across sets while hitting the
  target; hold on a miss). Accessories = straight sets. (See `ramp.ts`.)
- **Double progression** + intra-session ease-down on a sub-range set.
- **Deload is the 4th phase of the mesocycle**, not a bolt-on. 3:1 default.
- **Missed workouts extend the phase**, they don't get skipped.
- **Rest is engine-managed**: longer for heavy/low-rep/compound & Intensification;
  shorter for accessories/Deload (`rest.ts`).
- **Scheduling is recovery- AND content-aware**: never lift the day before hockey/
  a game; spread lifts; legs farthest from hockey, upper nearer (`schedule.ts`).
- **AI never computes numbers.**

---

## Status

Done: project skeleton + PWA + Docker; data model + setup; JEFIT import
(13k+ sets); AI exercise selection + natural-language tweaks; recovery/content-aware
scheduling; rest timers; history page + in-exercise history; single-exercise swipe
logging; full exercise catalog (~1000, equipment-matched, deduped); week-to-week
progression + missed-workout phase extension + dated games; **nightly SQLite backups**;
**graceful error handling** (central `handleError`, themed error page, resilient actions).

**Remaining (Phase 8–9):**
- **Deploy** to the mini PC (Docker container or HA add-on). Needs on the box:
  `DATABASE_URL`, `ANTHROPIC_API_KEY`, and **`ORIGIN=https://<host>`** (adapter-node
  requires it or same-origin POSTs 403 — discovered during Phase 2).
- Pre-launch security/scalability audits (prompts in the plan doc §17).

---

## Security (IMPORTANT)

- The `ANTHROPIC_API_KEY` currently lives in `.env` (gitignored, never committed).
- **The key was exposed once in the build session's transcript** (the editor's file-
  change notification auto-surfaced `.env`). **Rotate it before launch**: revoke in
  the Anthropic console, create a new one, and store it as a **Windows user
  environment variable** (or on the deploy box) — NOT in a project file, because any
  saved project file gets surfaced to the assistant. Code reads it via SvelteKit
  `$env/dynamic/private`, so an OS env var works identically.
- Single-user app: no third-party auth/privacy/GDPR needed. Put a simple login behind
  the reverse proxy before exposing it to the internet.

---

## Backups (Phase 8)

- `src/lib/server/backup.ts` — `VACUUM INTO` produces a consistent single-file snapshot
  even mid-write. `startBackupScheduler` runs it nightly (default 3am local) and prunes
  to the newest N (default 14); it also takes a catch-up snapshot at boot if the last
  one is missing or >20h old (covers a box that was off overnight).
- Wired in at server boot via `src/hooks.server.ts`. Snapshots land in `data/backups/`
  (gitignored). Tune with `BACKUP_DIR`, `BACKUP_RETENTION`, `BACKUP_HOUR` (see `.env.example`).
- `npm run db:backup` takes a one-off snapshot now (good before risky changes, or from
  an external cron). Sanity harness: `spikes/backup-sanity.ts`.
- Only handles local `file:` databases; a remote libsql url disables the scheduler
  (logged) and errors the CLI. **Backups live on the same disk as the db — for real
  durability, also copy `data/backups/` off-box** (e.g. HA's backup add-on or a synced folder).

## Error handling (Phase 8)

- **`handleError`** in `src/hooks.server.ts` is the monitoring seam: every unexpected
  server error is logged with a short reference id + request context (`[error abc123]
  METHOD /path (status)`), and the client only ever gets a safe message + that id
  (never a stack trace).
- **`src/routes/+error.svelte`** — themed dark error page showing the status, a friendly
  message, and the reference code the user can quote.
- **Actions fail soft, not hard.** The mutating actions on `/` (generate, tweak, advance,
  addGame, removeGame) catch failures and return a `fail()` message rendered inline,
  instead of a raw 500.
- **`/workout` finish is the careful one:** the essential result (logged sets + session
  marked done) is written in a single `db.transaction` — so a mid-write failure can't
  half-save or let a retry double-log. The derived follow-ups (week advance, working-max
  bumps) run best-effort after and only log on failure, since the workout is already
  saved. The finish form uses `use:enhance`, so a failure keeps the in-progress sets on
  screen and shows the error rather than reloading them away.

## Known limitations / notes

- JEFIT-imported exercises are tagged `equipment=unknown`, `muscle=unknown`, so a few
  accessory lifts don't link to catalog history/weight by muscle. Owner's main lifts
  (matched to seed names) are fine. Future: backfill muscle/equipment for imported
  lifts.
- Only the **current week's** planned sessions exist at a time (advancing deletes the
  prior week's planned sessions; logged history is preserved in `logged_sets`).
- Week boundaries are approximate (dates computed from "today" at generate/advance).
- Offline logging is a nice-to-have, not implemented (owner has signal at home).
- Model id is set in `selectExercises.ts` and `tweakPlan.ts` (`claude-sonnet-4-6`);
  could be centralized / swapped to Haiku for lower cost.
