# Долгосрочная программа развития

## Готово

- BPMN-редактор, XML import/export и BPMN-DI;
- deterministic token runner, XOR/AND, Monte Carlo и распределения длительности;
- стоимость, роли, capacity, utilisation и очередь ресурсов;
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

## Production hardening

- Заменить публичные Yjs signaling-серверы управляемым собственным signaling;
- разделить большой UI-компонент и добавить browser-level тесты для Simulation;
- сохранять Git history в UI через build-time generated manifest, а не вручную.
