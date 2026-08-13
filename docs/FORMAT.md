# MiroBoard document format

## Schema-version semantics

`.mboard` documents identify themselves with `format: "mboard"` and an integer
`schemaVersion`. Version 1 is the currently supported version. A higher version is
refused without partially loading it, while zero, negative, fractional, string, and
null versions are invalid. This prevents coercion from treating `"1"` as version 1.

Malformed JSON is invalid input. Validation is total: it returns a typed failure
instead of throwing, so callers can leave an already-open board unchanged.
