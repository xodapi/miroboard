# От MiroBoard к ProcessGraph: Roadmap
# From MiroBoard to ProcessGraph: Roadmap

> **RU:** Проект эволюционирует от BPMN-редактора к открытой платформе для многонотационного моделирования процессов — offline-first, file-based, extensible.
>
> **EN:** The project evolves from a BPMN editor into an open platform for multi-notation process modeling — offline-first, file-based, extensible.

---

## Часть 1 / Part 1: MiroBoard — Phase 1 ✅ Завершено / Completed

**RU:** Первая фаза завершена. MiroBoard — полнофункциональный offline BPMN-редактор с симуляцией и историей изменений.

**EN:** Phase 1 is complete. MiroBoard is a fully functional offline BPMN editor with simulation and change history.

| Возможность / Feature | Статус / Status |
|---|---|
| Offline-first single-file build (`dist/index.html`) | ✅ |
| Формат `.mboard`: BPMN + history + simulation в одном файле | ✅ |
| BPMN 2.0 visual editor | ✅ |
| Monte Carlo simulation (500 runs, seed-deterministic, Rust/WASM) | ✅ |
| In-document history: auto + named checkpoints, timeline, restore-as-append | ✅ |
| File System Access API + IndexedDB recovery + drag-drop | ✅ |
| 254/254 assertions passed, 148 unit tests, 88 Playwright e2e tests | ✅ |

---

## Часть 2 / Part 2: MiroBoard — Phase 2 (Refactoring)

**Цель / Goal:**
- **RU:** Абстракция графового ядра под plugin-систему. MiroBoard остаётся стабильным BPMN-редактором, но получает расширяемую архитектуру, которая ляжет в основу ProcessGraph.
- **EN:** Abstract the graph core behind a plugin system. MiroBoard remains a stable BPMN editor but gains an extensible architecture that will underpin ProcessGraph.

**Timeline: Q3 2026**

| Задача / Task | Статус / Status |
|---|---|
| `NotationPlugin` interface (`render`, `validate`, `serialize`, `simulate`) | 📋 Planned |
| BPMN extracted as first plugin (`BpmnPlugin`) | 📋 Planned |
| Strangler-fig migration of `BoardElement` (dual-write → migrate → cleanup) | 📋 Planned |
| Формат `.mboard2` с автомиграцией `v1 → v2` | 📋 Planned |
| Plugin registry (hot-swap notations) | 📋 Planned |

**RU:** Подход strangler-fig обеспечивает плавную миграцию без поломки существующих файлов `.mboard v1`.

**EN:** The strangler-fig approach ensures a smooth migration without breaking existing `.mboard v1` files.

---

## Часть 2.5 / Part 2.5: MiroBoard — Phase 2.1 (Mindmap Mode) - Q4 2026

| Feature | Status |
|---|---|
| Node-based mindmap visualization (tree/radial layout) | 📋 Planned |
| Click node → Markdown editor panel | 📋 Planned |
| File attachments embedded in .mboard | 📋 Planned |
| Collapsible branches | 📋 Planned |
| Export to Markdown hierarchy | 📋 Planned |

**RU:** Режим ментальных карт для структурирования идей. Каждый узел содержит Markdown-контент и вложения.

**EN:** Mindmap mode for structuring ideas. Each node contains Markdown content and attachments.

---

## Часть 2.6 / Part 2.6: MiroBoard — Phase 2.2 (Digital Gardens) - Q1 2027

| Feature | Status |
|---|---|
| Wiki-like pages with `[[wikilinks]]` | 📋 Planned |
| Bidirectional backlinks | 📋 Planned |
| Graph view of connected pages | 📋 Planned |
| Full-text search across pages | 📋 Planned |
| Export to static HTML wiki | 📋 Planned |

**RU:** Цифровой сад — личная wiki для накопления знаний с визуализацией связей между страницами.

**EN:** Digital garden — personal wiki for knowledge accumulation with page connection visualization.

---

## Часть 3 / Part 3: ProcessGraph — Новый проект / New Project (Phase 3+)

### Почему отдельный репозиторий / Why a separate repository

**RU:**
- MiroBoard остаётся как стабильный BPMN-редактор (MIT, community supported) — пользователи не теряют инструмент.
- ProcessGraph — платформа для множества нотаций, clean-room архитектура без legacy baggage.
- Название **ProcessGraph** намеренно избегает trademark-рисков, связанных с ARIS (SAP/Software AG).

**EN:**
- MiroBoard continues as a stable BPMN editor (MIT, community supported) — existing users keep their tool.
- ProcessGraph is a multi-notation platform built clean-room, without legacy constraints.
- The name **ProcessGraph** deliberately avoids trademark risk associated with ARIS (SAP/Software AG).

### Vision

> **"The VS Code of process modeling"**
>
> **RU:** Открытая, расширяемая, offline-first платформа для моделирования бизнес-процессов. Любая нотация — как расширение.
>
> **EN:** An open, extensible, offline-first platform for business process modeling. Any notation as an extension.

### Поддерживаемые нотации / Supported Notations

| Нотация / Notation | Статус / Status | Юридический статус / Legal Status |
|---|---|---|
| BPMN 2.0 | ✅ Phase 1 (in MiroBoard) | Open standard (OMG) — безопасно / safe |
| eEPC (extended Event-driven Process Chain) | 📋 Phase 3 | Academic origin (Scheer 1991) — безопасно при clean-room impl / safe with clean-room impl |
| UML Activity Diagrams | 📋 Phase 4 | Open standard (OMG) — безопасно / safe |
| Petri Nets | 📋 Phase 4 | Academic — безопасно / safe |
| VACD (Value-Added Chain Diagram) | 📋 Phase 4 | Academic — безопасно / safe |
| AML Import (ARIS export format) | ❓ Research needed | Proprietary SAP format — требует юридической проверки / requires legal review |

### Архитектура / Architecture Highlights

**RU:**

- **Plugin API:** каждая нотация — отдельный npm-пакет или встроенный plugin; единый интерфейс `NotationPlugin`.
- **Simulation engine:** trait-based Rust/WASM (`NotationEngine` trait), унаследован и расширен из MiroBoard.
- **Формат файла:** `.pgraph` (ProcessGraph native); импорт `.mboard`, `.bpmn`, `.xml`.
- **Offline-first:** полностью работает из `file://` URL без сервера.
- **History:** полная система истории изменений (унаследована из MiroBoard Phase 1).

**EN:**

- **Plugin API:** each notation is a separate npm package or a built-in plugin; single `NotationPlugin` interface.
- **Simulation engine:** trait-based Rust/WASM (`NotationEngine` trait), inherited and extended from MiroBoard.
- **File format:** `.pgraph` (ProcessGraph native); imports `.mboard`, `.bpmn`, `.xml`.
- **Offline-first:** works fully from a `file://` URL with no server.
- **History:** full change history (inherited from MiroBoard Phase 1).

---

## Часть 4 / Part 4: Долгосрочное видение / Long-Term Vision (Phase 5+)

**RU:** Следующие возможности запланированы после стабилизации платформы. Сроки предварительные.

**EN:** The following capabilities are planned after platform stabilization. Timelines are tentative.

| Возможность / Feature | Примечание / Note |
|---|---|
| ARIS AML import | 🔬 Осторожно — требует юридического исследования формата. / Caution — legal review of the format required. |
| Process mining (import event log, conformance checking) | 📋 Planned |
| Collaboration (optional, self-hosted signaling — не облако / not cloud) | 📋 Planned |
| Desktop app (Tauri wrapper) | 📋 Planned |
| VS Code extension (process modeling in IDE) | 📋 Planned |

---

## Часть 5 / Part 5: Принципы разработки / Development Principles

**RU:** Принципы не меняются между фазами. Они — основа всех архитектурных решений.

**EN:** Principles do not change between phases. They are the foundation for every architectural decision.

| Принцип / Principle | Описание / Description |
|---|---|
| **Offline-first** | RU: Всё работает без интернета. EN: Everything works without internet. |
| **File-based** | RU: Один файл = один документ (portable, versionable). EN: One file = one document (portable, versionable). |
| **Open standards** | RU: Реализуем только открытые и академические нотации. EN: We implement only open and academic notations. |
| **Not affiliated** | RU: ProcessGraph не является продуктом SAP, Software AG или иных правообладателей нотаций. EN: ProcessGraph is not a product of SAP, Software AG, or any notation rights holder. |
| **MIT license** | RU: Максимальная свобода для пользователей и контрибьюторов. EN: Maximum freedom for users and contributors. |

---

## Обзорная timeline / Overview Timeline

```
2026 Q2  ── MiroBoard Phase 1 complete ✅
2026 Q3  ── MiroBoard Phase 2: plugin abstraction, .mboard2 format
2026 Q4  ── MiroBoard Phase 2.1: Mindmap Mode
2027 Q1  ── MiroBoard Phase 2.2: Digital Gardens
2027 Q2  ── ProcessGraph Phase 3: new repo, eEPC plugin, .pgraph format
2027 Q3  ── ProcessGraph Phase 4: UML Activity, Petri Nets, VACD
2027+    ── Phase 5: process mining, collaboration, desktop, VS Code ext
```

---

## Часть 6 / Part 6: Vision: Unified Thinking Workspace

**RU:** MiroBoard эволюционирует от специализированного BPMN-редактора к универсальному инструменту мышления — процессы (BPMN), идеи (mindmap), знания (wiki) в одном offline-first приложении.

**EN:** MiroBoard evolves from a specialized BPMN editor into a universal thinking tool — processes (BPMN), ideas (mindmap), knowledge (wiki) in one offline-first application.

---

*RU: Этот документ обновляется по мере развития проекта.*
*EN: This document is updated as the project evolves.*
