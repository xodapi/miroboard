# History snapshot spike

**Decision: proceed with Yjs snapshots.**

The prototype in `src/history/snapshots.test.ts` completes the required pipeline on a
`Y.Doc({ gc: false })`: 199 content edits, snapshot capture, `Y.encodeSnapshot`,
base64 encoding, JSON serialization, base64 decoding, `Y.createDocFromSnapshot`, and
one restore transaction. The restored document contains the first 100 edits, while the
checkpoint remains readable, proving restore is an append-style current-state change
rather than destructive history truncation.

The fallback, periodic normalized full states with structural diffs, is not engaged.
