# E2E runs on Windows

Playwright does not own the Vite preview process on Windows because its teardown can
hang indefinitely. Build first, then run the `test:e2e` command in the canonical
mission `services.yaml`; it starts preview on port 4173, runs the suite, and stops the
listener by port even when the suite fails.

Do not run `node node_modules\playwright\cli.js test` directly on Windows unless you
have already started the preview server through the manifest and will stop it by port.

## Debug-hook BPMN validation suite

`bpmn-validation-regression-suite.spec.ts` reads the full validation payload from the
test-only `window.__MIROBOARD_DEBUG__` hook. It is deliberately excluded from the
normal `test:e2e` lane, which builds the hook-free production artifact.

Run it through `test:e2e:debug` in `services.yaml`. That command builds with
`MIROBOARD_DEBUG_HOOK=1`, serves the instrumented artifact, and selects the suite via
`playwright.debug.config.ts`. Do not add hook-dependent specs to the default config.

Token execution regression coverage follows the same split. Tests labelled
`BASELINE-INVARIANCE` compare only the six shipped models at seed 42/runs 500
with immutable `baseline/` payloads. Tests labelled `CHARACTERIZATION` or
`RELATIONAL` cover changed configurations and assert observed behaviour without
inventing baseline artifacts. The suite is
`bpmn-token-execution-regression-suite.spec.ts` and runs only through
`test:e2e:debug`.

Simulation parameter coverage follows the same two-oracle split in
`bpmn-simulation-parameter-regression-suite.spec.ts`: only shipped modules at
seed 42/runs 500 compare to immutable M0 artifacts. Changed seeds, run counts,
and parameter configurations are characterization or relational assertions.
Because these tests read `window.__MIROBOARD_DEBUG__`, they are excluded from
the normal lane and run through `test:e2e:debug`.

Resource and cost metrics coverage follows the same split in
`bpmn-resource-metrics-regression-suite.spec.ts`: only shipped modules at seed
42/runs 500 use immutable M0 values. Capacity, queue policy, priority, cost,
SLA, and changed parameters are characterization or relational assertions.
This hook-dependent suite is excluded from `test:e2e` and runs through
`test:e2e:debug`.
