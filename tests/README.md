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
