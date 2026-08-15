# MiroBoard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Rust/WASM](https://img.shields.io/badge/Rust%2FWASM-1.97-orange)](https://www.rust-lang.org/)
[![Offline-first](https://img.shields.io/badge/Offline--first-100%25-green)]()

---

## 🎯 Для кого этот инструмент

Вы — бизнес-аналитик, внедряете SAP или описываете процессы компании. Visio не проверяет логику процесса. draw.io — просто рисовалка без симуляции. Облачные BPM-системы запрещены в вашем банке или госоргане. Вам нужен **offline-инструмент**, который рисует BPMN, **симулирует** процесс (проверяет, что не зависает, считает время выполнения) и хранит **историю изменений внутри файла** — без сервера, без подписки, бесплатно.

**MiroBoard** — это один HTML-файл. Открываете в браузере через `file://`, рисуете BPMN-диаграмму, запускаете симуляцию с 500 прогонами Monte Carlo, получаете Min/Mean/P50/P90/P95/Max и % выполнения SLA. История версий встроена: откатывайтесь к любой контрольной точке, не теряя будущие изменения. Всё хранится в одном `.mboard`-файле. Никакой регистрации, никаких серверов.

---

## Почему MiroBoard

| Ваша боль | Как решает MiroBoard |
|-----------|---------------------|
| **Профессиональные BPM-системы стоят тысячи евро в год** | Бесплатно, MIT-лицензия, один HTML-файл |
| **Облачные инструменты запрещены** (банки, госсектор, регулируемые отрасли) | 100% offline — работает через `file://`, никаких сетевых запросов |
| **draw.io и Visio — просто рисовалки** | BPMN 2.0 с валидацией семантики + детерминированная симуляция процесса |
| **Нет встроенной истории изменений** | Автоматические и именованные контрольные точки, timeline scrubber, restore-as-append |
| **Нельзя проверить, зависает ли процесс** | Token runner с AND/XOR split/join + Monte Carlo 500 runs (Min/Mean/P50/P90/P95/Max/SLA) |
| **Инструменты требуют сервер и регистрацию** | Один `.mboard`-файл — всё внутри (граф + история + параметры симуляции) |

---

## Что умеет

- 📐 **BPMN 2.0 редактор** — рисование, соединение, валидация семантики (Task, Gateway, Event)
- 🎲 **Monte Carlo симуляция** — 500 детерминированных прогонов, распределения длительности (fixed/uniform/triangular), очереди ресурсов
- 📊 **Метрики процесса** — Min/Mean/σ/P50/P90/P95/Max, критический путь, % выполнения SLA
- 🕰️ **Встроенная история** — автоматические контрольные точки каждые 50 правок или 5 минут, именованные чекпоинты, timeline scrubber
- 💾 **Один файл `.mboard`** — всё в одном: диаграмма, история, параметры симуляции. Открывается drag-and-drop
- 🔒 **Offline-first** — один HTML-файл, работает через `file://`, никаких серверов, никакой регистрации

---

## Быстрый старт

```bash
# 1. Скачайте dist/index.html из релиза
# 2. Откройте в Chrome или Edge через file://
# 3. Нарисуйте BPMN-диаграмму, нажмите "◌ MC 500" для симуляции
```

Или соберите из исходников:

```powershell
npm ci
npm run build
# Откройте dist/index.html
```

---

## Для кого

**👔 Бизнес-аналитик в консалтинге**  
Описываете процессы клиента для внедрения ERP. Профессиональные BPM-системы слишком дороги для малого клиента. MiroBoard — бесплатная альтернатива с симуляцией и историей версий.

**🏢 Архитектор корпоративных ИС**  
Документируете процессы банка. Облачные инструменты запрещены регулятором. MiroBoard работает offline, файлы хранятся на корпоративном диске.

**🎓 Преподаватель / студент**  
Ведёте курс по BPM. Нужен инструмент, который показывает семантику BPMN и симуляцию без покупки дорогих лицензий.

**🛠️ Разработчик process-aware систем**  
Строите приложение с workflow. Нужен редактор BPMN, который экспортирует `.mboard` с метаданными симуляции для вашего engine.

---

## Скриншоты

<!-- screenshot: BPMN diagram with tasks, gateways, events -->
<!-- screenshot: Monte Carlo simulation results panel (Min/Mean/P50/P90/P95/Max/SLA) -->
<!-- screenshot: Timeline panel with checkpoint scrubber and restore-as-append -->

---

## Разработка

| Команда | Описание |
|---------|----------|
| `npm ci` | Установить зависимости |
| `npm run dev` | Dev-сервер Vite |
| `npm run build` | Собрать `dist/index.html` |
| `npm test` | Unit-тесты (Vitest) |
| `npm run test:e2e` | E2E-тесты (Playwright) |

Rebuild WASM (только если изменили `wasm/board-core/src/lib.rs`):

```powershell
cd wasm/board-core
wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
cd ../..
npm run build
```

См. [`CONTRIBUTING.md`](CONTRIBUTING.md) для деталей.

---

## Roadmap

Ближайшие шаги:
- Экспорт в BPMN XML, импорт из других инструментов
- Offline-first multi-notation (BPMN + eEPC + Value Stream Mapping в одном файле)

См. [`docs/ROADMAP.md`](docs/ROADMAP.md) для полного roadmap.

---

## Лицензия

MIT — используйте свободно, в том числе в коммерческих проектах.

---

---

# MiroBoard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Rust/WASM](https://img.shields.io/badge/Rust%2FWASM-1.97-orange)](https://www.rust-lang.org/)
[![Offline-first](https://img.shields.io/badge/Offline--first-100%25-green)]()

---

## 🎯 Who is this for

You're a business analyst implementing SAP or documenting company processes. Visio doesn't validate process logic. draw.io is just a drawing tool with no simulation. Cloud BPM systems are banned in your bank or government agency. You need an **offline tool** that draws BPMN, **simulates** the process (checks for deadlocks, calculates execution time), and keeps **change history inside the file** — no server, no subscription, free.

**MiroBoard** is a single HTML file. Open it in your browser via `file://`, draw a BPMN diagram, run a Monte Carlo simulation with 500 iterations, get Min/Mean/P50/P90/P95/Max and SLA % compliance. Version history is built-in: roll back to any checkpoint without losing future changes. Everything is stored in a single `.mboard` file. No registration, no servers.

---

## Why MiroBoard

| Your pain | How MiroBoard solves it |
|-----------|------------------------|
| **Professional BPM tools cost thousands of euros per year** | Free, MIT license, single HTML file |
| **Cloud tools are banned** (banking, government, regulated industries) | 100% offline — runs via `file://`, no network requests |
| **draw.io and Visio are just drawing tools** | BPMN 2.0 with semantic validation + deterministic process simulation |
| **No built-in change history** | Automatic and named checkpoints, timeline scrubber, restore-as-append |
| **Can't verify process deadlocks** | Token runner with AND/XOR split/join + Monte Carlo 500 runs (Min/Mean/P50/P90/P95/Max/SLA) |
| **Tools require server and registration** | Single `.mboard` file — everything inside (graph + history + simulation parameters) |

---

## Features

- 📐 **BPMN 2.0 editor** — drawing, connecting, semantic validation (Task, Gateway, Event)
- 🎲 **Monte Carlo simulation** — 500 deterministic runs, duration distributions (fixed/uniform/triangular), resource queues
- 📊 **Process metrics** — Min/Mean/σ/P50/P90/P95/Max, critical path, SLA % compliance
- 🕰️ **Built-in history** — automatic checkpoints every 50 edits or 5 minutes, named checkpoints, timeline scrubber
- 💾 **Single `.mboard` file** — everything in one: diagram, history, simulation parameters. Opens via drag-and-drop
- 🔒 **Offline-first** — single HTML file, runs via `file://`, no servers, no registration

---

## Quick start

```bash
# 1. Download dist/index.html from the release
# 2. Open in Chrome or Edge via file://
# 3. Draw a BPMN diagram, click "◌ MC 500" to simulate
```

Or build from source:

```powershell
npm ci
npm run build
# Open dist/index.html
```

---

## Who is it for

**👔 Business analyst in consulting**  
You document client processes for ERP implementation. Professional BPM tools are too expensive for small clients. MiroBoard is a free alternative with simulation and version history.

**🏢 Enterprise architect**  
You document bank processes. Cloud tools are banned by the regulator. MiroBoard runs offline, files are stored on corporate drives.

**🎓 Lecturer / student**  
You teach a BPM course. You need a tool that demonstrates BPMN semantics and simulation without expensive licenses.

**🛠️ Process-aware system developer**  
You're building a workflow application. You need a BPMN editor that exports `.mboard` with simulation metadata for your engine.

---

## Screenshots

<!-- screenshot: BPMN diagram with tasks, gateways, events -->
<!-- screenshot: Monte Carlo simulation results panel (Min/Mean/P50/P90/P95/Max/SLA) -->
<!-- screenshot: Timeline panel with checkpoint scrubber and restore-as-append -->

---

## Development

| Command | Description |
|---------|-------------|
| `npm ci` | Install dependencies |
| `npm run dev` | Vite dev server |
| `npm run build` | Build `dist/index.html` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | E2E tests (Playwright) |

Rebuild WASM (only if you changed `wasm/board-core/src/lib.rs`):

```powershell
cd wasm/board-core
wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
cd ../..
npm run build
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for details.

---

## Roadmap

Next steps:
- Export to BPMN XML, import from other tools
- Offline-first multi-notation (BPMN + eEPC + Value Stream Mapping in one file)

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the full roadmap.

---

## License

MIT — use freely, including in commercial projects.
