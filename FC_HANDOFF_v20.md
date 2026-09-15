# Field Command — Handoff v20

**Date:** 2026-09-15
**Branch:** `docs/apple-team-paid-7T26H9PCGN` (docs only; do not merge until Chris approves)
**Session goal:** Correct the record that team `7T26H9PCGN` is a free Personal Team. No EAS build. No submit.

---

## SESSION SUMMARY

Chris opened [developer.apple.com/account](https://developer.apple.com/account) and confirmed active **Apple Developer Program** membership:

- Enrollment: Individual
- Team ID: **7T26H9PCGN**
- Annual fee: US$99
- Renewal: 10 April 2027
- Status: active

v19 / REL1 / TF1 had treated `7T26H9PCGN` as a free Personal Team that cannot ship TestFlight. That was wrong. It is the paid team and **is** the TestFlight / EAS store-distribution team.

EAS `production` profile was not changed. `appleTeamId` was not added to `eas.json`; the first `eas build` will prompt Chris to pick this team. No certificates or profiles were created or revoked.

---

## WHAT CHANGED

Docs only: `FC_HANDOFF_v19.md`, `FC_HANDOFF_v12.md` (correction banner), `FC_HANDOFF_v15.md` (one backlog line), `docs/BACKLOG.md` (TF1 unblocked, REL1 wording).

---

## NEXT SESSION

When Chris asks, from `main` after this PR is merged:

```bash
npx eas-cli build --platform ios --profile production
```

Let EAS manage credentials. Choose team **7T26H9PCGN**. Do not submit until that binary is reviewed. Expo Go is not a valid runtime.

Test job still **10176 / 1284 / call_log 3712**.
