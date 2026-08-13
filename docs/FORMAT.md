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
