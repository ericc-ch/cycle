---
name: verify-sync-formal
description: "Formally verifies Cycle's multi-device E2EE sync protocol (LWW snapshot merge, optimistic-locking 409 conflict retries, and concurrent local edits) using a TLA+ model. Use whenever changing syncVault, snapshot merge logic, the /api/sync Worker handler, or client sync orchestration."
---

# Verify Cycle sync protocol (formal)

This skill checks three promises of Cycle's multi-device sync protocol across every interleaving of two devices, two dates, and up to three concurrent edits:

1. **`NoConflictError`**: A `409 Conflict` between devices always resolves automatically without surfacing `SyncConflictError` to the user.
2. **`ServerNeverRegresses`**: Once the server accepts an edit on a day, no later `PUT` from another device ever overwrites or loses it.
3. **`NoLostEditsOnConvergence`**: Once edits stop and every device finishes syncing, every device and the server hold the exact per-day last-write-wins merge of all saved edits.
4. **`ServerSound`**: The server never stores an entry that does not come from a saved local edit.

## Coverage record

- **Last confirmed commit**: `ecd2bd9cd2eb4b608ca2bc63d64589c2d3c52e06`
- **Covered files and functions**:
  - `packages/sync/src/snapshot.ts` — `pickEntry`, `mergeSnapshots`, `applyLogsDiff`, `nextTimestamp`, `sameSnapshot`
  - `packages/sync/src/client.ts` — `syncVault`, `putOnce` (`GET` -> merge -> `PUT` with `expectedVersion` -> `409` retry)
  - `apps/api/src/worker.ts` — `handleSyncRequest` (`GET /api/sync`, atomic `INSERT`/`UPDATE` on `expectedVersion`, `409` returning latest `{ version, ciphertext }`)
  - `apps/web/src/state.ts` — `reducer` (`SavedEditing`, `SyncStarted`, `SyncSucceeded`, `SyncFailed`)
  - `apps/web/src/app.tsx` — `triggerSync` (`syncingRef`, `pendingRef`, `vaultRef`)

Before trusting a pass, check whether any covered file changed since the sync commit:

```sh
git log --oneline ecd2bd9cd2eb4b608ca2bc63d64589c2d3c52e06..HEAD -- \
  packages/sync/src/snapshot.ts \
  packages/sync/src/client.ts \
  apps/api/src/worker.ts \
  apps/web/src/state.ts \
  apps/web/src/app.tsx
```

If any of those files changed, confirm that `spec/SyncProtocol.tla` and `spec/SyncProtocol.cfg` still match the code's indivisible steps and retry bound before interpreting the result.

## Model-to-code mapping

| TLA+ symbol (`spec/SyncProtocol.tla`) | Code |
| --- | --- |
| `PickEntry`, `Merge` | `pickEntry`, `mergeSnapshots` in `packages/sync/src/snapshot.ts` |
| `LocalEdit` | `SavedEditing` (`apps/web/src/state.ts`) + `applyLogsDiff` / `nextTimestamp` (`packages/sync/src/snapshot.ts`) + `pendingRef` (`apps/web/src/app.tsx`) |
| `StartSyncGet` | `GET /api/sync` + initial `mergeSnapshots` + early return when `sameSnapshot(merged, remote)` (`packages/sync/src/client.ts`) |
| `SyncPutSuccess` | `PUT /api/sync` matching `expectedVersion` (`apps/api/src/worker.ts`) + `SyncSucceeded` (`apps/web/src/state.ts`) |
| `SyncPutConflict` | `PUT /api/sync` returning `409` (`apps/api/src/worker.ts`) + decrypt/re-merge/retry loop (`packages/sync/src/client.ts`) + silent background retry (`apps/web/src/app.tsx`) |
| `MaxRetries` (`spec/SyncProtocol.cfg`) | Number of inner `409` retries inside one `syncVault` call (`DEFAULT_MAX_CONFLICT_RETRIES = 5`), after which `app.tsx` schedules a silent background retry (`retry_wait`) |

## How to run

Use the `statechart` skill on:
- Spec: `.agents/skills/verify-sync-formal/spec/SyncProtocol.tla`
- Config: `.agents/skills/verify-sync-formal/spec/SyncProtocol.cfg`
- View: `.agents/skills/verify-sync-formal/spec/view.mjs`

Write outputs to a scratch folder outside the repo (for example `/tmp/verify-sync-formal-out`). Read every result through the `statechart` skill: it reports the shortest counterexample path in plain words for each broken rule, or draws the statechart when all rules hold.

## Telling a real bug from a modeling error

1. Walk each step of the counterexample against the mapped functions above.
2. Replay the exact sequence against the real code (for example, in `packages/sync/src/sync.test.ts` with a fake `fetchFn`, or in `apps/web/src/app.test.tsx`).
3. If the real code reproduces the failure, it is a **real bug** — fix the code, not the invariant.
4. If a step in the trace cannot happen in the real code (for example, a guard exists in code that the model omitted), fix `spec/SyncProtocol.tla` to match the real code and re-run.

## Updating the verification

When you intentionally change the sync protocol (for example, looping `409` retries in `syncVault`, adding background retry, or changing conflict semantics):

1. Update `spec/SyncProtocol.tla`, `spec/SyncProtocol.cfg`, and the mapping table above to match the new code.
2. Re-run with the `statechart` skill and confirm every invariant holds.
3. Introduce a temporary scratch break (such as removing the `expectedVer[d] = serverVer` guard or lowering `MaxRetries`), confirm the check catches it, and revert the scratch break.
4. Only after confirming the model describes the committed code, update **Last confirmed commit** above.

## Scope and assumptions

- **Checked**: 2 devices, 2 dates, 2 flow states (`None`, `Bleeding`), up to 3 total local edits, monotonic clock (`clock + 1` and `MaxTs + 1`).
- **Not checked**: Cryptographic primitives (PBKDF2/HKDF/AES-GCM), network timeouts/offline retries outside `409`, multi-account switching during an in-flight sync, or arbitrary clock skew between devices.
