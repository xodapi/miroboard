# MiroBoard Phase 2 — Graph Core Abstraction: Notation Plugin System

**Status:** Planning  
**Baseline:** Phase 1 complete (28 features, 254 assertions passed, 148 unit tests, 88 Playwright tests)  
**Goal:** Replace the flat `BoardElement` monolith with a plugin-based notation architecture, extract BPMN into a first-class plugin, and add eEPC as the second notation (visual editor + basic token runner).

---

## 1. Overview

Phase 1 shipped a working offline whiteboard with BPMN simulation. The cost was architectural debt: 11 BPMN-specific fields sit inline on `BoardElement`, all rendering and property logic is hardcoded in `App.tsx` (2531 lines), and the Rust engine is a single 2546-line file with no abstraction over notation type.

Phase 2 pays that debt by introducing a **NotationPlugin** interface. Each notation (BPMN, eEPC, future VAD/ARIS) becomes a self-contained module that plugs into:
- The canvas renderer
- The SVG edge geometry system
- The WASM simulation engine
- The property panel
- The `.mboard2` serialization layer

What stays the same: the Yjs-based collaboration layer, IndexedDB recovery, history system, file persistence API, and the `.mboard` format for Phase 1 files (Phase 2 uses `.mboard2`).

**Breaking change:** Phase 2 uses `.mboard2` (schemaVersion: 2). Old `.mboard` v1 files do not open in the Phase 2 app.

---

## 2. Directory Structure

```
src/
├── notation/                          ← NEW: plugin system
│   ├── types.ts                       # NotationPlugin, NotationRegistry, ElementSpec interfaces
│   ├── registry.ts                    # Runtime registry singleton
│   ├── bpmn/
│   │   ├── types.ts                   # BpmnNodeType, BpmnProfile, BpmnFlowProfile
│   │   ├── plugin.ts                  # BpmnPlugin implements NotationPlugin
│   │   ├── render.tsx                 # renderNode(), edgeAnchor() — extracted from App.tsx
│   │   ├── model.ts                   # buildSimulationModel(), validate() — wraps WASM
│   │   ├── panel.tsx                  # renderPropertyPanel() — extracted from App.tsx ~2110–2290
│   │   ├── palette.ts                 # Creatable element specs with defaults
│   │   └── index.ts                   # Re-exports BpmnPlugin
│   └── eepc/
│       ├── types.ts                   # EepcNodeType, EepcProfile, EepcFlowProfile
│       ├── plugin.ts                  # EepcPlugin implements NotationPlugin
│       ├── render.tsx                 # renderNode(), edgeAnchor() for eEPC shapes
│       ├── model.ts                   # buildSimulationModel(), validate() — Rust EepcEngine
│       ├── panel.tsx                  # renderPropertyPanel() for Functions and edges
│       ├── palette.ts                 # Creatable eEPC element specs
│       └── index.ts                   # Re-exports EepcPlugin
│
├── format/
│   ├── types.ts                       # MboardFile2 (schemaVersion: 2), DocNode, DocEdge
│   ├── schema.ts                      # Zod schema for .mboard2 validation
│   ├── mboard2.ts                     # serialise/deserialise for .mboard2
│   ├── migrations.ts                  # v2-internal migrations only (no v1 migration)
│   └── [existing files unchanged]
│
├── App.tsx                            # Canvas orchestration only; dispatch via NotationRegistry
└── [other existing modules unchanged]

wasm/board-core/src/
├── lib.rs                             # wasm_bindgen shims only — thin wrappers
├── engine/
│   ├── mod.rs                         # NotationEngine trait + shared result types
│   ├── bpmn/
│   │   ├── mod.rs                     # BpmnEngine impl
│   │   ├── model.rs                   # BpmnModel, BpmnNode, BpmnFlow, all structs
│   │   ├── validate.rs                # validate_bpmn_model()
│   │   ├── runner.rs                  # run_bpmn_batch() token scheduler
│   │   └── simulate.rs                # simulate_bpmn_with_seed() Monte Carlo
│   └── eepc/
│       ├── mod.rs                     # EepcEngine impl
│       ├── model.rs                   # EepcModel, EepcNode, EepcFlow structs
│       ├── validate.rs                # Alternating structure, OR-join reachability
│       └── runner.rs                  # eEPC token runner
└── shared/
    ├── mod.rs
    ├── types.rs                       # ArrivalClass, ResourceRole, QueuePolicy, IssueSeverity
    ├── results.rs                     # RunResult, ValidationResult, SimulationResult
    └── math.rs                        # percentile(), sample_variance()
```

---

## 3. Core TypeScript Interfaces

### 3.1 BoardElement (new — no bpmn* fields)

```typescript
interface BoardElement {
  id: string
  type: 'path' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'line' | 'text' | 'emoji'
  x: number
  y: number
  w?: number
  h?: number
  points?: Point[]
  text?: string
  color: string
  stroke?: number
  fill?: string
  rotation?: number
  createdBy?: string
  emoji?: string
  zIndex?: number
  /**
   * Notation-specific data keyed by plugin id.
   * e.g. profileData['bpmn'] = { nodeType, durationMs, ... }
   *      profileData['eepc'] = { nodeType, durationMs, ... }
   * Absent on generic (non-notation) shapes.
   */
  profileData?: Record<string, unknown>
  /**
   * Present on edge elements (type === 'arrow' | 'line' with a notation plugin).
   * Replaces the old inline bpmnFlow field.
   */
  edgeRef?: {
    sourceId: string
    targetId: string
    namespace: string   // plugin id that owns this edge
  }
}
```

### 3.2 ElementSpec

```typescript
/** Describes one creatable element type within a notation. */
interface ElementSpec {
  /** Unique within the plugin. Used in palette and tool switching. */
  notationType: string
  /** Base BoardElement.type to use as the shape container. */
  shapeKind: BoardElement['type']
  /** Human label shown in palette. */
  label: string
  /** Default profileData values when this element is created. */
  defaultProfile: Record<string, unknown>
  /** Whether this element acts as a directed edge (requires source/target). */
  isEdge?: boolean
}
```

### 3.3 NotationPlugin

```typescript
interface CanvasRenderContext {
  isSelected: boolean
  invScale: number
  isChangedInPreview: boolean
  activeTokenId: string | null
  visibleBottleneckRole?: string | null
  darkMode: boolean
}

interface NotationPlugin {
  /** Stable identifier = profileData namespace key (e.g. 'bpmn', 'eepc'). */
  readonly id: string
  /** Human label for mode switcher and palette header. */
  readonly label: string
  /** All element types this plugin contributes. */
  readonly elements: readonly ElementSpec[]

  // ── Canvas ──────────────────────────────────────────────────────────────────

  /**
   * Render the SVG for an element that has profileData[plugin.id] set.
   * Return null to fall through to the generic shape renderer.
   */
  renderNode(element: BoardElement, ctx: CanvasRenderContext): React.ReactElement | null

  /**
   * Compute the SVG anchor point on `element` toward (towardX, towardY).
   * Called for edges where edgeRef.namespace === plugin.id.
   * Return null to use the default bounding-box anchor.
   */
  edgeAnchor(
    element: BoardElement,
    towardX: number,
    towardY: number
  ): { x: number; y: number } | null

  // ── Serialization ────────────────────────────────────────────────────────────

  /**
   * Extract plugin-specific data from a BoardElement into profileData[plugin.id].
   * Called by mboard2.ts serialise().
   */
  toProfileData(element: BoardElement): Record<string, unknown>

  /**
   * Hydrate a BoardElement from profileData[plugin.id].
   * Called by mboard2.ts deserialise().
   */
  fromProfileData(profileData: Record<string, unknown>): Partial<BoardElement>

  // ── Simulation ───────────────────────────────────────────────────────────────

  /**
   * Project the full element array into a simulation model JSON for WASM.
   * Return null if this plugin has no simulation capability.
   */
  buildSimulationModel?(elements: BoardElement[]): unknown | null

  /**
   * Validate the simulation model synchronously.
   * Issues are displayed as inline diagram annotations.
   */
  validate?(model: unknown): Array<{
    severity: 'error' | 'warning'
    message: string
    elementId?: string
  }>

  // ── Property Panel ───────────────────────────────────────────────────────────

  /**
   * Render the selection property panel for an element owned by this plugin.
   * Return null if the element is not owned by this plugin.
   */
  renderPropertyPanel?(
    element: BoardElement,
    onUpdate: (id: string, patch: Partial<BoardElement>) => void,
    darkMode: boolean
  ): React.ReactElement | null

  // ── Palette ──────────────────────────────────────────────────────────────────

  /**
   * Return the ordered list of elements shown in the notation palette.
   * Used to populate the palette UI and to seed element creation from tools.
   */
  paletteElements(): readonly ElementSpec[]
}
```

### 3.4 NotationRegistry

```typescript
class NotationRegistry {
  private plugins: Map<string, NotationPlugin> = new Map()

  register(plugin: NotationPlugin): void {
    this.plugins.set(plugin.id, plugin)
  }

  /** Look up the plugin that owns an element (by its profileData key or edgeRef.namespace). */
  pluginFor(element: BoardElement): NotationPlugin | null {
    if (element.edgeRef) return this.plugins.get(element.edgeRef.namespace) ?? null
    if (!element.profileData) return null
    for (const [id, plugin] of this.plugins) {
      if (id in element.profileData) return plugin
    }
    return null
  }

  getAll(): NotationPlugin[] {
    return [...this.plugins.values()]
  }

  get(id: string): NotationPlugin | undefined {
    return this.plugins.get(id)
  }
}

// Singleton, initialized in main.tsx before App renders:
export const notationRegistry = new NotationRegistry()
notationRegistry.register(BpmnPlugin)
notationRegistry.register(EepcPlugin)
```

---

## 4. BPMN Plugin (`src/notation/bpmn/`)

### 4.1 types.ts

```typescript
export type BpmnNodeType =
  | 'startEvent' | 'endEvent' | 'intermediateEvent'
  | 'task' | 'serviceTask' | 'userTask'
  | 'xorGateway' | 'andGateway' | 'orGateway'

export interface BpmnNodeProfile {
  nodeType: BpmnNodeType
  durationMs?: number
  durationDistribution?: 'fixed' | 'uniform' | 'triangular'
  durationMinMs?: number; durationModeMs?: number; durationMaxMs?: number
  resourceRole?: string; costPerHour?: number; resourceCapacity?: number
  priority?: number
}

export interface BpmnFlowProfile {
  flowType?: 'sequence' | 'message'
  condition?: string; probability?: number; isDefault?: boolean
}
```

All fields previously on `BoardElement` as `bpmnXxx` are now typed here and stored under `profileData['bpmn']`.

### 4.2 plugin.ts

Implements `NotationPlugin`. Delegates to sub-modules:

```typescript
export const BpmnPlugin: NotationPlugin = {
  id: 'bpmn',
  label: 'BPMN',
  elements: BPMN_ELEMENT_SPECS,         // from palette.ts
  renderNode: bpmnRenderNode,            // from render.tsx
  edgeAnchor: bpmnEdgeAnchor,            // from render.tsx
  toProfileData: bpmnToProfileData,      // from types.ts helpers
  fromProfileData: bpmnFromProfileData,  // from types.ts helpers
  buildSimulationModel: bpmnBuildModel,  // from model.ts
  validate: bpmnValidate,               // from model.ts
  renderPropertyPanel: BpmnPropertyPanel, // from panel.tsx
  paletteElements: () => BPMN_ELEMENT_SPECS,
}
```

### 4.3 render.tsx

Extracted verbatim from `App.tsx ~1440–1680`:
- `bpmnRenderNode(el, ctx)` — replaces the `if (el.bpmnNodeType)` branch
- `bpmnEdgeAnchor(el, tx, ty)` — replaces the `bpmnEdgeAnchor` function

### 4.4 model.ts

```typescript
export function bpmnBuildModel(elements: BoardElement[]): BpmnModelJson { ... }
// Replaces createBpmnModel() in App.tsx ~280–310
// Reads profileData['bpmn'] instead of bpmn* fields

export function bpmnValidate(model: BpmnModelJson) {
  return JSON.parse(wasm.validate_bpmn(JSON.stringify(model)))
}
```

### 4.5 panel.tsx

Extracted from `App.tsx ~2110–2290`:
- `BpmnNodePanel` — property panel for task nodes
- `BpmnFlowPanel` — property panel for sequence flows
- Reads/writes `profileData['bpmn']` instead of `bpmnXxx` fields

### 4.6 palette.ts

```typescript
export const BPMN_ELEMENT_SPECS: ElementSpec[] = [
  { notationType: 'startEvent',  shapeKind: 'sticky', label: 'Start',    defaultProfile: { nodeType: 'startEvent' },  isEdge: false },
  { notationType: 'endEvent',    shapeKind: 'sticky', label: 'End',      defaultProfile: { nodeType: 'endEvent' },    isEdge: false },
  { notationType: 'task',        shapeKind: 'sticky', label: 'Task',     defaultProfile: { nodeType: 'task', durationMs: 3600000 }, isEdge: false },
  { notationType: 'xorGateway',  shapeKind: 'sticky', label: 'XOR',     defaultProfile: { nodeType: 'xorGateway' },  isEdge: false },
  { notationType: 'andGateway',  shapeKind: 'sticky', label: 'AND',     defaultProfile: { nodeType: 'andGateway' },  isEdge: false },
  { notationType: 'sequence',    shapeKind: 'arrow',  label: 'Flow',     defaultProfile: { flowType: 'sequence' },   isEdge: true  },
]
```

---

## 5. eEPC Plugin (`src/notation/eepc/`)

### 5.1 types.ts

```typescript
export type EepcNodeType =
  | 'triggerEvent' | 'resultEvent'      // Events (circles)
  | 'function'                          // Work unit (rounded rect)
  | 'andConnector' | 'orConnector' | 'xorConnector'  // Gateways (diamonds)
  | 'orgUnit'                           // Organizational unit (dashed rect) — annotation only
  | 'itSystem'                          // IT system (rect with icon)
  | 'infoObject'                        // Information object (parallelogram)

export type EepcFlowType = 'controlFlow' | 'orgAssignment' | 'infoFlow'

export interface EepcNodeProfile {
  nodeType: EepcNodeType
  // Only for 'function':
  durationMs?: number
  durationDistribution?: 'fixed' | 'uniform' | 'triangular'
  durationMinMs?: number; durationModeMs?: number; durationMaxMs?: number
  resourceRole?: string; costPerHour?: number; resourceCapacity?: number; priority?: number
  // For 'orgUnit' | 'itSystem' | 'infoObject':
  name?: string
  // For 'infoObject':
  direction?: 'in' | 'out' | 'inout'
}

export interface EepcFlowProfile {
  flowType: EepcFlowType
  condition?: string   // for controlFlow XOR branches
  probability?: number // for XOR probability
  isDefault?: boolean
  roleId?: string      // for orgAssignment
  direction?: 'in' | 'out'  // for infoFlow
}
```

### 5.2 Plugin structure

Mirrors BPMN plugin structure exactly:
- `render.tsx` — eEPC SVG shapes (TriggerEvent as thin circle, ResultEvent as thick circle, Function as rounded rect, connectors as diamonds, OrgUnit as dashed rect, edge styles per flow type)
- `model.ts` — `eepcBuildModel()` projects elements → EepcModel JSON for Rust; `eepcValidate()` calls `wasm.validate_eepc()`
- `panel.tsx` — property panel for Function (duration, resource), Connector (no properties), OrgUnit (name, capacity)
- `palette.ts` — ordered palette: TriggerEvent, Function, ResultEvent, AND, OR, XOR, OrgUnit, controlFlow edge

---

## 6. App.tsx Dispatch Refactor

All 22 BPMN access sites converge to `notationRegistry.pluginFor(element)` calls.

### 6.1 renderElement

```typescript
// BEFORE:
function renderElement(el: BoardElement) {
  if (el.bpmnNodeType) {
    // 100+ lines of BPMN-specific SVG
    return <g>...</g>
  }
  switch (el.type) { ... }
}

// AFTER:
function renderElement(el: BoardElement) {
  const plugin = notationRegistry.pluginFor(el)
  const notationSvg = plugin?.renderNode(el, {
    isSelected: selectedIds.has(el.id),
    invScale: 1 / scale,
    isChangedInPreview,
    activeTokenId,
    visibleBottleneckRole,
    darkMode,
  })
  if (notationSvg) return notationSvg
  // generic switch(el.type) unchanged below
  switch (el.type) { ... }
}
```

### 6.2 Edge anchor resolution

```typescript
// BEFORE:
function bpmnEdgeAnchor(el, tx, ty) { switch(el.bpmnNodeType) { ... } }
// called inline in the 'arrow' case

// AFTER:
function resolveEdgeAnchor(el, tx, ty) {
  const plugin = el.edgeRef
    ? notationRegistry.get(el.edgeRef.namespace)
    : notationRegistry.pluginFor(el)
  return plugin?.edgeAnchor(el, tx, ty) ?? defaultBoxAnchor(el, tx, ty)
}
```

### 6.3 Simulation model building

```typescript
// BEFORE:
const createBpmnModel = useCallback(() => { /* 30 lines reading bpmn* fields */ }, [elements])

// AFTER:
const activeNotationPlugin = useRef<NotationPlugin | null>(BpmnPlugin) // or EepcPlugin
const simulationModel = useMemo(
  () => activeNotationPlugin.current?.buildSimulationModel?.(elements) ?? null,
  [elements]
)
```

### 6.4 Derived state (selectedBpmnTask etc.)

```typescript
// BEFORE:
const selectedBpmnTask = useMemo(
  () => selected.length === 1 && selected[0].bpmnNodeType === 'task' ? selected[0] : null,
  [selected]
)

// AFTER:
const selectedNotationElement = useMemo(() => {
  if (selected.length !== 1) return null
  const el = selected[0]
  return notationRegistry.pluginFor(el) ? el : null
}, [selected])
```

### 6.5 Property panel

```typescript
// BEFORE: if (selectedBpmnTask) { /* 80 lines of JSX */ } else if (selectedBpmnFlow) { /* 40 lines */ }

// AFTER:
{selectedNotationElement && (() => {
  const plugin = notationRegistry.pluginFor(selectedNotationElement)
  return plugin?.renderPropertyPanel?.(selectedNotationElement, updateElement, darkMode) ?? null
})()}
```

### 6.6 Element creation (handlePointerDown / bpmnNodeByTool)

```typescript
// BEFORE: hardcoded bpmnNodeType assignment based on active tool
el.bpmnNodeType = toolToBpmnType[activeTool]

// AFTER: active tool carries the ElementSpec from the notation palette
const spec = activeElementSpec.current  // set when user selects from palette
const newElement: BoardElement = {
  ...baseGeometry,
  profileData: { [spec.notationType in BPMN_TYPES ? 'bpmn' : 'eepc']: spec.defaultProfile },
}
```

---

## 7. Yjs Layer Changes

`Y.Array<BoardElement>('elements')` stores full `BoardElement` objects. In Phase 2, each element has `profileData` instead of `bpmn*` fields. The Y.Doc structure does not change — `Y.Array` stores JavaScript objects and Yjs does not introspect field names, so the switch from `bpmnNodeType` to `profileData['bpmn'].nodeType` is transparent to Yjs.

`commitElementUpdate` in `persistence/updates.ts` remains unchanged — it does positional replacement of the full element object.

`Y.Map('profileConfig')` already uses `{ bpmn: ..., [ns]: ... }` — unchanged.

**No Yjs migration needed.** The Yjs doc structure is the same; only the shape of the objects stored in the Y.Array changes.

---

## 8. .mboard2 Format (schemaVersion: 2)

### Changes from v1

| Field | v1 (.mboard) | v2 (.mboard2) |
|---|---|---|
| `format` | `"mboard"` | `"mboard2"` |
| `schemaVersion` | `1` | `2` |
| `nodes[].profileData` | already namespaced under `bpmn` | unchanged |
| `edges[].profileData` | had `bpmn.flowType` etc. | unchanged; `edgeRef` added to DocEdge |
| File extension | `.mboard` | `.mboard2` |
| MIME type | `application/json` | `application/json` |

The on-disk `profileData` format was already clean in v1 — minimal schema change. The main change is the file extension, `format` field, and `schemaVersion`.

### Automatic v1 → v2 migration (industry standard: forward compatibility)

**Decision:** Automatic migration on file open. This follows industry standards (e.g., Excel .xls→.xlsx, AutoCAD DWG versioning) where newer versions transparently upgrade older formats.

When a user opens a `.mboard` (v1) file:
1. Detect `schemaVersion: 1` during schema validation
2. Apply `migrateMboardV1toV2()`:
   - Set `schemaVersion: 2`
   - Set `format: "mboard2"`
   - For each node/edge: if `profileData.bpmn` exists, it's already in the correct shape (v1 on-disk format was already namespaced) — no data transform needed
   - Add `edgeRef` to edges that have `profileData.bpmn.flowType`
3. Show non-blocking toast: "Файл обновлён до формата .mboard2"
4. Mark document as dirty (unsaved changes) so user is prompted to save as `.mboard2`

**Migration is lossless and deterministic.** The v1 on-disk format already used `profileData['bpmn']` — the migration only updates metadata fields, not data structure.

**No breaking change** — Phase 1 files open seamlessly in Phase 2.

### mboard2.ts

New file that replaces the `mboard.ts` "Temporary Phase 1 bridge":
- `serialise(doc: AppDocument): MboardFile2` — uses `plugin.toProfileData(el)` for each element
- `deserialise(raw: unknown): AppDocument` — uses `plugin.fromProfileData(profileData[ns])` for each element
- `MBOARD2_EXTENSION = '.mboard2'`
- Zod schema validation with `schemaVersion: 2` check

---

## 9. Rust NotationEngine Trait

### engine/mod.rs

```rust
use serde::{Serialize, Deserialize};

/// Shared result types (notation-agnostic)
#[derive(Serialize)]
pub struct ValidationResult {
    pub valid: bool,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Serialize)]
pub struct ValidationIssue {
    pub severity: String,   // "error" | "warning"
    pub message: String,
    pub element_id: Option<String>,
}

#[derive(Serialize)]
pub struct RunResult {
    pub completed: bool,
    pub token_path: Vec<String>,
    pub estimated_duration_ms: u64,
    pub estimated_cost: f64,
}

#[derive(Serialize)]
pub struct SimulationResult {
    pub seed: u64,
    pub runs: u32,
    pub min_duration_ms: u64,
    pub mean_duration_ms: u64,
    pub p50_duration_ms: u64,
    pub p90_duration_ms: u64,
    pub p95_duration_ms: u64,
    pub max_duration_ms: u64,
    pub standard_deviation_ms: u64,
    pub mean_cost: f64,
    pub on_time_rate: Option<f64>,
    pub sla_target_ms: Option<u64>,
}

pub trait NotationEngine {
    type Model: for<'de> Deserialize<'de>;

    fn parse(json: &str) -> Result<Self::Model, String>;
    fn validate(model: &Self::Model) -> ValidationResult;
    fn run(model: &Self::Model) -> Result<RunResult, String>;
    fn simulate(model: &Self::Model, seed: u64, runs: u32) -> Result<SimulationResult, String>;
}
```

### lib.rs (shims only after refactor)

```rust
#[wasm_bindgen]
pub fn validate_bpmn(model_json: &str) -> String {
    let result = match BpmnEngine::parse(model_json) {
        Ok(model) => BpmnEngine::validate(&model),
        Err(e) => ValidationResult { valid: false, issues: vec![issue("error", e, None)] },
    };
    serde_json::to_string(&result).unwrap()
}

#[wasm_bindgen]
pub fn run_bpmn(model_json: &str) -> Result<String, JsValue> {
    let model = BpmnEngine::parse(model_json).map_err(js_err)?;
    serde_json::to_string(&BpmnEngine::run(&model).map_err(js_err)?).map_err(js_err)
}

#[wasm_bindgen]
pub fn validate_eepc(model_json: &str) -> String { /* same pattern */ }

#[wasm_bindgen]
pub fn run_eepc(model_json: &str) -> Result<String, JsValue> { /* same pattern */ }
```

---

## 10. eEPC Rust Engine

### engine/eepc/model.rs

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EepcModel {
    pub nodes: Vec<EepcNode>,
    pub flows: Vec<EepcFlow>,
    pub sla_target_ms: Option<u64>,
    pub arrival_classes: Vec<ArrivalClass>,    // reused from shared/types.rs
    pub resource_roles: Vec<ResourceRole>,     // reused
    pub simulation_instances: u32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EepcNode {
    pub id: String,
    pub node_type: EepcNodeType,
    pub name: Option<String>,
    // Only for Function nodes:
    pub duration_ms: Option<u64>,
    pub duration_distribution: DurationDistribution,  // reused from shared
    pub duration_min_ms: Option<u64>,
    pub duration_mode_ms: Option<u64>,
    pub duration_max_ms: Option<u64>,
    pub resource_role: Option<String>,
    pub cost_per_hour: Option<f64>,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum EepcNodeType {
    TriggerEvent, ResultEvent,
    Function,
    AndConnector, OrConnector, XorConnector,
    OrgUnit, ItSystem, InfoObject,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EepcFlow {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub flow_type: EepcFlowType,
    pub probability: Option<f64>,
    pub condition: Option<String>,
}

#[derive(Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum EepcFlowType { ControlFlow, OrgAssignment, InfoFlow }
```

### engine/eepc/validate.rs — validation rules

1. **Alternating structure rule:** Every path must alternate event → function → event. Two consecutive events or two consecutive functions (connected by a controlFlow edge directly) is an error.
2. **Gateway fan-out/fan-in:** AND/OR/XOR connectors must have ≥2 outgoing OR ≥2 incoming controlFlow edges, not both (pure split or pure join, not mixed — except when the same connector acts as both, which some eEPC dialects allow; emit a warning, not an error).
3. **OR-join reachability pre-pass:** For each OR-join connector, compute which predecessors are reachable from the OR-split that opened it. The token runner uses this set to know when all reachable paths have completed.
4. **OrgUnit isolation:** OrgUnit, ItSystem, InfoObject nodes must NOT appear on any controlFlow path. They may only appear as endpoints of orgAssignment or infoFlow edges. Violation = error.
5. **Start/end:** Must have ≥1 TriggerEvent with no incoming controlFlow edges. Must have ≥1 ResultEvent with no outgoing controlFlow edges.

### engine/eepc/runner.rs — token runner differences

- **OrgUnit/ItSystem/InfoObject nodes are skipped** in token scheduling (they are annotations, not flow nodes).
- **OR-join semantics:** Fire when all paths in the reachability set from the matching OR-split have delivered a token. Requires the pre-computed reachability set from validation.
- **No message flows** — all edges are control flow (orgAssignment and infoFlow do not participate in token routing).
- **No pool/lane concept** — EepcModel has no `pool_id`.
- In Phase 2 only `run_eepc` is exposed (single deterministic instance). `simulate_eepc` (Monte Carlo) is deferred to Phase 3.

---

## 11. Test Strategy

### New unit test files

| File | What it tests |
|---|---|
| `src/notation/bpmn/plugin.test.ts` | BpmnPlugin.toProfileData / fromProfileData round-trip; toProfileData → profileData['bpmn'] matches old bpmn* fields exactly |
| `src/notation/bpmn/model.test.ts` | buildSimulationModel() produces correct WASM JSON from profileData |
| `src/notation/eepc/plugin.test.ts` | EepcPlugin round-trip; Function node with durationMs round-trips correctly |
| `src/notation/eepc/model.test.ts` | validate() catches alternating structure violations, OR-join issues |
| `src/notation/registry.test.ts` | pluginFor() returns correct plugin by profileData key; edgeRef routing |
| `src/format/mboard2.test.ts` | serialise/deserialise round-trip for .mboard2; v1 file rejected with clear error |
| `src/format/mboard2.bpmn.test.ts` | BPMN-heavy .mboard2 document round-trips with all BPMN profile fields |
| `src/format/mboard2.eepc.test.ts` | eEPC .mboard2 document round-trips |

### Updated unit tests (will break without change)

| Existing file | What breaks | Fix |
|---|---|---|
| `src/format/mboard.bpmn.test.ts` | Tests bpmn* inline fields on BoardElement | Update to test profileData['bpmn'] |
| `src/format/roundtrip.element.test.ts` | Constructs BoardElement with bpmn* | Update constructors |
| `src/format/data-integrity.test.ts` | Checks field-level BPMN values | Update to use profileData |
| `src/format/fixtures.test.ts` | Opens .mboard fixtures | Update to .mboard2 fixtures (or keep as rejection-test for v1) |
| `src/format/self-consistency.test.ts` | Loads legacy v0-synthetic.mboard | Add v2 self-consistency test |

### New Playwright e2e tests

| File | Scenario |
|---|---|
| `tests/eepc-authoring.spec.ts` | Open blank doc → add TriggerEvent + Function + ResultEvent + controlFlow edges → save as .mboard2 → reload → verify shapes present |
| `tests/eepc-property-panel.spec.ts` | Select Function node → set duration → run token runner → verify completion |
| `tests/eepc-simulation.spec.ts` | Build minimal eEPC (trigger→fn→result) → run simulation → see completed token path |
| `tests/mboard2-file-format.spec.ts` | Save .mboard2 → verify file extension in title bar; try to open .mboard → see rejection toast |
| `tests/notation-switch.spec.ts` | Switch from BPMN mode to eEPC mode → palette changes → can add eEPC elements |
| `tests/cross-notation-history.spec.ts` | Add BPMN elements, checkpoint, add eEPC elements, restore checkpoint → BPMN present, eEPC elements from post-checkpoint absent |

---

## 12. Feature Implementation Order

**Phase 2 scope:** Milestone 1 only (BPMN plugin abstraction). eEPC visual editor and simulation (original M2/M3, features 6-14) are moved to Phase 3.

Dependencies: Strangler-fig pattern for BoardElement migration eliminates the "atomic big-bang" risk. Each feature compiles and passes tests independently.

### Milestone 1: BPMN Plugin Abstraction (Phase 2 complete)

| # | Feature | Depends on | Risk | Notes |
|---|---|---|---|---|
| 1a | **BoardElement dual-write** — add `profileData?: Record<string,unknown>` + `edgeRef?` alongside existing bpmn* fields (do NOT remove old fields). Update constructors to write to both. | — | Low | Strangler-fig step 1: old code still works, new fields populate in parallel |
| 1b | **Incremental call-site migration (batch 1)** — migrate `renderElement` + `bpmnEdgeAnchor` to read from `profileData['bpmn']` instead of bpmn* fields | Feature 1a | Medium | Tests pass after each batch |
| 1c | **Incremental call-site migration (batch 2)** — migrate property panels (~2110-2290) | Feature 1b | Medium | |
| 1d | **Incremental call-site migration (batch 3)** — migrate `createBpmnModel` + derived state (detectedRoles, selectedBpmnTask, etc.) | Feature 1c | Medium | |
| 1e | **Incremental call-site migration (batch 4)** — migrate event handlers (handlePointerDown, applyTemplate, importFromBpmn) | Feature 1d | Medium | |
| 1f | **Remove deprecated fields** — delete bpmn* fields from BoardElement interface, remove dual-write logic | Feature 1e | Low | Strangler-fig step 3: cleanup after all call sites migrated |
| 2 | **NotationRegistry + types** — `src/notation/types.ts`, registry.ts, unit tests | — | Low | Can start in parallel with 1a |
| 3 | **BpmnPlugin module** — extract render/model/panel/palette from App.tsx into `src/notation/bpmn/` | Features 1f, 2 | Medium | Large extract, but all logic already tested |
| 4 | **App.tsx dispatch refactor** — replace remaining inline BPMN logic with `notationRegistry.pluginFor(el)` calls | Feature 3 | Medium | By this point, most BPMN code is already in BpmnPlugin — this is just final wiring |
| 5 | **.mboard2 format + v1 migration** — new schema, serialise/deserialise, automatic v1→v2 migration on file open, .mboard2 extension | Feature 1f | Medium | Lossless migration: v1 profileData already namespaced, just update metadata |

**Total: 10 features** (1a-1f split the old "Feature 1", removed features 6-14)

### Removed from Phase 2 (moved to Phase 3)

The following features are **deferred to Phase 3**:
- eEPC Plugin types + shapes (was Feature 6)
- eEPC palette + authoring tools (was Feature 7)
- eEPC property panel (was Feature 8)
- eEPC .mboard2 round-trip (was Feature 9)
- Rust module reorganization (was Feature 10)
- NotationEngine trait (was Feature 11)
- EepcEngine validator (was Feature 12)
- EepcEngine token runner (was Feature 13)
- eEPC simulation UI (was Feature 14)

Phase 3 will add eEPC as a second notation using the plugin infrastructure built in Phase 2.

### Parallelism opportunities

- Features 1a and 2 can start immediately (no dependencies)
- Features 1b-1e can partially overlap (different files/functions) with careful coordination
- Feature 5 can be developed in parallel with Features 3-4 (different modules)

### Risk mitigation (vs. original plan)

| Original plan | Problem | New approach |
|---|---|---|
| Feature 1: atomic BoardElement migration | ⚠️ High — 22 call sites, all tests break until finished | Features 1a-1f: strangler-fig — each step compiles and passes tests |
| Feature 4: migrate 22 sites in one pass | ⚠️ High — TypeScript compile blocks progress | By Feature 4, most call sites already migrated in 1b-1e — just final wiring |
| eEPC in Phase 2 | Scope creep — Phase 2 becomes 14 features across 3 milestones | Phase 2 = 10 features, 1 milestone (BPMN only). eEPC → Phase 3 |

**Riskiest remaining step:** Feature 3 (BpmnPlugin extract) — large code movement, but mitigated by fact that all logic is already unit-tested and call sites are already migrated by that point.
