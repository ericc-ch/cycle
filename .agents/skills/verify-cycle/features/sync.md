# End-to-end encrypted sync

## Status

deterministic

## Sub-features

- Sync is optional and off by default.
- Device A logs a day, turns on sync with username + passphrase, and pushes ciphertext to `/api/sync`. The plaintext passphrase is never stored in `localStorage`.
- Device B (a separate browser profile) with the same username and wrong passphrase gets `Wrong username or passphrase.` (401) and does not create a second vault.
- Device B with the right passphrase pulls Device A's logged day onto its calendar.
- Device B logs a second day (`Spotting`), saves, and Device A pulls it via `Sync now`.
- Turning off sync clears `cycle.sync` credentials while keeping local logs intact.

## Driving it with the CDP harness

```sh
.agents/skills/verify-cycle/scripts/serve.sh
node .agents/skills/verify-cycle/scripts/drive.mjs sync
```

Spins up `scripts/api-server.ts` on `127.0.0.1:8787` (running the real `apps/api/src/worker.ts` over in-memory SQLite with `apps/api/migrations/0001_vaults.sql`) and launches two separate Chrome profiles (`9333` and `9334`).
