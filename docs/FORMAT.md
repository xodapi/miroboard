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

## Profiles and simulation configuration

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
