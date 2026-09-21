# Долгосрочная программа развития

## Готово

- BPMN-редактор, XML import/export и BPMN-DI;
- deterministic token runner, XOR/AND, Monte Carlo и распределения длительности;
- стоимость, роли, capacity, utilisation и очередь ресурсов;
- защита BPMN-семантики: неподдерживаемые inclusive gateways и неявные
  развилки отклоняются валидацией, а не дают тихо неверный расчёт;
- BPMN round-trip сохраняет условия, default-flow, вероятности XOR-потоков
  и параметры симуляции задач;
- автономная single-file сборка и учебные BPMN-примеры.

## Ближайшие этапы

1. Рабочий календарь ресурсов, SLA и deadline-анализ.
2. Полноценная очередь: приоритеты, FIFO и несколько экземпляров процесса.
3. Bottleneck, cost и what-if аналитика.
4. ARIS/eEPC/VACD и mind-map поверх общего графового ядра.
5. Process mining import и сверка модели с event log.

## Принципы

GitHub хранит опубликованную историю. Git и jj обеспечивают локальную историю и
undo. Rust/WASM содержит детерминированную доменную логику, React/Yjs — UI и
совместную работу. Новые функции сначала получают учебный fixture и тест.

## Совместная работа и паритет с Miro

Отдельный анализ (2026-09-20) с проверенными по исходникам фактами, оценками и
поэтапным планом:

- [`COLLABORATION_ANALYSIS.md`](./COLLABORATION_ANALYSIS.md) — что мешает
  совместной работе (включая экспериментальное доказательство потери правок в
  текущей CRDT-схеме), целевая архитектура, транспорты, async-слияние файлов;
- [`MIRO_FEATURE_GAP_ANALYSIS.md`](./MIRO_FEATURE_GAP_ANALYSIS.md) — матрица
  функционального паритета с Miro по категориям и быстрые победы;
- [`experiments/`](./experiments/) — воспроизводимые пробы, на которые ссылается анализ.

## Production hardening

- Публичные Yjs signaling-серверы уже удалены в Phase 1 (см. `docs/architecture.md`).
  Актуальная задача — не «заменить» их, а ввести собственный opt-in транспорт
  (`BroadcastChannel` → self-hosted WebSocket relay → WebRTC со своим signaling);
- разделить большой UI-компонент (`src/App.tsx`, 2534 строки) и добавить browser-level
  тесты для Simulation;
- сохранять Git history в UI через build-time generated manifest, а не вручную;
- зафиксировать в CI бюджеты: размер `dist/index.html`, размер `.mboard` после
  N правок, fps на доске из 500 узлов;
- привести `ACHIEVEMENTS.md` в соответствие с кодом (Canvas 2D → SVG, Zustand не
  используется, «MessagePack-like» → JSON, размер бандла 2.1 МБ → 1.1 МБ).
