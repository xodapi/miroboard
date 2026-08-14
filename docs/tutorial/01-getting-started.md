# Начало работы с MiroBoard

## 1. Открытие приложения

MiroBoard работает полностью офлайн — никакого сервера не нужно.

1. Найдите файл `dist/index.html` в папке проекта.
2. Откройте его в **Chrome** или **Edge** (рекомендуется; другие браузеры могут не поддерживать File System Access API).
3. Приложение загрузится, и вы увидите пустой холст.

<!-- screenshot: стартовый экран с пустым холстом -->

> **Совет.** Добавьте `dist/index.html` в закладки браузера — так его будет легко найти снова.

---

## 2. Создание нового документа и открытие существующего

### Новый документ

При первом запуске вы автоматически начинаете с чистого холста. Чтобы создать ещё один новый документ во время работы, нажмите **Файл → Новый** (или используйте соответствующую кнопку на панели инструментов).

<!-- screenshot: меню Файл с пунктом Новый -->

### Открытие файла `.mboard`

Файлы MiroBoard сохраняются с расширением `.mboard` и содержат весь холст вместе с историей изменений.

1. Нажмите **Файл → Открыть** или кнопку «Открыть файл» на панели.
2. Выберите нужный `.mboard`-файл в диалоге.
3. Холст и история загрузятся — вы продолжаете работу с того момента, где остановились.

<!-- screenshot: диалог открытия файла -->

---

## 3. Добавление фигур и текста на холст

### Фигуры

1. Выберите инструмент фигуры на боковой панели (прямоугольник, эллипс и др.).
2. Нарисуйте фигуру, зажав левую кнопку мыши и перетащив курсор по холсту.
3. Чтобы изменить размер или переместить фигуру, переключитесь в режим выделения и перетяните фигуру или её угловой маркер.

<!-- screenshot: рисование прямоугольника на холсте -->

### Текст

1. Дважды щёлкните на пустом месте холста — появится текстовый блок.
2. Введите нужный текст.
3. Щёлкните за пределами блока, чтобы подтвердить ввод.

Чтобы отредактировать существующий текст, дважды щёлкните по нему.

<!-- screenshot: активный текстовый блок -->

---

## 4. Сохранение работы

MiroBoard поддерживает два способа сохранения в зависимости от возможностей браузера.

### Ctrl+S — File System Access (предпочтительный способ)

Если браузер поддерживает **File System Access API** (Chrome / Edge):

1. Нажмите **Ctrl+S**.
2. При первом сохранении браузер попросит выбрать место на диске и имя файла.
3. При последующих нажатиях **Ctrl+S** файл сохраняется в то же место без лишних диалогов.

### Кнопка «Скачать» — Blob-резерв

Если браузер не поддерживает File System Access (Firefox, Safari), используйте кнопку загрузки на панели инструментов:

1. Нажмите кнопку **↓ Скачать**.
2. Браузер загрузит файл `.mboard` в папку «Загрузки».
3. При следующем открытии выберите этот файл через **Файл → Открыть**.

<!-- screenshot: кнопка загрузки на панели инструментов -->

---

## 5. Индикатор несохранённых изменений

Когда на холсте есть несохранённые изменения, в заголовке (или рядом с кнопкой сохранения) появляется **метка «●»** (или аналогичный значок). Это напоминание о том, что файл нужно сохранить.

После успешного сохранения метка исчезает.

<!-- screenshot: метка несохранённых изменений рядом с именем файла -->

---

## 6. Закрытие и повторное открытие

Если вы попытаетесь закрыть вкладку или открыть другой файл при наличии несохранённых изменений, приложение покажет предупреждение:

> «Есть несохранённые изменения. Закрыть без сохранения?»

Нажмите **Отмена**, чтобы вернуться и сохранить работу, или **OK**, чтобы продолжить без сохранения.

При повторном открытии `.mboard`-файла холст восстановится в точности в том состоянии, в котором вы его оставили (включая историю изменений).

---

---

# Getting Started with MiroBoard

## 1. Opening the Application

MiroBoard runs entirely offline — no server needed.

1. Locate `dist/index.html` inside the project folder.
2. Open it in **Chrome** or **Edge** (recommended; other browsers may lack File System Access API support).
3. The app loads and you see an empty canvas.

<!-- screenshot: start screen with empty canvas -->

> **Tip.** Bookmark `dist/index.html` in your browser so it is easy to find again.

---

## 2. Creating a New Document vs Opening an Existing `.mboard` File

### New document

When you launch the app for the first time you automatically start with a blank canvas. To create another new document while working, click **File → New** (or the corresponding toolbar button).

<!-- screenshot: File menu showing New item -->

### Opening a `.mboard` file

MiroBoard files use the `.mboard` extension and bundle the full canvas together with its change history.

1. Click **File → Open** or the "Open file" toolbar button.
2. Pick the `.mboard` file in the dialog.
3. The canvas and history load — you continue from where you left off.

<!-- screenshot: file-open dialog -->

---

## 3. Adding Shapes and Text to the Canvas

### Shapes

1. Select a shape tool from the sidebar (rectangle, ellipse, etc.).
2. Draw the shape by holding the left mouse button and dragging across the canvas.
3. To resize or move a shape, switch to the selection tool and drag the shape or one of its corner handles.

<!-- screenshot: drawing a rectangle on the canvas -->

### Text

1. Double-click on an empty area of the canvas — a text block appears.
2. Type your text.
3. Click outside the block to confirm.

To edit existing text, double-click it.

<!-- screenshot: active text block -->

---

## 4. Saving Your Work

MiroBoard supports two save methods depending on browser capabilities.

### Ctrl+S — File System Access (preferred)

When the browser supports the **File System Access API** (Chrome / Edge):

1. Press **Ctrl+S**.
2. On the first save the browser asks you to choose a location and filename.
3. Subsequent **Ctrl+S** presses save to the same file silently.

### Download button — Blob fallback

When the browser does not support File System Access (Firefox, Safari), use the download button on the toolbar:

1. Click the **↓ Download** button.
2. The browser saves a `.mboard` file to your Downloads folder.
3. Next time, open that file via **File → Open**.

<!-- screenshot: download button on the toolbar -->

---

## 5. The Dirty Indicator (Unsaved Changes Badge)

Whenever the canvas has unsaved changes, a **"●" badge** (or similar icon) appears in the title bar or next to the save button. This is your reminder to save.

The badge disappears after a successful save.

<!-- screenshot: unsaved-changes badge next to the filename -->

---

## 6. Closing and Reopening

If you try to close the tab or open another file while there are unsaved changes, the app shows a warning:

> "There are unsaved changes. Close without saving?"

Click **Cancel** to go back and save, or **OK** to proceed without saving.

When you reopen a `.mboard` file, the canvas is restored exactly as you left it — including the full change history.
