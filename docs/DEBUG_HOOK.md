# BPMN debug hook

The build-only `window.__MIROBOARD_DEBUG__` hook exposes the application's raw BPMN
model, validation, token-run, and simulation results for baseline and invariance tests.
It is enabled only when building with `MIROBOARD_DEBUG_HOOK=1`:

```powershell
powershell -Command "$env:MIROBOARD_DEBUG_HOOK='1'; node node_modules\vite\bin\vite.js build"
```

Normal builds leave `MIROBOARD_DEBUG_HOOK` unset. The Vite define then compiles the hook
out completely, so shipped artifacts do not contain the hook or its identifier.

The test-only surface is read-only:

- `createBpmnModel()` returns the projected model.
- `validateBpmn()` and `runBpmn()` return complete parsed WASM payloads.
- `simulateBpmn(seed, runs)` returns the complete, unrounded simulation result.
- `getElements()` returns a copied element snapshot.

It is intended solely for automated baseline capture and migration-invariance checks,
never for production integrations.
