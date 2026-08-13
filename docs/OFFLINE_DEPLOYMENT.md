# Offline deployment

MiroBoard is distributed as a single self-contained HTML artifact. Build it with:

```powershell
node node_modules\vite\bin\vite.js build
```

Copy `dist/index.html` to an air-gapped workstation and open it directly in
Chrome or Edge (`File > Open File`, or `file:///.../dist/index.html`). No web
server, account, CDN, signaling service, or internet connection is required.
The canvas, toolbar, menus, local persistence, BPMN modelling, and local
simulation run in the browser.

For a local HTTP deployment, serve the `dist` directory on a trusted local
server, for example:

```powershell
node node_modules\vite\bin\vite.js preview --host 127.0.0.1 --port 4173
```

The build uses `vite-plugin-singlefile` and `assetsInlineLimit: 100_000`.
Consequently `dist/index.html` contains the JavaScript, CSS, and WebAssembly
payload inline. Do not split or rewrite the artifact: the offline guarantee
depends on there being no runtime asset fetch.

## Legacy recovery-cache adoption

On its first startup, MiroBoard copies recoverable boards from the old
room-id-keyed browser stores into document-id-keyed recovery caches. The old
IndexedDB stores and `localStorage['board-<roomId>']` values are never deleted.
The adoption index prevents a stale old copy from overwriting later edits to
the new document cache.

Chromium can enumerate old IndexedDB database names, so it can discover every
legacy room in that browser profile. Firefox does not implement
`indexedDB.databases()`, so it can only discover the old room named by the
current `?board=<roomId>` URL and any legacy localStorage fallback. To recover
another Firefox legacy room, open the old URL once with its `?board=` value,
then reopen MiroBoard. If that URL is unavailable, use Firefox Storage
Inspector to locate the old IndexedDB database or `board-<roomId>` localStorage
value, retain a copy, and open the board with `?board=<roomId>` to trigger the
non-destructive adoption.

Collaboration, shared cursors, accounts, and remote synchronization are not
available in the air-gapped build. This package is tested on desktop Chromium;
other browsers may have different limits for local browser storage.
