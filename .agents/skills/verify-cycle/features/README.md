# Feature map

The unit suite (`pnpm run test`) drives the reducer and the rendered text through Testing Library in happy-dom. It cannot see CSS, stacking, or whether a real pointer reaches the element under it. These are the paths that need a browser.

| Feature                                              | Why unit tests miss it                                    | Flow       | Status        |
| ---------------------------------------------------- | --------------------------------------------------------- | ---------- | ------------- |
| [Click-through](click-through.md)                    | `display` and stacking are layout facts, not update logic | `clicks`   | deterministic |
| [Logging flow](flow-logging.md)                      | `localStorage` round trip and reload                      | `flow`     | deterministic |
| [Tabs and prediction switch](tabs-and-prediction.md) | switch state and panel switching                          | `tabs`     | deterministic |
| [Overlays](overlays.md)                              | overlay portal, focus, Escape, outside click              | `overlays` | deterministic |
| [Mobile layout](mobile-layout.md)                    | `position: fixed`, media queries, touch-target sizes      | `mobile`   | deterministic |

`deterministic` means it passed at least three consecutive runs on this machine, from a cold profile, with the exact commands in `SKILL.md`.

## Adding a feature

1. Reproduce the path by hand once, then write down the selector you actually used.
2. Add a flow to `scripts/drive.mjs` that asserts the DOM state, not a screenshot.
3. Add a file here using the sections below.
4. Run it from a cold profile. If it only passes with warm state, the flow is wrong.
5. Promote it to `apps/web/src/*.e2e.test.ts` or a Playwright spec when one exists, then mark it `graduated-to-e2e`.
