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
- Стиль стрелки: пунктир, толщина и наконечник пишутся в сам объект и переживают сохранение. Сплошная линия не получает ключ `dash`; схема остаётся v1. Память пера живёт только на устройстве
- Раздельные заливка и обводка: у прямоугольника и круга клик пишет только одно поле (`fill` или `color`); стикер красится заливкой, узел BPMN — обводкой. Схема остаётся v1
- Блокировка объекта: выделенное не сдвигается перетаскиванием и стрелками, не меняет размер и не поворачивается; удаление, правка текста и перекраска остаются. В файле только `locked: true`, схема остаётся v1
- Поиск по доске (Ctrl+F): текст, роль, условие потока; переход к совпадению без смены масштаба; список совпадений, клик прыгает к выбранному
- Умные направляющие при перетаскивании и при изменении размера: край и центр соседа важнее сетки, в документ не пишутся
- Группы (Ctrl+G / Ctrl+Shift+G): один токен `parentId`, двигаются, копируются и удаляются вместе, без элемента-контейнера
- Настройки интерфейса (тема, сетка, мини-карта, цвет, толщина) запоминаются на устройстве
- Фронтир мощности в панели симуляции: Парето время/численность по узкой роли, без новой зависимости и без записи в документ
- Поворот объекта: ручка над выделением, Shift — шаг 15°, угол пишется в уже существующее поле `rotation`
- Зафиксирован стек документации: Markdown и rustdoc, без Antora/Typst/Markdoc; в продукт допускаются только MIT и Apache-2.0
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
