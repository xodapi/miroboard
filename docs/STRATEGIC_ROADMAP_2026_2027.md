# MiroBoard Strategic Roadmap 2026-2027

> Status: proposed direction. Supersedes the framing of `docs/ROADMAP.md`, which
> remains valid as the BPMN/simulation feature backlog but describes only one
> notation profile of the product defined here.
>
> Baseline commit: `46d9ea6` (`main`), `package.json` version `0.15.0`.

---

## Executive Vision

MiroBoard today is a **BPMN process simulator that happens to have a whiteboard
attached**. The Rust engine is the product, and the canvas is its input device.

MiroBoard 1.0 will be a **single-file, offline visual workspace for structuring
information and keeping its history** — where BPMN simulation is one of several
notation profiles running on a shared graph core.

The transformation in one sentence:

> From "a diagram editor with a simulator bolted on" to "a portable graph
> workspace whose documents you own, whose history you can replay, and whose
> notations are pluggable — including an executable BPMN profile."

### What changes conceptually

| Dimension | Today (v0.15) | Target (v1.0) |
| --- | --- | --- |
| Core abstraction | `BoardElement` with BPMN fields inlined | `Node` / `Edge` graph with typed profile payloads |
| Unit of work | An ephemeral room ID in a URL | A **document file** the user owns (`.mboard`) |
| Persistence | IndexedDB + `localStorage` keyed by room | File-first, with local cache as a convenience |
| History | External (Git/jj, developer-facing) | In-document content history, user-facing |
| Structure | Flat z-ordered element list | Containers, frames, groups, links, outline |
| Notation | BPMN, hardcoded | Profile registry: BPMN, mind map, eEPC, free-form |
| Offline claim | Partially true (public signaling servers) | Verifiably true (zero external endpoints by default) |
| Collaboration | Always-on WebRTC via public signaling | Opt-in, configurable transport, off by default |

### Key differentiators for portfolio positioning

These are the things almost no other portfolio project has, and they should
drive every scoping decision:

1. **One HTML file, no installation, no backend, works air-gapped.**
   `vite-plugin-singlefile` already produces `dist/index.html` with everything
   inlined, including the WASM binary. This is a genuinely rare deployment
   story and it is directly valuable in regulated/closed environments.
2. **A real deterministic discrete-event simulation engine in Rust/WASM.**
   `wasm/board-core/src/lib.rs` is 2295 lines of domain logic exposing
   `validate_bpmn`, `run_bpmn`, `simulate_bpmn`, `export_bpmn_xml`,
   `import_bpmn_xml`, seeded Monte Carlo, XOR/AND semantics, resource capacity,
   queue policies (FIFO/priority), cost and utilisation. Determinism under a
   seed is a testable, demonstrable engineering claim.
3. **Standards round-tripping, not a toy exporter.** BPMN 2.0 XML export/import
   preserves conditions, default flows, XOR probabilities and simulation
   parameters, and *rejects* semantics it cannot model faithfully (see commits
   `66f6c86`, `3abbec5`, `4601c3e`, `46d9ea6`). Refusing to silently produce a
   wrong answer is a senior-engineer signal.
4. **Local-first CRDT data model.** Yjs gives conflict-free merge; the roadmap
   turns that from a collaboration gimmick into the foundation for offline
   editing, history and file-level merge.
5. **A deliberate Rust/TypeScript boundary.** Deterministic domain logic in
   Rust; UI, transport and presence in React. This is the architectural spine
   worth explaining in an interview.

### Target use cases beyond BPMN

The vision only holds if the product is useful when nobody wants a simulation:

- **Research and reading notes** — nodes for sources, edges for
  "supports/contradicts", frames per theme, history to see how understanding
  evolved.
- **Incident and investigation timelines** — evidence nodes, causal edges,
  replayable content history showing what was known at each point.
- **System and architecture sketches** — components, dependencies, containers,
  exportable as a single file for a review meeting.
- **Decision records** — options as nodes, criteria as containers, the history
  as the audit trail of how the decision moved.
- **Mind mapping and outlining** — a radial/tree profile over the same graph,
  with the outline panel as a first-class view.
- **Process work (existing strength)** — BPMN modelling, validation and
  simulation as the flagship profile.

---

## Current State Assessment

An honest baseline. Verified against the source, not assumed.

### Strengths

- `wasm/board-core/src/lib.rs`: 2295 lines, deterministic DES engine, BPMN
  validation, seeded Monte Carlo, resource queues, BPMN 2.0 XML round-trip.
- Single-file offline build already works (`vite.config.ts`,
  `assetsInlineLimit: 100_000`, `viteSingleFile()`).
- Build-time provenance: `__MIROBOARD_VERSION__` and `__MIROBOARD_HISTORY__`
  are injected from Git in `vite.config.ts`, so the shipped file knows which
  commit produced it. Good instinct, currently used only for a UI changelog.
- Quality gates exist: `typecheck`, `lint`, Playwright e2e (`tests/ui.spec.ts`,
  131 lines; `tests/priority-module.spec.ts`), `cargo test` for the Rust core.
- Six educational BPMN fixtures in `examples/` wired into the UI, giving each
  simulation feature a demonstrable case.
- Yjs + `y-indexeddb` already in place, so the CRDT substrate is not a future
  bet.

### Gaps that block the vision

1. **No document save/load.** The only outbound file paths in `src/App.tsx` are
   PNG (line ~755), SVG (line ~741) and BPMN XML (line ~771). The only inbound
   path is a `.bpmn/.xml` file input (line 1577). **There is no way to save or
   reopen a board.** For a tool whose pitch is "structure your information",
   this is existential.
2. **The offline claim is not actually true.** `src/App.tsx` line 488 hardcodes
   `signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com']`.
   The app reaches out to third-party public servers on load, using the room ID
   as the rendezvous key. In a closed environment this is both a broken feature
   and a compliance problem. It also means board IDs leak to public
   infrastructure.
3. **BPMN leaks into the base data model.** `BoardElement` (`src/App.tsx`
   lines 72-99) carries 11 BPMN-specific members: `bpmnNodeType`,
   `bpmnDurationMs`, `bpmnDurationDistribution`, `bpmnDurationMinMs`,
   `bpmnDurationModeMs`, `bpmnDurationMaxMs`, `bpmnResourceRole`,
   `bpmnCostPerHour`, `bpmnResourceCapacity`, `bpmnPriority`, `bpmnFlow`.
   Every future notation would add its own column to the same struct.
4. **No structuring primitives.** No `parentId`, no frames/containers, no
   grouping, no generic edge type (connections are `bpmnFlow` or dumb arrows),
   no links between documents. Structure is currently just x/y and `zIndex`.
5. **No content history.** History in the product means *Git history of the
   project*, surfaced as a changelog. The user's own document has no timeline,
   no named checkpoints, no replay.
6. **No search, no images, no attachments.** Beyond a few dozen elements the
   board is unnavigable.
7. **Monolith.** `src/App.tsx` is 2531 lines holding types, constants,
   geometry, tool handling, BPMN palette, simulation UI, collaboration wiring,
   export, onboarding and rendering. Every feature makes the next one harder.
8. **Docs describe the old product.** `README.md` and `docs/ROADMAP.md` are
   framed entirely around BPMN and the Rust migration.

### Strategic reading

The engine is the asset; the shell is the liability. The correct move is
**not** a rewrite. It is: close the credibility gaps that make the current
product unusable as a tool, and use the *file format* as the forcing function
for a general graph model — because a format is a contract you cannot fake.

---

## Strategic Direction

Four phases. Each ends with a coherent, demo-able product. No phase requires
the next one to have shipped for the previous one to be worth showing.

```
v0.15  ────────────────────────────────────────────────────────────────►  v1.0
   │                    │                     │                    │
   │ Phase 1            │ Phase 2             │ Phase 3            │ Phase 4
   │ Foundation &       │ Information         │ Graph Core &       │ Knowledge
   │ Credibility        │ Structuring         │ Notation Profiles  │ Workspace
   │ v0.16-0.17         │ v0.18-0.20          │ v0.21-0.25         │ v0.26-1.0
   │                    │                     │                    │
   │ own your document  │ organise at scale   │ BPMN becomes a     │ many docs,
   │ verifiable offline │ containers, search  │ plugin; new         │ replay,
   │ document history   │ images, outline     │ notations           │ queries
```

### Phase overview

| Phase | Theme | Ships | Architectural decision forced |
| --- | --- | --- | --- |
| 1 | Foundation & Credibility | `.mboard` file format, save/load, offline-by-default transport, content history | Document schema as a **general graph**, versioned and migratable |
| 2 | Information Structuring | Containers/frames, generic edges, search, outline, images | Hierarchy model (`parentId`) and profile-agnostic edge model |
| 3 | Graph Core & Notation Profiles | Rust graph core, BPMN as a profile, mind-map + free-form profiles | Profile registry and the Rust/TS boundary contract |
| 4 | Knowledge Workspace | Multi-document links, history replay/scrub, saved views, 1.0 polish | Cross-document identity and query model |

### Why this order

- **Format before refactor.** Designing `.mboard` as a general graph in Phase 1
  fixes the target model publicly and cheaply, before any code depends on it.
  The refactor in Phase 3 then has a specification instead of a preference.
- **Credibility before features.** A tool that cannot save a file and secretly
  phones home to Heroku is not portfolio-ready at any feature count.
- **Structure before notations.** Containers and generic edges are what a mind
  map or eEPC profile would need anyway; building them under the BPMN-only
  model would mean building them twice.
- **Core extraction last, gradually.** The 2531-line monolith is a real
  problem, but decomposing it is only safe once the data model is stable. Phase
  2 pays down the parts that block its own features; Phase 3 finishes the job.

---

## Phase 1: Foundation & Credibility (v0.16-0.17)

**Goal:** MiroBoard becomes a tool you can actually use for your own
information, in an environment with no internet, and trust with your work.

**Demo sentence:** "I open one HTML file with no network, build a board, save
it as a file, close everything, reopen the file, and scrub back through its
history."

### 1.1 The `.mboard` document format — general graph from day one

The single most consequential decision in this phase. The format must describe
a general graph, with notation data as opaque payload.

```jsonc
{
  "format": "mboard",
  "schemaVersion": 1,
  "meta": {
    "id": "doc_...",              // stable document identity, survives renames
    "title": "Incident 2026-03-14",
    "createdAt": "2026-03-14T09:00:00Z",
    "updatedAt": "2026-03-14T11:20:00Z",
    "createdWith": { "version": "0.16.0", "commit": "abc1234" },
    "profiles": ["core", "bpmn"]  // which profiles this doc uses
  },
  "nodes": [
    {
      "id": "n1",
      "kind": "sticky",           // core visual kind
      "parentId": null,           // reserved in v1, used in Phase 2
      "frame": { "x": 100, "y": 200, "w": 160, "h": 120, "rotation": 0 },
      "z": 3,
      "style": { "color": "#FFD93D", "fill": null, "stroke": 2 },
      "content": { "text": "Alert fired" },
      "profileData": {
        "bpmn": { "nodeType": "task", "durationMs": 300000, "resourceRole": "ops" }
      },
      "createdBy": "user_..."
    }
  ],
  "edges": [
    {
      "id": "e1",
      "kind": "connector",        // generic; not "bpmnFlow"
      "source": { "nodeId": "n1", "anchor": "auto" },
      "target": { "nodeId": "n2", "anchor": "auto" },
      "style": { "color": "#000000", "stroke": 2, "arrowHead": "triangle" },
      "content": { "label": "escalates" },
      "profileData": {
        "bpmn": { "flowType": "sequence", "condition": "amount > 100", "probability": 0.3, "isDefault": false }
      }
    }
  ],
  "history": { /* see 1.3 */ },
  "assets": { /* reserved for Phase 2 images */ }
}
```

Rules that make this format worth the effort:

- **`profileData` is a namespaced bag.** All 11 `bpmn*` fields move under
  `profileData.bpmn`. The core never reads them. This is the model that Phase 3
  will implement in code; Phase 1 implements it in the *file*, with an adapter
  translating to the current in-memory `BoardElement`.
- **Edges are first-class and generic.** Today an arrow is either dumb geometry
  or a `bpmnFlow`. In the format there is one `edges` array; BPMN semantics are
  a payload on it.
- **`parentId` and `assets` exist in schema v1 but are unused.** Reserving them
  now costs nothing and avoids a schema bump in Phase 2.
- **`schemaVersion` plus a migration chain from the first release.** Write the
  migration runner in v0.16 with an identity migration, so the mechanism is
  proven before it is needed.
- **`createdWith` reuses `__MIROBOARD_VERSION__`.** Provenance already exists in
  the build; put it in the document.

Success criteria:

- A documented schema in `docs/FORMAT.md` with a JSON Schema file, and at least
  three fixture documents in `examples/` (free-form board, BPMN process,
  mixed).
- Round-trip property test: load fixture → serialise → byte-comparable
  normalised output.
- Loading a document from a *newer* `schemaVersion` fails with a clear message
  rather than silently dropping data. Loading an older one migrates.
- Every existing BPMN example still simulates identically after a
  save/load/save cycle, seed-for-seed.

### 1.2 Save / open / autosave

- **Primary:** File System Access API (`showSaveFilePicker` /
  `showOpenFilePicker`) so Ctrl+S rewrites the file in place and the app can
  show a real filename and dirty state.
- **Fallback:** `Blob` download + `<input type="file">`, which the codebase
  already uses for PNG/SVG/BPMN, for browsers without FSA.
- **Recovery cache:** keep IndexedDB, but re-key it from `roomId` to the
  document `meta.id`. Today `IndexeddbPersistence(roomId)` and
  `localStorage['board-' + roomId]` mean a board's existence depends on a URL
  parameter. That coupling must go.
- **Drag-and-drop open** of `.mboard` onto the canvas.
- **Unsaved-changes guard** on close/reload.

Success criteria: create → save → hard-reload → open → identical board,
including selection-independent state (z-order, colours, simulation params).
Verified by a Playwright test driving the fallback path.

### 1.3 In-document content history

This is the feature that makes "visual history" real, and it is the one users
will remember. Do not confuse it with Git.

- **Automatic checkpoints.** Yjs already produces a change stream. Persist
  periodic snapshots (Yjs `snapshot` / state vectors, or normalised document
  states with structural diffs) into `history` inside the document.
- **Named checkpoints.** Explicit "mark this state" with a label.
- **Timeline UI.** A scrubber that renders any past state read-only, with
  changed nodes highlighted, plus "restore this state" which appends a new
  state rather than destroying the future.
- **Bounded growth.** Retention policy: keep all named checkpoints, thin
  automatic ones (e.g. keep-last-N plus exponential decay). Document the policy;
  a history feature that quietly triples file size is a bug.

Success criteria:

- 200 edits produce a scrubbable timeline; file size growth documented and
  under a stated budget (target: history ≤ 3x the size of the current state for
  a typical session).
- Restoring an old state never loses the states after it.
- History survives save/load.

### 1.4 True offline by default

Delete the hardcoded public signaling list at `src/App.tsx:488`. Replace with:

- **Default: local-only.** No `WebrtcProvider` is constructed at all. Zero
  outbound connections. This is the mode that must be true when someone opens
  `dist/index.html` from a USB stick in a closed network.
- **Collaboration is opt-in**, enabled explicitly in the UI, with the signaling
  endpoint supplied by the operator via a build-time define (mirroring the
  existing `__MIROBOARD_VERSION__` pattern) or a runtime setting persisted
  locally. Ship no public default.
- **Session secret separated from room ID.** Currently
  `collaborationSecret ?? roomId` (line ~456) means the URL parameter doubles
  as the password. Generate an independent secret and require it out-of-band.
- **A verifiable claim.** An automated check that boots the built
  `dist/index.html` with network blocked and asserts a fully functional editor,
  plus a test asserting zero non-`data:`/`blob:` requests in default mode. This
  test *is* the marketing claim; it belongs in CI.

Success criteria: `dist/index.html` opened via `file://` with the network
disabled gives a complete editor with save/load and simulation. Documented in
the README as a supported, tested configuration.

### 1.5 Documentation reframe

- Rewrite `README.md` around the new positioning; BPMN becomes a section, not
  the thesis.
- Add `docs/FORMAT.md` (schema + migration policy) and
  `docs/OFFLINE_DEPLOYMENT.md` (air-gapped usage, collaboration setup,
  threat notes).
- Keep `docs/ROADMAP.md` as the BPMN/simulation backlog, cross-linked to this
  document.

### Ordering and dependencies

```
1.1 format spec  ──►  1.2 save/load  ──►  1.3 history (needs a container to live in)
      │
      └──►  1.5 docs
1.4 offline transport  ──  independent, can land in parallel
```

- **1.1 must be first.** Save/load and history both serialise into it.
- **1.4 is independent** and should go early because it is small, high-impact,
  and unblocks honest positioning immediately.
- **1.3 is last** because it depends on both the format and a stable
  persistence path, and it is the most likely to need iteration.

### What Phase 1 unlocks for Phase 2

- A general graph schema with `parentId` and `edges` already reserved, so
  containers and generic connectors are additive, not a redesign.
- Documents as files, which is the prerequisite for images/assets (they need
  somewhere to live) and for multi-document links in Phase 4.
- Re-keying persistence off `roomId` removes the URL coupling that would block
  multi-document work.
- A migration mechanism proven on a trivial case before Phase 2 needs it for a
  real one.
- `profileData` namespacing gives Phase 3 a target: the refactor becomes
  "make the in-memory model match the file model", which is a mechanical,
  test-guided change rather than an open design question.

### Risk assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Format designed too narrowly, needs breaking change in Phase 2 | Medium | High | Reserve `parentId`, `assets`, namespaced `profileData` in v1; write the migration runner immediately; review the schema against a hand-written mind-map and eEPC document before freezing |
| History inflates file size | High | Medium | Retention policy + size budget test in CI from the first commit |
| Yjs snapshot APIs insufficient for scrubbing | Medium | Medium | Prototype the timeline on a throwaway branch before committing to Yjs snapshots; fallback is periodic normalised full states with structural diffs |
| File System Access API unavailable (Firefox, `file://` contexts) | High | Low | Fallback path is mandatory and is the one covered by e2e tests |
| Removing default signaling looks like a regression | Medium | Low | Ship the opt-in collaboration UI in the same release; document why |
| Adapter between file model and `BoardElement` becomes permanent cruft | Medium | Medium | Treat it as explicitly temporary, isolated in one module, deleted in Phase 3 |
| Scope creep into Phase 2 features | High | Medium | Phase 1 ships no new element types, no images, no search |

---

## Phase 2: Information Structuring (v0.18-0.20)

**Goal:** the board stays usable past a hundred elements. This is where the
"structuring information" claim is earned.

**Demo sentence:** "Here is a 300-node research board: frames per theme, nested
groups, typed connections, an outline panel, and search that jumps me anywhere
in two keystrokes."

### Scope

- **Containers and frames.** Activate `parentId`. Frames are named regions that
  move their children, can be collapsed, and are exportable individually.
  Groups are lightweight multi-selection containers.
- **Generic edges in memory.** Introduce a real `Edge` concept in the app, not
  only in the file. Labels, waypoints, anchors, edge kinds (association,
  causality, dependency, sequence). BPMN flows become edges with
  `profileData.bpmn`.
- **Search and navigation.** Full-text over node content and labels, jump-to,
  filter/highlight, minimap, and an **outline panel** deriving a tree from
  containers and edges. The outline is the second view onto the graph and the
  proof that the model is more than pixels.
- **Images and attachments.** Embedded in the document (base64 or a binary
  container), respecting the single-file constraint. Paste, drop, resize, crop.
  This forces the `assets` design and a size-budget conversation.
- **Rich node content.** Multi-line text with basic formatting, links,
  checkboxes.
- **Component decomposition, part one.** Extract what these features touch:
  canvas rendering, tool state machine, selection, viewport, panels. Target:
  `App.tsx` under 800 lines by end of phase, with no file over 500.

### Definition of done

- A 500-node fixture document loads and pans/zooms at interactive frame rates,
  measured and recorded.
- Nesting is arbitrary-depth and cycle-safe; moving a frame moves descendants;
  deleting a frame has defined semantics for children.
- Search finds content inside collapsed frames.
- Images survive round-trip; a documented size ceiling with a clear warning
  past it.
- BPMN simulation still passes every existing test after edges are generalised.
- `App.tsx` under 800 lines; new modules have unit tests.

### Architectural decisions forced

- **Hierarchy semantics.** Does `parentId` imply coordinate transform (child
  coordinates relative to parent) or only grouping? *Recommendation: relative
  coordinates for frames, because it makes collapse, move and per-frame export
  trivial, at the cost of a transform pass in hit-testing.*
- **Edge routing ownership.** Waypoint computation is geometry and belongs in
  Rust alongside `snap_to_grid` and `bpmnEdgeAnchor`. This is the natural next
  piece to migrate and it prefigures the graph core.
- **Asset storage.** Inline base64 is simplest and preserves single-file
  portability; it costs ~33% size. *Recommendation: inline with a hard warning
  above a threshold, plus deduplication by content hash.*
- **Render strategy.** 500 nodes of SVG will hit a wall. Decide between
  virtualised SVG and a canvas renderer for the static layer, and record the
  benchmark that drove the choice.

### How it builds toward the vision

Containers, generic edges and the outline panel are notation-neutral. They are
exactly the primitives a mind map, an eEPC diagram or a decision record needs.
Building them before Phase 3 means the new profiles arrive into a capable host
rather than requiring their own scaffolding.

---

## Phase 3: Graph Core & Notation Profiles (v0.21-0.25)

**Goal:** BPMN stops being special. The graph core is the product; notations
are plugins.

**Demo sentence:** "Same document, same engine. This board is a mind map, that
one is a BPMN process I can simulate, and adding a third notation is a
registration, not a refactor."

### Scope

- **Extract the Rust graph core.** `wasm/board-core` splits: a
  notation-agnostic graph module (identity, topology, traversal, reachability,
  layout, geometry, routing, validation primitives) and a `bpmn` module built
  on it. The 2295-line `lib.rs` becomes a workspace with clear internal
  boundaries.
- **Profile registry in the app.** A profile declares: node kinds and their
  visual defaults, edge kinds, a palette contribution, an inspector panel, a
  validator, optional runners, optional import/export. Registering a profile
  must not require touching core files.
- **Move BPMN fields out of the base type.** Delete all 11 `bpmn*` members
  from `BoardElement` in favour of `profileData.bpmn`, matching the file format
  designed in Phase 1. Delete the Phase 1 adapter.
- **Second and third profiles.**
  - *Mind map*: radial/tree layout, auto-arrange, collapse, keyboard-driven
    outlining. Highest value per unit of effort and it proves the registry.
  - *Free-form/concept map*: typed relations, no execution semantics — the
    minimal profile, which proves the core is genuinely notation-neutral.
  - *eEPC/ARIS* (stretch, already on `docs/ROADMAP.md`): validates the claim
    against a second real standard.
- **Auto-layout.** Hierarchical (Sugiyama-style) for process graphs, radial for
  mind maps. In Rust, deterministic, seeded. A strong demo and a real
  algorithmic contribution.
- **Component decomposition, part two.** Profiles own their UI. Simulation UI
  leaves the shell.

### Definition of done

- Adding a trivial fourth profile takes one new directory and one registration
  call, demonstrated by a documented example.
- No `bpmn` identifier appears anywhere in core modules; enforced by a lint
  rule or a test that greps the core.
- Every existing BPMN test, fixture and XML round-trip still passes.
- Auto-layout is deterministic under a seed, with golden-file tests.
- `docs/PROFILES.md` documents the extension contract.

### Architectural decisions forced

- **Where the profile boundary sits.** *Recommendation: the profile owns
  semantics and UI; the core owns topology, geometry and persistence. The core
  must never branch on profile identity.*
- **Validation composition.** Core structural validation runs always; profile
  validators register and contribute diagnostics. One diagnostics format, one
  UI surface (extending today's `BPMN` indicator into a general validity
  panel).
- **Rust/TS contract.** Today the boundary is stringly-typed JSON
  (`validate_bpmn(model_json: &str) -> String`). At this size that becomes a
  liability. *Recommendation: generate TypeScript types from the Rust structs
  so the contract is compiler-checked, and keep JSON as the wire format.*
- **Mixed-profile documents.** Allowed, since `meta.profiles` is a list. Define
  what happens when a document references an unregistered profile:
  *recommendation — render nodes with core visuals, preserve `profileData`
  untouched on save, warn once.* Never drop unknown data.

---

## Phase 4: Knowledge Workspace (v0.26-1.0)

**Goal:** many documents, one workspace. Ship 1.0.

**Demo sentence:** "This board links into three others, the timeline replays
how the whole investigation developed, and saved views answer questions across
the graph."

### Scope

- **Cross-document links.** Node-level references between `.mboard` documents
  using `meta.id` plus node id, with graceful handling of a missing target.
- **Transclusion.** Show a live view of a node or frame from another document.
- **History replay.** Upgrade the Phase 1 scrubber into narrative playback:
  animate the evolution, diff any two checkpoints, filter history by author or
  region. This is the flagship visual feature and the clearest expression of
  "visual history".
- **Saved views and queries.** Filters over kind, profile data, tags, edge type
  and time, saved into the document as named views. Turns the board into
  something you can interrogate.
- **Templates.** Ship the existing `examples/` plus structuring templates
  (research board, incident timeline, decision record).
- **1.0 quality bar.** Accessibility pass (keyboard-complete editing, focus
  management, ARIA on canvas controls, contrast), performance budgets in CI,
  full docs, versioned format guarantee.

### Definition of done

- A workspace of ≥5 linked documents navigable without losing context.
- Replay of a 500-edit history at interactive speed.
- Keyboard-only creation and editing of a complete board, verified in e2e.
- Documented format stability guarantee from 1.0 onward.

---

## Architectural Evolution

### Data model trajectory

**v0.15 (today)** — one flat struct, BPMN inlined:

```ts
interface BoardElement {
  id, type, x, y, w?, h?, points?, text?, color, stroke?, fill?,
  rotation?, createdBy?, emoji?, zIndex?,
  bpmnNodeType?, bpmnDurationMs?, bpmnDurationDistribution?,
  bpmnDurationMinMs?, bpmnDurationModeMs?, bpmnDurationMaxMs?,
  bpmnResourceRole?, bpmnCostPerHour?, bpmnResourceCapacity?,
  bpmnPriority?, bpmnFlow?
}
```

**Phase 1** — the *file* is a general graph; memory unchanged, bridged by one
isolated adapter module. Deliberate, temporary duplication: it buys a correct
public contract without a risky refactor.

**Phase 2** — memory splits into `Node` and `Edge`; `parentId` activates;
`assets` appear. `bpmn*` fields still present on the node but no longer read by
edge/container logic.

**Phase 3** — `profileData` replaces the `bpmn*` fields in memory. Adapter
deleted. Memory and file models converge:

```ts
interface Node {
  id: string
  kind: string                      // core visual kind
  parentId: string | null
  frame: Frame
  z: number
  style: Style
  content: NodeContent
  profileData: Record<string, unknown>   // namespaced, opaque to core
  createdBy?: string
}

interface Edge {
  id: string
  kind: string
  source: EndpointRef
  target: EndpointRef
  waypoints?: Point[]
  style: EdgeStyle
  content?: EdgeContent
  profileData: Record<string, unknown>
}
```

**Phase 4** — `NodeRef` gains a document dimension (`{ docId, nodeId }`),
making links and transclusion expressible without another model change.

### Component decomposition strategy

Target structure, reached incrementally rather than in one move:

```
src/
  core/            document model, schema, migrations, serialisation
  persistence/     file IO, IndexedDB cache, autosave, recovery
  history/         checkpoints, retention, timeline state
  canvas/          renderer, viewport, hit-testing, layers
  interaction/     tool state machine, selection, keyboard
  panels/          inspector, outline, search, history, validity
  profiles/
    bpmn/          palette, inspector, validator, runner, XML io
    mindmap/
    freeform/
  collaboration/   Yjs doc, transport, presence (opt-in)
  wasm/            generated bindings
  App.tsx          shell composition only
```

Rules for the decomposition:

1. **Extract along feature seams, never as a big-bang split.** Each phase
   extracts only what that phase's features touch, so every extraction is
   validated by new code immediately using it.
2. **Extract state before UI.** Pull the document model, persistence and
   history into modules with their own tests first; the rendering split is
   easier once state is not entangled with it.
3. **One direction of dependency.** `profiles/` may import `core/`; `core/`
   must never import `profiles/`. Enforce with a lint rule.
4. **A line-count budget per phase, tracked in CI.** Phase 2: `App.tsx` < 800.
   Phase 3: < 400 and shell-only. Budgets, not aspirations.
5. **Every extraction is behaviour-preserving and covered by an e2e test that
   passes before and after.** With a 2531-line component and 131 lines of e2e
   coverage, test coverage must lead refactoring, not trail it.

### When and how to extract the graph core

The Rust core migrates in this order, chosen so each step delivers a user-facing
feature rather than pure refactoring:

1. **Phase 2 — edge routing and geometry.** Waypoints, anchors, hit-testing.
   Continues the migration already begun with `snap_to_grid` / `clamp_scale`,
   and ships better connectors.
2. **Phase 2/3 boundary — batch element operations.** Already named as the next
   step in `README.md`. Alignment, distribution, group transforms.
3. **Phase 3 — topology and traversal.** Reachability, cycle detection,
   ancestry, connected components. Generalised from the BPMN validator's
   existing traversal logic, which already does this work for one notation.
4. **Phase 3 — layout.** Hierarchical and radial, deterministic and seeded.
5. **Phase 3 — validation framework.** Core structural rules plus registered
   profile validators, replacing the monolithic `validate_bpmn` entry point
   with a composed one.

The simulation engine (`run_bpmn`, `simulate_bpmn`) stays as-is. It is correct,
tested and valuable; it simply becomes a BPMN-profile capability instead of the
product's centre of gravity.

### Backward compatibility approach

- **`schemaVersion` with a forward-only migration chain**, in place from
  v0.16 with a proven identity migration.
- **Unknown data is preserved, never dropped.** Unrecognised `profileData`
  namespaces, node kinds and fields survive load→save. This is what lets old
  documents outlive the code that made them, and it is the discipline
  reviewers notice.
- **Newer-than-supported documents are refused explicitly**, with the version
  reported, rather than partially loaded.
- **Migration tests are permanent fixtures.** Every schema version keeps a
  fixture in `examples/legacy/`, and the test suite loads all of them on every
  run. Fixtures are never edited after their version ships.
- **No format stability promise before 1.0**, and a firm one after. Say so in
  the docs.
- **BPMN XML round-trip is a hard invariant** across every phase. The existing
  behaviour of rejecting unsupported semantics (commit `66f6c86`) is a feature
  and must not be softened for convenience during refactors.

---

## Portfolio Positioning

### The narrative

Lead with the constraint, not the feature list:

> "A visual workspace for structuring information and its history, that runs as
> a single HTML file with no installation and no network — because the
> environments I built it for do not allow either. The domain logic is a
> deterministic Rust/WASM engine; the browser layer is only a shell."

That framing does three things: it explains an unusual architecture as a
response to a real constraint, it puts engineering judgement ahead of feature
count, and it makes the Rust core the point rather than a curiosity.

### Technical achievements worth highlighting

1. **Deterministic discrete-event simulation.** Seeded Monte Carlo, resource
   capacity, FIFO vs priority queueing, cost and utilisation — with identical
   results across runs and platforms. Demonstrate by running the same seed
   twice and diffing.
2. **Standards fidelity with principled refusal.** BPMN 2.0 round-trip that
   preserves conditions, defaults, probabilities and simulation parameters, and
   rejects inclusive gateways and implicit splits instead of computing a wrong
   answer. Show the rejection path; explaining *why you refuse* is more
   impressive than the happy path.
3. **A format designed for longevity.** Versioned schema, forward-only
   migrations, permanent legacy fixtures, unknown-field preservation. This is
   the section that separates a portfolio project from a demo.
4. **Verifiable offline operation.** A CI test that boots the built artifact
   with the network blocked and asserts zero external requests. Turning a
   marketing claim into an assertion is the whole story in miniature.
5. **A deliberate, defensible language boundary.** Rust for deterministic
   domain logic; TypeScript for UI, transport and presence; typed contract
   generated from the Rust side. Be ready to explain what you would *not* put
   in Rust.
6. **CRDT local-first architecture** used for offline editing and history, not
   just multiplayer.
7. **Plugin architecture proven by use.** Three notations on one core, with a
   documented extension contract and a core that cannot name any profile.
8. **Honest engineering hygiene.** Typecheck, lint, e2e, Rust unit tests,
   golden files, performance and file-size budgets in CI — and a roadmap that
   states its own weaknesses. This document is itself part of the portfolio.

### Demonstration scenarios by phase

**Phase 1 — "Own your document, trust the tool."**
1. Disconnect the network. Open `dist/index.html` from a local file.
2. Build a small board. Save it to disk. Show the file.
3. Close the browser entirely. Reopen the file. Identical board.
4. Open DevTools network tab: nothing outbound.
5. Scrub the history timeline back through the session, restore a checkpoint,
   show that later states were preserved.
6. Load a BPMN example, simulate twice with the same seed, diff the results.

**Phase 2 — "Structure at scale."**
1. Load the 500-node research fixture.
2. Collapse and expand frames; move a frame and show children following.
3. Search a term, jump into a collapsed frame.
4. Navigate via the outline panel, showing the graph as a tree.
5. Paste an image, save, reopen, show it embedded, quote the file size.

**Phase 3 — "One core, many notations."**
1. Open a mind map. Auto-arrange. Note the layout is seeded and deterministic.
2. Open a BPMN process in the same app. Validate. Simulate. Export XML.
3. Open a mixed document using both profiles.
4. Show the profile registration code — around a hundred lines for a working
   notation.
5. Grep the core for `bpmn` and get nothing.

**Phase 4 — "A workspace, not a canvas."**
1. Navigate a set of linked documents.
2. Show a transcluded frame updating from its source.
3. Replay a full investigation history as animation.
4. Apply a saved query view to filter the graph.
5. Complete a board using only the keyboard.

### What to say about the past

Do not hide the BPMN-first origin. "It started as a process simulator; the
engine was solid and the shell was a monolith with the domain leaking into the
base type. I designed the file format as a general graph first, so the refactor
had a specification instead of an opinion." That is a better story than
pretending the architecture was right from the start.

---

## Risks & Mitigations

### Strategic

| Risk | Mitigation |
| --- | --- |
| Losing the BPMN differentiator while generalising | The simulation engine is never touched by generalisation; BPMN becomes the flagship profile and keeps getting features from `docs/ROADMAP.md`. Every phase's definition of done includes "all BPMN tests pass". |
| Becoming a worse Miro instead of a distinctive tool | Compete on offline, portability, determinism and history — never on real-time collaboration polish or breadth of shapes. When a feature only makes sense with a server, decline it. |
| Perpetual refactoring with nothing to show | Every phase ships a demo-able product; core extraction is always bundled with a user-facing feature; line-count budgets are checked in CI, not by vibes. |
| Roadmap outlives its assumptions | Re-review this document at each phase boundary; record what changed and why. |

### Technical

| Risk | Mitigation |
| --- | --- |
| Single-file constraint collides with images and history | Size budgets in CI, deduplication by content hash, documented ceilings with in-app warnings. If the constraint truly breaks, state the tradeoff explicitly rather than quietly abandoning the claim. |
| 500+ nodes exceed SVG rendering limits | Benchmark early in Phase 2; be prepared to move the static layer to canvas; record the benchmark that drove the decision. |
| Refactoring a 2531-line component against 131 lines of e2e coverage | Grow e2e coverage *before* each extraction; treat coverage as the enabling dependency, not a follow-up. |
| Yjs history APIs do not support the desired scrubbing | Prototype before committing; fallback is periodic normalised snapshots with structural diffs. |
| CRDT merge semantics conflict with file-based editing (two people edit two copies) | Phase 1 keeps this out of scope: file save is a snapshot. Address merge explicitly in Phase 4 if at all, and say plainly that it is unsolved before then. |
| WASM binary size growth as the core absorbs layout and topology | Track `board_core_bg.wasm` size in CI with a budget; `opt-level="z"` and LTO before adding dependencies. |
| Generated Rust→TS types add build friction | Gate on a single generator step in the existing build; if it costs more than it saves, revert to hand-written types with a contract test. |

### Process

| Risk | Mitigation |
| --- | --- |
| Documentation drifts from reality (already true today) | Each phase's definition of done includes doc updates; README claims that are testable get tests. |
| Bilingual docs diverge (`docs/` is Russian, this file is English) | Pick one language per document and cross-link; do not maintain parallel translations of long-lived specs. |
| Solo-project momentum loss | Phases are independently shippable and independently demo-able; abandoning after any phase still leaves a coherent product. |

---

## Success Metrics

### Phase 1

- A user can create, save, close, reopen and continue a document. Binary.
- `dist/index.html` runs fully with the network disabled, asserted in CI.
- Zero outbound requests in default mode, asserted in CI.
- `schemaVersion` 1 documented with a JSON Schema and ≥3 fixtures.
- History: 200 edits scrubbable; history overhead ≤ 3x current-state size.
- All existing BPMN tests and XML round-trips pass unchanged.
- Save/load/simulate is covered by e2e tests.

### Phase 2

- 500-node fixture: interactive pan/zoom with a recorded frame-rate figure.
- Arbitrary-depth nesting, cycle-safe, with defined delete semantics.
- Search hits content inside collapsed frames.
- `src/App.tsx` < 800 lines; no source file > 500 lines.
- Images round-trip with a documented size ceiling.

### Phase 3

- Zero occurrences of `bpmn` in core modules, enforced by a test.
- A fourth profile added in one directory plus one registration call.
- Auto-layout deterministic under seed, covered by golden files.
- `src/App.tsx` < 400 lines, shell-only.
- `docs/PROFILES.md` complete enough for an outside contributor.

### Phase 4

- ≥5 linked documents navigable without context loss.
- 500-edit history replays at interactive speed.
- Keyboard-only board creation verified in e2e.
- Documented format stability guarantee.

### Continuous (every release)

- `npm run typecheck`, `npm run lint`, `npm run test:e2e`, `npm run test:rust`
  green.
- `dist/index.html` and `board_core_bg.wasm` sizes within budget, tracked over
  time.
- Every new feature ships with a fixture and a test — the existing project
  principle, kept.
- Every migration keeps its permanent legacy fixture.
- No release claims a capability that is not covered by a test.
