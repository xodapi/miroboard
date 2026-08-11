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

## Capability gaps

The current M1 build does not yet implement portable `.mboard` save/open
operations. Its persistence is limited to the browser's local IndexedDB
recovery cache, so edits can be recovered in the same browser profile but
cannot be exported or moved between machines through this build. File System
Access and download/file-input workflows are planned for M3 and must not be
assumed to be available in M1.

Collaboration, shared cursors, accounts, and remote synchronization are not
available in the air-gapped build. This package is tested on desktop Chromium;
other browsers may have different limits for local browser storage.
