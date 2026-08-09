#!/usr/bin/env bash
# Mission initialization script for MiroBoard
# Runs once at the start of each worker session

set -e

echo "=== MiroBoard Mission Init ==="

# Install dependencies if node_modules is missing or stale
if [ ! -d "node_modules" ] || [ "package-lock.json" -nt "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm ci
fi

# Build WASM if needed
if [ ! -f "src/wasm/board-core/board_core_bg.wasm" ] || [ "wasm/board-core/src/lib.rs" -nt "src/wasm/board-core/board_core_bg.wasm" ]; then
    echo "Building Rust/WASM core..."
    cd wasm/board-core
    wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
    cd ../..
fi

echo "=== Init complete ==="
