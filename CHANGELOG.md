# Changelog / История изменений

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

Все значимые изменения в этом проекте документируются в данном файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
проект следует [семантическому версионированию](https://semver.org/lang/ru/).

---

## [Unreleased]

### Added / Добавлено
- Enhanced documentation: Phase 2 architecture and cursor rules
- Phase 1 documentation, tutorials, and architecture reference
- BPMN token visibility coverage
- Cross-area failure resilience coverage
- Legacy adoption regression coverage

### Fixed / Исправлено
- Malformed legacy adoption failures now reported properly
- IndexedDB recovery file divergence surfaced

---

## [1.0.0] - Phase 1 Complete

### Added / Добавлено
- **Offline-first single-file build** — полностью автономная работа без сервера
- **.mboard format (v1)** — открытый формат файлов для BPMN диаграмм
- **BPMN 2.0 editor** — визуальный редактор с поддержкой симуляции процессов
- **In-document history** — история изменений внутри документа (Yjs snapshots)
- **File System Access API** — нативное сохранение файлов
- **IndexedDB recovery** — автоматическое восстановление несохраненных изменений
- **254/254 assertions validated** — полное покрытие тестами

### Technical / Технические детали
- TypeScript + React architecture
- Rust WASM engine for BPMN simulation
- Vitest unit tests (148/148 passing)
- Playwright E2E tests (88/88 passing)
- Zero server dependencies

---

## [0.1.0] - Initial Development

### Added / Добавлено
- Project scaffolding
- Core BPMN rendering engine
- Basic file I/O operations

[Unreleased]: https://github.com/xodapi/miroboard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/xodapi/miroboard/releases/tag/v1.0.0
[0.1.0]: https://github.com/xodapi/miroboard/releases/tag/v0.1.0
