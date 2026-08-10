# BPMN Simulation Baseline (M0)

Captured at commit `5c293dc94e9c2d01f92f96bafaa6f0da005d9270`, before `src/format/` exists, via the test build and `tests/baseline-capture.spec.ts` driving the real UI through `window.__MIROBOARD_DEBUG__`.

## Purpose

This baseline is the immutable oracle for BPMN regression tests and migration invariance.

## Immutability Rule

**These artifacts are NEVER edited or regenerated to make a test pass.** A mismatch is a regression to investigate, not a reason to update this baseline.

## Expected Element Counts

| Module | Nodes+Flows |
| --- | ---: |
| basic-fixed.json | 7 |
| parallel-queue.json | 12 |
| sla-calendar.json | 5 |
| batch-workload.json | 5 |
| priority-queue.json | 12 |
| fifo-vs-priority.json | 5 |

## Capture Method

Each module has independent first-load, same-session-reload, and post-browser-restart captures. Result payloads are SHA256-verified byte-identical, with seed=42 and runs=500; each module README records its shared hash.

## Explicit Capture Command

The capture driver is excluded from ordinary Playwright discovery. To deliberately
rebuild the test artifact and regenerate this baseline, run from the repository root:

```powershell
powershell -Command "$env:MIROBOARD_DEBUG_HOOK='1'; node node_modules\vite\bin\vite.js build; node node_modules\playwright\cli.js test --config playwright.capture.config.ts"
```

This command is also available as `test:baseline-capture` in the mission
`services.yaml`. The driver verifies `window.__MIROBOARD_DEBUG__` before it can
remove `baseline/`; a normal build therefore fails without touching this directory.
