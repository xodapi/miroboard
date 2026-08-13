# MiroBoard document format

## Schema-version semantics

`.mboard` documents identify themselves with `format: "mboard"` and an integer
`schemaVersion`. Version 1 is the currently supported version. A higher version is
refused without partially loading it, while zero, negative, fractional, string, and
null versions are invalid. This prevents coercion from treating `"1"` as version 1.

Malformed JSON is invalid input. Validation is total: it returns a typed failure
instead of throwing, so callers can leave an already-open board unchanged.

## Structural integrity policy

Version 1 rejects the entire document when its graph structure is ambiguous or
unsafe. `loadMboard` returns `kind: "invalid"` with all applicable, path-specific
errors; it does not partially repair a document or silently discard content.

- `nodes[].profileData` must be an object. A string or array is invalid. When
  present, `profileData.bpmn` must also be an object, never `null`. This prevents
  BPMN readers from receiving a null payload and attempting undefined field access.
- Every edge endpoint must reference the id of a node in the same document.
  Unknown `source.nodeId` and `target.nodeId` values reject the document, so no
  dangling edge can render at the origin or be saved back out.
- Node IDs must be unique. Duplicate IDs reject the document rather than binding
  edges ambiguously or applying a silent last-write-wins rule.

These rejection rules apply uniformly to all documents, including each of the six
legacy BPMN fixtures. Valid fixtures therefore load without structural warnings.

## Adapter canonicalisation (temporary Phase 1 bridge)

`src/format/mboard.ts` is the temporary bridge between the frozen in-memory
`BoardElement` and the v1 graph document. It will be deleted in Phase 3, when the
in-memory model adopts the document representation.

- Optional `BoardElement` fields that are `undefined` are omitted. `null` is reserved
  for required nullable structural fields such as `frame.w`, `frame.h`, `style.fill`,
  and `style.stroke`.

### Null and falsy value policy

The format preserves explicit `null` values everywhere they are accepted, while
`undefined` properties are omitted. Required nullable structural fields are always
written explicitly as `null` (for example `frame.w`, `frame.h`, `style.fill`, and
`style.stroke`), so their absence is never confused with a null value. Empty strings,
empty arrays, `0`, negative numbers, large integers, fractions, and `false` are real
values and are never treated as missing. The normaliser rejects cyclic objects with
`Cannot normalise cyclic structure` rather than recursing indefinitely.
- `parentId` is always written as `null` and top-level `assets` is always `{}` in v1.
  Containers and assets are not supported yet.
- A `bpmnFlow` becomes an edge. `sourceId` and `targetId` are structural endpoints;
  `flowType`, `condition`, `probability`, and `isDefault` are nested under
  `profileData.bpmn`. Arrows and lines without `bpmnFlow` remain nodes.
- A node is treated as BPMN only when it carries `profileData.bpmn`. Such a node must
  contain `nodeType`; validation reports both its id and `nodeType` when it is absent.
  All other BPMN fields are optional and stay absent when unspecified.
- `profileData: {}` is the v1 canonical representation for non-BPMN nodes and edges.
  In particular, a non-BPMN element must never gain `profileData.bpmn: {}`.

### Unknown-data preservation

Version 1 chooses the **preserve** branch for forward compatibility. Unknown keys
at the document root, on nodes and edges, inside `profileData.bpmn`, and complete
unknown `profileData` namespaces are retained byte-for-byte in a load → save
cycle. The adapter overlays recognised fields on the original opaque payload, so
an older client can update known geometry without destroying newer profile data.
Undefined object properties are omitted by canonicalisation; explicit `null`,
`false`, zero, empty strings, arrays, and nested objects are retained. Only the
reserved v1 `assets` value is canonicalised to `{}`.

`normalise` sorts nodes and edges by `id`, sorts every object’s keys, omits
undefined values, and rounds coordinate values (including frame, points, and
waypoints) to four decimal places. Other numeric values are not rounded.

### Round-trip projection and routed edges

The element round-trip property compares `fromDoc(toDoc(element))` through the
exported `canonicalElement()` projection. Nodes retain every renderer- and
profile-visible field; an omitted rotation is equivalent to `rotation: 0`, and
an omitted z-index is equivalent to `zIndex: 0`. BPMN flow elements are rendered
from their endpoints, so their in-memory `x` and `y` are canonicalised to zero,
and node-only fields (`w`, `h`, `fill`, `points`, `emoji`, `createdBy`, and
`zIndex`) are not part of an edge's projection. This is the complete documented
lossy projection, not a general-purpose field filter.

Edges may carry `waypoints` and `content.offset`; both are preserved exactly
through adapter conversion and represent manually routed geometry and label
placement. Coordinate normalisation still applies only when `normalise()` is
explicitly called.

## Profiles and simulation configuration

## Save/load self-consistency regression gate

Every document emitted by `serialise()` is immediately passed through
`loadMboard()` in `src/format/self-consistency.test.ts`. The permanent test
inventory is the six shipped learning modules:

1. `examples/basic-fixed.json`
2. `examples/batch-workload.json`
3. `examples/fifo-vs-priority.json`
4. `examples/parallel-queue.json`
5. `examples/priority-queue.json`
6. `examples/sla-calendar.json`

The inventory also includes `all-element-types-board`, a hand-built document
covering path, sticky, rect, circle, arrow, line, text, emoji, a BPMN task, and
a connector. Each document is serialised, JSON encoded, validated, deserialised,
and serialised again; validation must succeed at both save boundaries and no
console error may be emitted.

`meta.profiles` is derived on every save, never trusted from React state. It is
`["core"]`, plus `"bpmn"` when any node or edge has a `profileData.bpmn`
namespace, regardless of array ordering. `profileConfig` is namespaced document
configuration. The app stores `profileConfig.bpmn.simulation` in the Y.Doc
`getMap("profileConfig")` shared type, preserving the UI's string values (including
leading zeroes), arrival-class order, and role policies.

The app activates BPMN affordances only when a valid `profileConfig.bpmn.simulation`
exists. A document with BPMN element data but absent or non-BPMN profileConfig is
therefore opened deterministically in core/board mode with BPMN affordances hidden,
rather than entering a partially enabled mode. Choosing the BPMN palette explicitly
creates the default BPMN simulation configuration and activates the profile.
Document identity is likewise stored in the Y.Doc `getMap("meta")`, allowing the
IndexedDB recovery state to retain identity even if the app crashes.
