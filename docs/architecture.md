# MiroBoard — Техническая архитектура / Technical Architecture

**Phase 1**

---

## 🇷🇺 Архитектура

### Обзор

MiroBoard Phase 1 — полностью офлайн-приложение, работающее как единый HTML-файл (`dist/index.html`) по протоколу `file://`. Весь сетевой стек (WebRTC, Yjs-сигнализация) удалён. Данные хранятся локально: в файлах `.mboard` и в IndexedDB.

---

### Диаграмма компонентов

```
┌─────────────────────────────────────────────────────────────────────┐
│                         dist/index.html                             │
│                    (file:// — без сервера)                          │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                        App.tsx (~2531 строк)                 │   │
│  │                                                              │   │
│  │  ┌─────────────────┐   ┌──────────────────────────────────┐  │   │
│  │  │  BPMN Canvas    │   │       Simulation Panel           │  │   │
│  │  │  (miro-board)   │   │  (profileConfig / WASM runner)   │  │   │
│  │  └────────┬────────┘   └──────────────┬───────────────────┘  │   │
│  │           │                           │                       │   │
│  │  ┌────────▼───────────────────────────▼───────────────────┐  │   │
│  │  │                   Yjs Document (ydoc)                   │  │   │
│  │  │              gc:false — полная история                  │  │   │
│  │  └────────┬──────────────────────────────────┬────────────┘  │   │
│  │           │                                  │               │   │
│  │  ┌────────▼────────┐              ┌──────────▼─────────────┐ │   │
│  │  │  History System │              │   Persistence Layer    │ │   │
│  │  │  src/history/   │              │   src/persistence/     │ │   │
│  │  │                 │              │                        │ │   │
│  │  │ • snapshots.ts  │              │ • files.ts  (FSA+Blob) │ │   │
│  │  │ • state.ts      │              │ • dirty.ts             │ │   │
│  │  │ • retention.ts  │              │ • indexeddb.ts         │ │   │
│  │  │ • capture-      │              │ • drop.ts              │ │   │
│  │  │   triggers.ts   │              │ • recovery-session.ts  │ │   │
│  │  └────────┬────────┘              └──────────┬─────────────┘ │   │
│  │           │                                  │               │   │
│  │  ┌────────▼────────┐              ┌──────────▼─────────────┐ │   │
│  │  │  TimelinePanel  │              │      IndexedDB         │ │   │
│  │  │  + Preview      │              │  mboard-doc-<fp>       │ │   │
│  │  │  Banner         │              │  (имя файла + fingerp.)│ │   │
│  │  └─────────────────┘              └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Format Layer  src/format/                       │   │
│  │  types.ts · schema.ts · mboard.ts · migrations.ts            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              WASM Layer  src/wasm/  (Rust → WASM)            │   │
│  │  Token runner · Monte Carlo · Метрики · Ресурсы              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Формат файла `.mboard` (схема v1)

```
.mboard (JSON)
├── version          — версия схемы
├── yjsState         — base64-кодированный Yjs update (состояние доски)
├── profileConfig    — конфиг симуляции (arrival classes, ресурсы и т.д.)
├── checkpoints[]    — история точек восстановления
│   ├── id
│   ├── kind         — 'auto' | 'named' | 'restore-transition'
│   ├── label
│   ├── timestamp
│   └── yjsState     — снимок состояния в этой точке
└── metadata         — имя файла, дата создания и т.д.
```

Миграции схемы: `src/format/migrations.ts`.  
Типы: `src/format/types.ts`, `src/format/schema.ts`, `src/format/mboard.ts`.

---

### Поток данных: открытие файла

```
Пользователь выбирает .mboard
          │
          ▼
  files.ts (FSA API)
  └─ нет поддержки FSA → Blob fallback
          │
          ▼
  Чтение JSON → migrations.ts
  (поднятие схемы при необходимости)
          │
          ▼
  snapshots.ts:
  Y.applyUpdate(ydoc, fromBase64(yjsState), RECOVERY_ORIGIN)
          │
          ├──► dirty.ts: profileConfigJsonRef = profileConfig из файла
          │             dirty = false
          │
          ├──► indexeddb.ts: кэш recovery (mboard-doc-<fingerprint>)
          │                  сохранить имя файла + fingerprint
          │
          └──► App.tsx: hydration guard симуляции
                       (проверить profileConfig перед открытием modal)
```

**Обнаружение расхождения**: при открытии файла, если в IndexedDB найден кэш с тем же ключом, но другим fingerprint, `recovery-session.ts` показывает уведомление: _«Восстановлено из локального кэша: файл отстаёт»_.

---

### Поток данных: сохранение файла

```
Пользователь нажимает «Сохранить»
          │
          ▼
  capture-triggers.ts:
  автоматический pre-save checkpoint
          │
          ▼
  mboard.ts: собрать JSON
  ├── version
  ├── yjsState = toBase64(Y.encodeStateAsUpdate(ydoc))
  ├── profileConfig (всё состояние симуляции)
  ├── checkpoints (после применения retention.ts)
  └── metadata
          │
          ▼
  files.ts: записать через FSA handle
  └─ нет handle → Blob download
          │
          ▼
  indexeddb.ts: обновить recovery-кэш
  dirty.ts: dirty = false
```

---

### Поток данных: восстановление из истории

```
Пользователь выбирает checkpoint в TimelinePanel
          │
          ▼
  capture-triggers.ts: pre-restore checkpoint
  (kind = 'restore-transition', защищён retention)
          │
          ▼
  HistoryPreviewBanner.tsx появляется:
  — симуляция отключена (previewSnapshot guard в App.tsx)
  — блокировка редактирования
          │
          ▼
  Пользователь подтверждает восстановление
          │
          ▼
  snapshots.ts:
  Y.applyUpdate(ydoc, fromBase64(checkpoint.yjsState), RECOVERY_ORIGIN)
  — «append not overwrite»: история сохраняется, апдейт добавляется
          │
          ▼
  dirty.ts: dirty = true
  capture-triggers.ts: авто-checkpoint после восстановления
  HistoryPreviewBanner.tsx скрывается
```

> **Инвариант**: константа `RECOVERY_ORIGIN` используется во всех вызовах `Y.applyUpdate`, связанных с восстановлением, чтобы отличить их от пользовательских правок.

---

### Слой симуляции (Rust/WASM)

| Параметр | Значение |
|---|---|
| Движок | Rust → WASM (`src/wasm/`) |
| Прогоны Monte Carlo | 500, seed 42 (детерминированно) |
| Метрики | Min / Mean / σ / P50 / P90 / P95 / Max |
| Поддержка | AND split/join, XOR branching |
| Ресурсы | Arrival classes, capacity, FIFO/Priority |
| Step limit guard | `nodes × flows × 4 × instances` переходов |
| Отключение | При `previewSnapshot !== null` |

Весь конфиг симуляции сериализуется в `profileConfig` перед открытием модального окна, что сохраняет arrival classes между сессиями.

---

### Система истории

| Компонент | Роль |
|---|---|
| `Yjs gc:false` | Сохраняет полную историю апдейтов |
| `Y.snapshot` | Снимки для просмотра в конкретный момент |
| `capture-triggers.ts` | Авто-checkpoint: каждые 50 правок, каждые 5 мин, pre-save, pre-restore |
| `retention.ts` | Сохраняет все `named` + `restore-transition`; обрезает `auto` |
| `state.ts` | CheckpointKind: `'auto' \| 'named' \| 'restore-transition'` |
| `TimelinePanel.tsx` | UI скруббера с режимом предпросмотра |
| `HistoryPreviewBanner.tsx` | Баннер во время предпросмотра |

---

### Слой персистентности

| Файл | Ответственность |
|---|---|
| `files.ts` | File System Access API + Blob fallback |
| `dirty.ts` | Dirty-флаг; инициализация `profileConfigJsonRef` при загрузке |
| `indexeddb.ts` | Recovery-кэш; ключи `mboard-doc-<fingerprint>`; хранит имя файла и fingerprint для обнаружения расхождений |
| `drop.ts` | Drag-and-drop обработка |
| `recovery-session.ts` | Уведомление о расхождении кэша и файла |

---

### Ключевые инварианты

1. **`RECOVERY_ORIGIN`** — константа, передаваемая origin во все `Y.applyUpdate` при восстановлении; отличает восстановление от пользовательских правок.
2. **`profileConfig` перед открытием modal** — вся конфигурация симуляции сериализуется заранее; arrival classes не теряются.
3. **`restore-transition` checkpoints** — никогда не удаляются retention policy.
4. **IndexedDB fingerprint** — SHA-256-подобный хэш содержимого файла; `mboard-doc-<fingerprint>`.
5. **Restore = append** — восстановление чекпоинта добавляет Yjs-апдейт к истории, не перезаписывает её.

---

---

## 🇬🇧 Architecture

### Overview

MiroBoard Phase 1 is a fully offline application distributed as a single HTML file (`dist/index.html`) that runs over `file://`. All networking (WebRTC, Yjs signaling) has been removed. Data lives locally in `.mboard` files and IndexedDB.

---

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         dist/index.html                             │
│                    (file:// — no server required)                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     App.tsx (~2531 lines)                    │   │
│  │                                                              │   │
│  │  ┌─────────────────┐   ┌──────────────────────────────────┐  │   │
│  │  │  BPMN Canvas    │   │       Simulation Panel           │  │   │
│  │  │  (miro-board)   │   │  (profileConfig / WASM runner)   │  │   │
│  │  └────────┬────────┘   └──────────────┬───────────────────┘  │   │
│  │           │                           │                       │   │
│  │  ┌────────▼───────────────────────────▼───────────────────┐  │   │
│  │  │                   Yjs Document (ydoc)                   │  │   │
│  │  │              gc:false — full update history             │  │   │
│  │  └────────┬──────────────────────────────────┬────────────┘  │   │
│  │           │                                  │               │   │
│  │  ┌────────▼────────┐              ┌──────────▼─────────────┐ │   │
│  │  │  History System │              │   Persistence Layer    │ │   │
│  │  │  src/history/   │              │   src/persistence/     │ │   │
│  │  │                 │              │                        │ │   │
│  │  │ • snapshots.ts  │              │ • files.ts  (FSA+Blob) │ │   │
│  │  │ • state.ts      │              │ • dirty.ts             │ │   │
│  │  │ • retention.ts  │              │ • indexeddb.ts         │ │   │
│  │  │ • capture-      │              │ • drop.ts              │ │   │
│  │  │   triggers.ts   │              │ • recovery-session.ts  │ │   │
│  │  └────────┬────────┘              └──────────┬─────────────┘ │   │
│  │           │                                  │               │   │
│  │  ┌────────▼────────┐              ┌──────────▼─────────────┐ │   │
│  │  │  TimelinePanel  │              │      IndexedDB         │ │   │
│  │  │  + Preview      │              │  mboard-doc-<fp>       │ │   │
│  │  │  Banner         │              │  (filename + fingerp.) │ │   │
│  │  └─────────────────┘              └────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Format Layer  src/format/                       │   │
│  │  types.ts · schema.ts · mboard.ts · migrations.ts            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              WASM Layer  src/wasm/  (Rust → WASM)            │   │
│  │  Token runner · Monte Carlo · Metrics · Resources            │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

### `.mboard` File Format (v1 schema)

```
.mboard (JSON)
├── version          — schema version
├── yjsState         — base64-encoded Yjs update (board state)
├── profileConfig    — simulation config (arrival classes, resources, etc.)
├── checkpoints[]    — history checkpoint array
│   ├── id
│   ├── kind         — 'auto' | 'named' | 'restore-transition'
│   ├── label
│   ├── timestamp
│   └── yjsState     — point-in-time state snapshot
└── metadata         — filename, creation date, etc.
```

Schema migrations: `src/format/migrations.ts`.  
Type definitions: `src/format/types.ts`, `src/format/schema.ts`, `src/format/mboard.ts`.

---

### Data Flow: File Open

```
User picks a .mboard file
          │
          ▼
  files.ts (FSA API)
  └─ FSA unavailable → Blob fallback
          │
          ▼
  Parse JSON → migrations.ts
  (upgrade schema if needed)
          │
          ▼
  snapshots.ts:
  Y.applyUpdate(ydoc, fromBase64(yjsState), RECOVERY_ORIGIN)
          │
          ├──► dirty.ts: profileConfigJsonRef = profileConfig from file
          │             dirty = false
          │
          ├──► indexeddb.ts: write recovery cache (mboard-doc-<fingerprint>)
          │                  store filename + fingerprint
          │
          └──► App.tsx: simulation hydration guard
                       (validate profileConfig before opening modal)
```

**Divergence detection**: on file open, if IndexedDB holds a cached entry under the same key but a different fingerprint, `recovery-session.ts` shows the notice: _"Восстановлено из локального кэша: файл отстаёт"_ ("Restored from local cache: file is behind").

---

### Data Flow: File Save

```
User triggers Save
          │
          ▼
  capture-triggers.ts:
  auto pre-save checkpoint
          │
          ▼
  mboard.ts: assemble JSON
  ├── version
  ├── yjsState = toBase64(Y.encodeStateAsUpdate(ydoc))
  ├── profileConfig (full simulation state)
  ├── checkpoints (after retention.ts policy applied)
  └── metadata
          │
          ▼
  files.ts: write via FSA handle
  └─ no handle → Blob download
          │
          ▼
  indexeddb.ts: update recovery cache
  dirty.ts: dirty = false
```

---

### Data Flow: History Restore

```
User selects a checkpoint in TimelinePanel
          │
          ▼
  capture-triggers.ts: pre-restore checkpoint
  (kind = 'restore-transition', protected by retention)
          │
          ▼
  HistoryPreviewBanner.tsx appears:
  — simulation disabled (previewSnapshot guard in App.tsx)
  — editing blocked
          │
          ▼
  User confirms restore
          │
          ▼
  snapshots.ts:
  Y.applyUpdate(ydoc, fromBase64(checkpoint.yjsState), RECOVERY_ORIGIN)
  — "append not overwrite": existing history is preserved; update is appended
          │
          ▼
  dirty.ts: dirty = true
  capture-triggers.ts: auto checkpoint after restore
  HistoryPreviewBanner.tsx dismissed
```

> **Invariant**: the `RECOVERY_ORIGIN` constant is passed as the origin in every recovery-related `Y.applyUpdate` call so that recovery operations can be distinguished from user edits.

---

### Simulation Layer (Rust/WASM)

| Parameter | Value |
|---|---|
| Engine | Rust → WASM (`src/wasm/`) |
| Monte Carlo runs | 500, seed 42 (deterministic) |
| Metrics | Min / Mean / σ / P50 / P90 / P95 / Max |
| Supported semantics | AND split/join, XOR branching |
| Resources | Arrival classes, capacity, FIFO/Priority queue discipline |
| Step limit guard | `nodes × flows × 4 × instances` transitions |
| Disabled when | `previewSnapshot !== null` |

All simulation state is serialized into `profileConfig` before the modal opens, ensuring arrival classes survive between sessions.

---

### History System

| Component | Role |
|---|---|
| `Yjs gc:false` | Preserves full update history in the document |
| `Y.snapshot` | Point-in-time views for preview mode |
| `capture-triggers.ts` | Auto-checkpoint: every 50 edits, every 5 min, pre-save, pre-restore |
| `retention.ts` | Keeps all `named` + `restore-transition`; trims `auto` checkpoints |
| `state.ts` | CheckpointKind: `'auto' \| 'named' \| 'restore-transition'` |
| `TimelinePanel.tsx` | Scrubber UI with preview mode |
| `HistoryPreviewBanner.tsx` | Banner shown during preview; disables simulation |

---

### Persistence Layer

| File | Responsibility |
|---|---|
| `files.ts` | File System Access API with Blob fallback |
| `dirty.ts` | Dirty flag; initializes `profileConfigJsonRef` on load |
| `indexeddb.ts` | Recovery cache; keys `mboard-doc-<fingerprint>`; stores filename and fingerprint for divergence detection |
| `drop.ts` | Drag-and-drop file handling |
| `recovery-session.ts` | Divergence notice between cache and on-disk file |

---

### Key Invariants

1. **`RECOVERY_ORIGIN`** — constant passed as origin to all recovery `Y.applyUpdate` calls; distinguishes recovery from user edits.
2. **`profileConfig` before modal open** — full simulation config serialized in advance; arrival classes are never lost.
3. **`restore-transition` checkpoints** — exempt from retention trimming; never auto-deleted.
4. **IndexedDB fingerprint** — SHA-256-like hash of file content; key format `mboard-doc-<fingerprint>`.
5. **Restore = append** — restoring a checkpoint appends a Yjs update to the document history rather than replacing it.
