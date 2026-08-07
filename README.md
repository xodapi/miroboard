# MiroBoard

Исходники приложения, опубликованного на <https://arena.syntog.ru/4/>.

## Состав

- `src/` — React/TypeScript-исходники.
- `wasm/board-core/` — Rust-ядро геометрии доски.
- `src/wasm/board-core/` — сгенерированные WebAssembly-привязки для Vite.
- `dist/index.html` — готовая автономная версия, один HTML-файл.

## Запуск и сборка

```powershell
npm ci
npm run build
```

Сборка использует `vite-plugin-singlefile`, поэтому результатом будет
`dist/index.html`, содержащий стили и JavaScript внутри одного файла.

После изменения Rust-ядра сначала пересоберите WASM:

```powershell
cd wasm/board-core
wasm-pack build --target web --out-dir ../../src/wasm/board-core --out-name board_core
cd ../..
npm run build
```

## Публикация

Для статического хостинга загрузите только `dist/index.html`.

## Дальнейшая миграция

В Rust уже перенесены привязка к сетке и ограничение масштаба. Следующий этап —
перенос пакетных операций над элементами, а React останется слоем интерфейса и
совместной работы через Yjs.
