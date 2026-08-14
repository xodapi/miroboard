# История и контрольные точки

## 1. Автоматические контрольные точки

MiroBoard автоматически создаёт контрольные точки (снимки состояния холста) в следующих ситуациях:

- **Каждые 50 правок** — после накопления 50 изменений на холсте.
- **Каждые 5 минут** — по таймеру, если вы продолжаете работать.
- **Перед сохранением** — непосредственно до записи файла на диск.
- **Перед восстановлением** — перед тем как применить ранее сохранённую точку.

Автоматические точки гарантируют, что при любом сбое у вас останется недавний снимок.

---

## 2. Создание именованной контрольной точки

Чтобы сохранить текущее состояние с понятным названием:

1. Нажмите кнопку **«Отметить состояние»** на панели инструментов.
2. Введите произвольное имя (например, «После согласования схемы»).
3. Подтвердите — точка добавится в историю с вашим названием.

<!-- screenshot: диалог «Отметить состояние» с полем ввода имени -->

Именованные точки легко находить на временно́й шкале — они выделяются среди автоматических.

---

## 3. Открытие панели «История»

Нажмите кнопку **«История»** на панели инструментов (или выберите **Вид → История**). Откроется боковая панель с хронологическим списком всех контрольных точек — автоматических и именованных.

<!-- screenshot: открытая панель «История» со списком точек -->

Каждая запись показывает:
- дату и время создания;
- тип (автоматическая или именованная);
- название (для именованных точек).

---

## 4. Просмотр точек в режиме предпросмотра

Щёлкните по любой точке в панели «История» — холст переключится в **режим предпросмотра**: вы увидите состояние доски на тот момент, но ничего не изменится в реальном документе.

<!-- screenshot: холст в режиме предпросмотра с выбранной точкой -->

Перемещайтесь по списку, щёлкая разные точки, чтобы сравнить состояния.

---

## 5. Баннер предпросмотра

Пока активен режим предпросмотра, вверху холста отображается жёлтый баннер:

> «Предпросмотр: [название точки] — изменения не сохранены»

Это напоминание о том, что вы смотрите на прошлое состояние, а не редактируете текущее.

**Чтобы выйти из предпросмотра**, нажмите кнопку **«Вернуться»** в баннере или закройте панель «История». Холст вернётся к актуальному состоянию без каких-либо изменений.

<!-- screenshot: жёлтый баннер предпросмотра с кнопкой «Вернуться» -->

---

## 6. Восстановление контрольной точки

Чтобы откатиться к выбранной точке:

1. Выберите точку в панели «История».
2. Нажмите кнопку **«Восстановить»**.

Восстановление работает по принципу **append-to-history**: выбранное состояние добавляется в конец истории как новая запись. Будущие точки (те, что были после выбранной) **не удаляются** — вы всегда можете вернуться к ним снова.

Это означает, что история необратима: ни одна точка не теряется.

<!-- screenshot: кнопка «Восстановить» в панели истории -->

---

## 7. Восстановление после сбоя

При каждом изменении холста MiroBoard сохраняет снимок в **IndexedDB** — локальную базу данных браузера. Если браузер закроется аварийно, при следующем открытии того же файла приложение сравнит кэш с содержимым файла.

Если кэш новее, вверху появится уведомление:

> «Восстановлено из локального кэша: файл отстаёт»

Это значит, что на холсте показаны изменения, которые не были записаны в файл. Сохраните файл немедленно (**Ctrl+S**), чтобы не потерять работу.

<!-- screenshot: уведомление «Восстановлено из локального кэша» -->

---

## 8. История внутри файла `.mboard`

Файл `.mboard` хранит **полную историю** — все контрольные точки, именованные и автоматические. Передав коллеге `.mboard`-файл, вы передаёте и всю историю изменений: он сможет открыть панель «История» и просмотреть любой снимок.

> **Имейте в виду:** при экспорте холста в другой формат (PNG, SVG) история не сохраняется — только текущее состояние.

---

---

# History & Checkpoints

## 1. Automatic Checkpoints

MiroBoard automatically creates checkpoints (canvas snapshots) in these situations:

- **Every 50 edits** — after 50 changes accumulate on the canvas.
- **Every 5 minutes** — on a timer while you keep working.
- **Before save** — immediately before writing the file to disk.
- **Before restore** — before applying a previously saved checkpoint.

Automatic checkpoints ensure that even after a crash you have a recent snapshot to fall back on.

---

## 2. Creating a Named Checkpoint

To save the current state with a meaningful label:

1. Click the **«Отметить состояние»** button on the toolbar.
2. Enter any name (e.g., "After diagram review").
3. Confirm — the checkpoint is added to the history with your label.

<!-- screenshot: "Отметить состояние" dialog with name input field -->

Named checkpoints are easy to spot in the timeline — they stand out from the automatic ones.

---

## 3. Opening the History Panel

Click the **«История»** button on the toolbar (or choose **View → History**). A side panel opens with a chronological list of all checkpoints — both automatic and named.

<!-- screenshot: open "История" panel with list of checkpoints -->

Each entry shows:
- date and time created;
- type (automatic or named);
- label (for named checkpoints).

---

## 4. Scrubbing Through Checkpoints in Preview Mode

Click any checkpoint in the «История» panel — the canvas switches to **preview mode**: you see the board as it looked at that moment, but nothing changes in the live document.

<!-- screenshot: canvas in preview mode with a checkpoint selected -->

Navigate the list by clicking different checkpoints to compare states.

---

## 5. The Preview Banner

While preview mode is active, a yellow banner appears at the top of the canvas:

> "Preview: [checkpoint name] — changes not saved"

This is a reminder that you are viewing a past state, not editing the current one.

**To exit preview**, click the **"Return"** button in the banner or close the «История» panel. The canvas returns to the live state with no modifications.

<!-- screenshot: yellow preview banner with Return button -->

---

## 6. Restoring a Checkpoint

To roll back to a selected checkpoint:

1. Select the checkpoint in the «История» panel.
2. Click **"Restore"**.

Restore works as **restore-as-append**: the chosen state is appended to the end of the history as a new entry. Future checkpoints (those that came after the selected one) are **not erased** — you can still navigate back to them.

The history is therefore non-destructive: no checkpoint is ever lost.

<!-- screenshot: Restore button in the history panel -->

---

## 7. Recovery from a Crash

On every canvas change MiroBoard writes a snapshot to **IndexedDB** — the browser's local database. If the browser closes unexpectedly, the next time you open the same file the app compares the cache with the file contents.

If the cache is newer, a notice appears at the top:

> «Восстановлено из локального кэша: файл отстаёт»

This means the canvas shows changes that were never written to the file. Save immediately (**Ctrl+S**) to avoid losing that work.

<!-- screenshot: "Восстановлено из локального кэша" notice -->

---

## 8. History Inside the `.mboard` File

A `.mboard` file stores the **complete history** — every checkpoint, named and automatic. When you share a `.mboard` file with a colleague, you share the full history too: they can open the «История» panel and browse any snapshot.

> **Note:** Exporting to another format (PNG, SVG) does not carry history — only the current canvas state is exported.
