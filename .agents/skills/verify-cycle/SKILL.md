---
name: verify-cycle
description: Drive the cycle app in a real browser to verify user paths the unit tests cannot see (clicks landing on the right element, dialogs, tabs, overlays, persisted logs). Use when the UI "does not respond", before shipping a UI change, or when asked to verify the app end to end.
---

# Verify cycle

`cycle` is a Foldkit single-page app. `nub run test` covers update logic and view text with `foldkit/scene` in happy-dom, but it cannot see layout, stacking, or real event delivery. The failure that motivated this skill: closed `<dialog>` elements were rendered with `display: grid`, which overrode the UA `dialog:not([open]) { display: none }` and left two full-screen sheets swallowing every click. Every unit test passed.

Drive the app with headless Chrome over the DevTools Protocol. There is no Playwright dependency; `scripts/cdp.mjs` is a ~180 line client.

## Layout

```
.agents/skills/verify-cycle/
  scripts/serve.sh        start the dev server on an isolated port, write .audit/dev-server.pid
  scripts/stop.sh         stop that server by pid, never by name
  scripts/doctor.mjs      read-only health check, run this first
  scripts/drive.mjs       run one or all feature flows, write evidence
  scripts/cdp.mjs         CDP client used by doctor and drive
  features/               one file per user path, with status and promotion notes
```

All output goes to `.audit/` in the repo root (gitignored): `dev-server.log`, `dev-server.pid`, and `evidence/<run-id>/`.

## 1. Launch

Use a port nobody else is on. `5173` is the normal dev server; this skill defaults to `5273` so it never fights the one you are looking at.

```sh
.agents/skills/verify-cycle/scripts/serve.sh
```

Ready means the script printed `ready on http://127.0.0.1:5273/`. It waits for the HTTP root, not just the process. Logs: `.audit/dev-server.log`.

The app reads `today` from the clock at boot and its logs from `localStorage` under `cycle.logs`. Each drive run starts a fresh Chrome profile, so it starts with no logs and today's real date. Do not hard-code dates in a flow; find today's cell by its `data-today` attribute.

## 2. Doctor

```sh
node .agents/skills/verify-cycle/scripts/doctor.mjs
```

Read-only. It fails with reasons when:

- the server is unreachable or the page has no `<main>`
- a closed `dialog` is not `display: none` (the regression above)
- the center of a top-level control is covered by something else
- the page logged an exception

Run it after every CSS or component change. Its checks are also asserted inside `drive.mjs`.

## 3. Drive

```sh
node .agents/skills/verify-cycle/scripts/drive.mjs            # all flows
node .agents/skills/verify-cycle/scripts/drive.mjs clicks     # one flow
```

Flows live in `scripts/drive.mjs` and map to `features/*.md`:

| Flow       | What it proves                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `clicks`   | every visible control receives its own click; no overlay steals input                                           |
| `flow`     | pick a day, log flow, status changes, survives reload, clear it                                                 |
| `tabs`     | Today/History/About switch panels; the prediction switch reaches the status                                     |
| `overlays` | Data menu opens the explainer dialog and Escape closes it; legend popover and confidence tooltip open and close |

Each run prints a line per check and exits non-zero on the first failed flow. Screenshots and `report.json` land in `.audit/evidence/<run-id>/`.

Selectors are stable handles, not coordinates: `[data-slot="tabs-trigger"]`, `[data-slot="calendar-day"]` for day cells (the cell wrapper carries `data-today`), `[role="radio"]`, `[role="menuitem"]`, `[data-slot="dialog-content"]`, `[role="status"]`.

Hover and keyboard are real input events (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`), not `element.click()`, so pointer and Escape paths are exercised.

## 4. Evidence

Every check records what it saw. For a UI change, attach:

- `report.json` (flow, checks, pass/fail, durations)
- the `*.png` screenshot of the step that failed, or `final.png` on success
- `.audit/dev-server.log` if the page failed to render

A flow that passes because it asserted nothing is not evidence. Each check in `drive.mjs` names the DOM state it read.

## 5. Cleanup

```sh
.agents/skills/verify-cycle/scripts/stop.sh
```

It reads `.audit/dev-server.pid`, sends TERM to that process group, waits, and leaves `.audit/evidence/` untouched. Never `pkill vite`: another dev server may be running for the user.

If Chrome wedges, `drive.mjs` always closes its target in a `finally` block. Its profile lives in a per-run temp dir and is removed on close, so `localStorage` writes during verification never touch the user's browser.

## Doctor when it looks wrong

1. `ss -lptn "sport = :5273"` — is anything listening, and is it our pid?
2. `curl -s http://127.0.0.1:5273/ | head` — is the Vite HTML served?
3. `tail -50 .audit/dev-server.log` — did Vite print an error instead of `ready`?
4. `git status` — the app must be the tree you think it is. The skill runs against the working tree.

## Boundaries

- This drives the web app only. The scoring CLI (`nub run score`) has its own tests.
- It does not test accessibility conformance, only the behaviour a keyboard and pointer path can observe.
- It does not mock the network: `cycle` makes none, so a request in the log is a real defect.
