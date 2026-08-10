# E2E runs on Windows

Playwright does not own the Vite preview process on Windows because its teardown can
hang indefinitely. Build first, then run the `test:e2e` command in the canonical
mission `services.yaml`; it starts preview on port 4173, runs the suite, and stops the
listener by port even when the suite fails.

Do not run `node node_modules\playwright\cli.js test` directly on Windows unless you
have already started the preview server through the manifest and will stop it by port.
