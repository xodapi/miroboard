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

- File System Access save/open features depend on browser support. Browsers
  without that API use the download and file-input fallbacks.
- A `file://` page has browser-specific restrictions around native file
  pickers and persistent storage. Save the downloaded `.mboard` document
  explicitly and reopen it when moving between machines.
- Collaboration, shared cursors, accounts, and remote synchronization are not
  available in the air-gapped build. Documents must be exchanged as `.mboard`
  files.
- This package is tested on desktop Chromium. Other browsers may provide only
  the fallback file workflows.
