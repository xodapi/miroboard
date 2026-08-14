# Contributing to MiroBoard

## 🇷🇺 Для разработчиков

### Требования

- Node.js v24
- npm 11
- Rust 1.97+
- wasm-pack 0.13+

### Установка

```bash
npm install
```

### Команды разработки

| Команда | Описание |
|---------|----------|
| `node node_modules\vite\bin\vite.js preview --port 4173` | Запуск dev-сервера |
| `node node_modules\vite\bin\vite.js build` | Сборка (`dist/index.html`) |
| `node node_modules\typescript\bin\tsc --noEmit` | Проверка типов |
| `node node_modules\eslint\bin\eslint.js src/` | Линтинг |
| `node node_modules\vitest\vitest.mjs run` | Юнит-тесты |
| `node node_modules\playwright\cli.js test` | E2E-тесты |

#### Пересборка Rust/WASM

Нужна **только** при изменении `src/wasm-src/lib.rs`:

```bash
wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
```

Результат компилируется в `src/wasm/board-core/`. Не коммитьте пересобранные WASM-артефакты без изменений в `lib.rs`.

### Структура проекта

```
src/
  format/        # сериализация/десериализация формата файлов
  history/       # CRDT-история на базе Yjs (gc:false, Y.snapshot)
  persistence/   # File System Access API + IndexedDB (офлайн-хранилище)
  wasm/          # скомпилированный движок симуляции (Rust/WASM)
  wasm-src/      # исходники Rust
tests/           # Playwright e2e-тесты
dist/            # результат сборки (один файл index.html)
```

### Соглашения по коду

**TDD — обязательно.** Перед реализацией новой функциональности:

1. Напишите Playwright e2e-тест в `tests/`.
2. Напишите Vitest юнит-тест рядом с модулем.
3. Убедитесь, что тесты падают на пустой реализации, затем реализуйте.

**Конфигурации Playwright:**

- `playwright.config.ts` — стандартный прогон
- `playwright.debug.config.ts` — отладочный прогон (медленнее, с трассировкой)

**Yjs / история:**

- `gc: false` — отключён сборщик мусора, чтобы сохранялись все удалённые операции для истории.
- Используйте `Y.snapshot` для сохранения/восстановления точек истории.
- Не включайте GC и не меняйте механизм истории без осознанного понимания последствий.

**Офлайн-первый подход:**

- Приложение намеренно работает без сети. WebRTC и любая коллаборация **удалены** и **не должны возвращаться**.
- Персистентность реализована через File System Access API (основной путь) и IndexedDB (запасной).

**Сборка — один файл:**

- `dist/index.html` — единственный артефакт сборки. Убедитесь, что сборка не начинает генерировать дополнительные файлы.

### Процесс Pull Request

1. Форкните репозиторий и создайте ветку от `main`.
2. Напишите тесты до реализации (см. TDD выше).
3. Убедитесь, что всё проходит:
   ```bash
   node node_modules\typescript\bin\tsc --noEmit
   node node_modules\eslint\bin\eslint.js src/
   node node_modules\vitest\vitest.mjs run
   node node_modules\playwright\cli.js test
   ```
4. Опишите изменения в PR: что, зачем, как тестировалось.
5. Целевая ветка: `main` → `https://github.com/xodapi/miroboard.git`

### Известные особенности

- **ESLint: `react-refresh/only-export-components` в `TimelinePanel.tsx`** — известное предупреждение, не блокирует сборку и не требует исправления.
- **WASM не пересобирается автоматически** — если изменили `src/wasm-src/lib.rs`, запустите `wasm-pack` вручную (команда выше).
- **Node.js v24 обязателен** — более старые версии могут не поддерживать используемые API.

---

## 🇬🇧 For contributors

### Requirements

- Node.js v24
- npm 11
- Rust 1.97+
- wasm-pack 0.13+

### Setup

```bash
npm install
```

### Development commands

| Command | Description |
|---------|-------------|
| `node node_modules\vite\bin\vite.js preview --port 4173` | Start dev server |
| `node node_modules\vite\bin\vite.js build` | Build (`dist/index.html`) |
| `node node_modules\typescript\bin\tsc --noEmit` | Type check |
| `node node_modules\eslint\bin\eslint.js src/` | Lint |
| `node node_modules\vitest\vitest.mjs run` | Unit tests |
| `node node_modules\playwright\cli.js test` | E2E tests |

#### Rebuilding Rust/WASM

Only needed when `src/wasm-src/lib.rs` changes:

```bash
wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
```

Output lands in `src/wasm/board-core/`. Do not commit rebuilt WASM artifacts without a corresponding change to `lib.rs`.

### Project structure

```
src/
  format/        # file format serialization / deserialization
  history/       # Yjs-based CRDT history (gc:false, Y.snapshot)
  persistence/   # File System Access API + IndexedDB (offline storage)
  wasm/          # compiled simulation engine (Rust/WASM)
  wasm-src/      # Rust source
tests/           # Playwright e2e tests
dist/            # build output (single index.html)
```

### Coding conventions

**TDD is required.** Before implementing new functionality:

1. Write a Playwright e2e test in `tests/`.
2. Write a Vitest unit test alongside the module.
3. Confirm the tests fail against an empty implementation, then implement.

**Playwright configurations:**

- `playwright.config.ts` — normal run
- `playwright.debug.config.ts` — debug run (slower, with tracing)

**Yjs / history:**

- `gc: false` keeps deleted operations alive so the history layer can reconstruct past states.
- Use `Y.snapshot` to capture and restore history checkpoints.
- Do not enable GC or rework the history mechanism without fully understanding the consequences.

**Offline-first:**

- The app is intentionally network-free. WebRTC and all collaboration features were **deliberately removed** and must **not be re-added**.
- Persistence is handled via the File System Access API (primary) and IndexedDB (fallback).

**Single-file build:**

- `dist/index.html` is the only build artifact. Verify that your changes do not cause the build to emit additional files.

### Pull request process

1. Fork the repository and branch off `main`.
2. Write tests before implementation (see TDD above).
3. Ensure everything passes:
   ```bash
   node node_modules\typescript\bin\tsc --noEmit
   node node_modules\eslint\bin\eslint.js src/
   node node_modules\vitest\vitest.mjs run
   node node_modules\playwright\cli.js test
   ```
4. Describe the change in the PR: what, why, how it was tested.
5. Target branch: `main` on `https://github.com/xodapi/miroboard.git`

### Known gotchas

- **ESLint: `react-refresh/only-export-components` in `TimelinePanel.tsx`** — known warning, non-blocking, no fix needed.
- **WASM is not rebuilt automatically** — if you edited `src/wasm-src/lib.rs`, run `wasm-pack` manually (command above).
- **Node.js v24 is required** — older versions may lack the APIs this project depends on.
