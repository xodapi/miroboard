# Agent Guidance for MiroBoard

## Mission Boundaries (NEVER VIOLATE)

**Port Range:** 4170-4199. All development servers and test infrastructure must use ports in this range only.

**Off-Limits:**
- PostgreSQL on port 5432 (belongs to other projects)
- Any files outside the repository
- `/dist` directory (build output, regenerated)
- `/node_modules` and `/.jj` directories

**Read-Only:**
- `package-lock.json` (only modify via `npm install <package>`)
- `wasm/board-core/Cargo.lock` (only modify via `cargo add`)

Workers: If you cannot complete your work within these boundaries, return to orchestrator. Never violate boundaries.

---

## Mission Directives

**Tools:**
- Use `node node_modules\<tool>\bin\<tool>.js` for all npm-based tools (eslint, tsc, vite)
- Use `cargo` directly for Rust operations
- Use `wasm-pack` for WASM builds

**Skills:**
- None specified yet (will be added per mission)

**Dependencies:**
All dependencies in package.json and Cargo.toml are approved. For new dependencies:
- Frontend: prefer lightweight, actively maintained packages
- Rust: prefer std library when possible; external crates must be well-vetted

**Architecture:**
- React/TypeScript for UI (strict mode enabled)
- Rust/WASM for core logic (geometry, validation, simulation)
- Single-file build output (everything inlined into one HTML)
- Yjs for real-time collaboration (optional feature)

**Code Quality:**
- TypeScript: strict mode, no `any` without justification
- Rust: enable overflow checks, write tests for public functions
- React: functional components only, hooks for state

---

## Testing & Validation Guidance

**Test Strategy:**
- **Unit tests (Rust):** Required for all core logic changes in `wasm/board-core/`
- **E2E tests (Playwright):** Required for new user-facing features
- **Manual verification:** Required for visual changes, test with actual interaction

**Before Handoff:**
Run programmatic validators:
- `node node_modules\typescript\bin\tsc --noEmit` (typecheck)
- `cargo test --manifest-path wasm/board-core/Cargo.toml` (Rust tests)
- `node node_modules\eslint\bin\eslint.js .` (lint, fix auto-fixable issues)

**WASM Changes:**
If you modify `wasm/board-core/src/lib.rs`, you MUST rebuild WASM before committing:
```bash
cd wasm/board-core
wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
cd ../..
```

Then rebuild the dist to verify integration:
```bash
node node_modules\vite\bin\vite.js build
```

**E2E Testing:**
Playwright tests require the preview server on port 4173. Use `services.yaml` commands to start/stop properly.

---

## Current Architecture Notes

**App.tsx Structure:**
The main App component (2531 lines) is a known refactoring target. When making changes:
- Keep changes localized to avoid merge conflicts
- Document intent clearly
- Consider extracting components if your changes add >100 lines

**Data Model:**
`BoardElement` is the core type (lines 66-99 in App.tsx). BPMN fields are mixed with base fields - this is intentional for now but may be refactored in future missions.

**Offline Mode:**
The application currently uses hardcoded public signaling servers. True offline operation requires disabling collaboration or providing local signaling. This is a known gap.

**State Management:**
- Yjs CRDT for collaborative state
- IndexedDB for persistence
- localStorage for autosave fallback

---

## Common Pitfalls

1. **PATH issues:** npm scripts don't work due to PATH configuration. Always use direct node invocations as shown in services.yaml.

2. **WASM rebuild:** Forgetting to rebuild WASM after Rust changes will cause runtime errors that don't show up in tests.

3. **Line endings:** Git may warn about CRLF→LF conversions in Rust files. This is expected on Windows.

4. **Port conflicts:** Always check that your port is free before starting services. Use the configured range only.

5. **Single-file build:** Changes to build configuration affect the entire artifact. Test the full build before committing.
