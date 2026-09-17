# Field Command — Handoff v25

**Date:** 2026-09-16
**Branch:** `feat/ident6-field-assignment-identity` (do not merge until Chris approves)
**Session goal:** IDENT-6 — Field Home prefers canonical assignment identity. No EAS. No production writes. No PowerSync dashboard deploy.

---

## SESSION SUMMARY

Home now matches the logged-in `team_members.id` to `assignments.team_member_id` first. The HOME1 `namesMatch` path remains only for legacy rows where that UUID is null/blank. A non-null UUID for someone else never falls back to name.

IDENT-5 is live and currently stamps **0** historical rows. New Schedule writes for linked crew (IDENT-4) will start carrying UUIDs. Chris still has no `crew` row and no assignments — expected Home remains **0 jobs**. View All is unchanged.

PowerSync client schema + committed YAML add `assignments.team_member_id`. Publication membership is untouched. **Dashboard deploy is pending Chris approval** (additive SELECT only).

TF2 writes remain paused. No TestFlight binary in this slice.

---

## HOME RULE

1. If `assignments.team_member_id` is a non-blank UUID: visible iff it equals `user.id`. Never name-match.
2. If it is null / blank / `'null'`: visible iff `namesMatch(team_members.name, assignments.crew_name)` (Schedule `flipName`).
3. Week/date scope, this-user open-punch continuity, and View All are unchanged.

---

## POWERSYNC

Current dashboard assignments SELECT (IDENT-6 not deployed yet):

```
SELECT id, job_id, crew_name, date, mobilization_id FROM assignments
```

Requested additive change (YAML already committed; do not apply until Chris says go):

```
SELECT id, job_id, crew_name, date, mobilization_id, team_member_id FROM assignments
```

No other rule lines. No publication change. No instance reset.

Until that deploy, phones keep seeing `team_member_id` as blank and use the legacy name path — Chris still 0 jobs.

---

## VERIFICATION

- `node scripts/verify-home-visibility.cjs` — all checks passed (UUID vs name, other-user UUID, blank/null legacy, week scope, own open punch, View All SQL unfiltered, schema/YAML).
- `npx expo-doctor` — 18/18.
- Production not written. No assignment created to populate Home.
- iOS simulator not re-run this slice (Android out of scope; prod has 0 UUID rows so a sim would not prove canonical matching).

---

## BACKLOG

- **IDENT-6** — In Progress (this PR). Dashboard deploy still pending.
- **HOME1** — Closed (name-only Home; now the legacy fallback).
- **TF2** — Still open, still paused.
- **FE1 / B2 / FE3** unchanged.

---

## NEXT SESSION

1. Merge this PR after Chris approves.
2. Deploy the PowerSync dashboard assignments SELECT adding `team_member_id` — only after Chris approves that deploy.
3. Do not bulk-link the remaining 27 crew. Do not auto-link Chris.
4. TF2 stays paused until a later TestFlight binary Chris asks for.

Expo Go is not a valid runtime.
