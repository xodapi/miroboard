# План интеграции идей из Ideon в MiroBoard

**Дата создания:** 2026-08-14  
**Статус:** Draft для обсуждения с агентами  
**Цель:** Безопасно перенять лучшие практики Ideon, сохранив MIT-лицензию MiroBoard

---

## Контекст

**Ideon:** https://github.com/3xpyth0n/ideon  
- Лицензия: AGPL-3.0 (copyleft — требует публикации всех изменений)
- Стек: Next.js, PostgreSQL, Supabase, real-time collaboration
- Фокус: Project management на infinite canvas

**MiroBoard:** текущий проект  
- Лицензия: MIT (permissive — минимальные ограничения)
- Стек: React + Vite, Yjs, Rust/WASM, IndexedDB, offline-first
- Фокус: BPMN simulation + visual workspace

---

## Юридические ограничения

### ✅ Что МОЖНО делать

1. **Читать их код** для понимания архитектуры
2. **Копировать функциональные идеи** (идеи не защищены copyright)
3. **Использовать общие MIT-зависимости** из их package.json
4. **Реализовывать с нуля** (clean room implementation)
5. **Документировать вдохновение** в ATTRIBUTION.md

### ❌ Что НЕЛЬЗЯ делать

1. **Copy-paste любого кода** из `src/` (превратит проект в AGPL)
2. **Форкать их репозиторий** и менять лицензию
3. **Копировать SQL-схемы** напрямую
4. **Использовать их именования** функций/компонентов 1:1
5. **Переносить Docker/infrastructure конфигурации** как есть

### ⚠️ Последствия нарушения AGPL-3.0

- Весь MiroBoard станет AGPL-3.0 (контагиозная лицензия)
- Обязанность публиковать исходники при любом публичном деплое
- Все форки обязаны быть AGPL
- Усложнение коммерциализации

---

## Приоритетные идеи для заимствования

### 1. Блочная система (Block Architecture)

**Что берём:**
- Концепция typed blocks на canvas (Note, Checklist, Kanban, Calendar)
- Единый интерфейс для всех типов блоков
- Drag-and-drop для блоков и внутри блоков

**Как реализуем:**
```typescript
// ✅ Наша реализация, вдохновлённая идеей
type BlockType = 'sticky' | 'text' | 'rect' | 'circle' | 
                 'bpmn-node' | 'bpmn-flow' | 
                 'checklist' | 'kanban' | 'calendar'

interface BaseBlock {
  id: string
  type: BlockType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

interface ChecklistBlock extends BaseBlock {
  type: 'checklist'
  items: Array<{
    id: string
    checked: boolean
    text: string
    indent: number
  }>
}
```

**Текущий статус MiroBoard:**
- ✓ Уже есть: sticky, text, rect, circle, bpmn-node, bpmn-flow
- ⏳ Добавить: checklist, kanban, calendar

**Приоритет:** HIGH  
**Сложность:** Medium  
**Milestone:** M5 (post-Phase 1)

---

### 2. Keyboard Navigation

**Что берём:**
- Arrow keys для navigation между блоками
- Enter для edit mode
- Escape для exit edit/deselect
- Tab/Shift+Tab для indent/dedent (в checklist)

**Как реализуем:**
```typescript
// ✅ Clean room implementation
function useKeyboardNavigation(
  selectedId: string | null,
  blocks: Block[],
  onSelect: (id: string) => void
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return
      
      const current = blocks.find(b => b.id === selectedId)
      if (!current) return
      
      switch (e.key) {
        case 'ArrowUp':
          // Найти ближайший блок выше
          break
        case 'ArrowDown':
          // Найти ближайший блок ниже
          break
        case 'Enter':
          // Войти в edit mode
          break
        case 'Escape':
          // Deselect
          break
      }
    }
    
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedId, blocks])
}
```

**Текущий статус MiroBoard:**
- ✓ Уже есть: Escape для deselect/close BPMN palette (commit 2d1965f)
- ⏳ Добавить: Arrow keys, Enter для edit

**Приоритет:** MEDIUM  
**Сложность:** Low  
**Milestone:** M5

---

### 3. Rich Text Editor

**Что берём:**
- Идею использовать полноценный rich text вместо plain textarea
- Markdown shortcuts (**, __, списки)
- Inline formatting toolbar

**Как реализуем:**
```bash
# ✅ Используем ту же MIT-библиотеку, что и Ideon
npm install --save-exact @tiptap/react@^2.x @tiptap/starter-kit@^2.x
```

```typescript
// ✅ Наша реализация с нуля
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

function RichTextBlock({ content, onChange }: Props) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML())
  })
  
  return <EditorContent editor={editor} />
}
```

**Текущий статус MiroBoard:**
- ❌ Сейчас: plain textarea для sticky/text
- ⏳ Добавить: Tiptap integration

**Приоритет:** LOW (nice-to-have)  
**Сложность:** Medium  
**Milestone:** M6+

---

### 4. Time Travel / History Viewer

**Что берём:**
- UI-концепцию timeline slider
- Идею readonly preview режима
- Визуализацию snapshots

**Как реализуем:**
```typescript
// ✅ У нас УЖЕ ЕСТЬ бэкенд (M4 Content History)
// Нужен только UI-слой

function TimelinePanel({ 
  checkpoints, 
  currentSnapshot, 
  onSelectSnapshot 
}: Props) {
  return (
    <div className="timeline-panel">
      <input
        type="range"
        min={0}
        max={checkpoints.length - 1}
        value={currentSnapshot}
        onChange={(e) => onSelectSnapshot(+e.target.value)}
      />
      <div className="checkpoints">
        {checkpoints.map((cp, idx) => (
          <button 
            key={cp.id}
            onClick={() => onSelectSnapshot(idx)}
            className={idx === currentSnapshot ? 'active' : ''}
          >
            {cp.label || formatTimestamp(cp.timestamp)}
          </button>
        ))}
      </div>
    </div>
  )
}
```

**Текущий статус MiroBoard:**
- ✓ Бэкенд готов: M4 history с Yjs snapshots (commits 56bc345, ce0588a, 5f4e0b4)
- ⏳ UI-слой: базовый timeline panel есть в TimelinePanel.tsx
- ⏳ Улучшить: slider, визуализация, animations

**Приоритет:** MEDIUM  
**Сложность:** Low (бэкенд готов)  
**Milestone:** M5

---

### 5. Checklist Block

**Что берём:**
- Checkbox + multiline text
- Drag handles для reordering
- Indent/dedent через Tab
- Sub-items (nested structure)

**Как реализуем:**
```typescript
// ✅ Clean room implementation
interface ChecklistItem {
  id: string
  checked: boolean
  text: string
  indent: number  // 0, 1, 2, ...
}

function ChecklistBlock({ items, onChange }: Props) {
  const handleDragEnd = (result: DragResult) => {
    // Reorder items
  }
  
  const handleIndent = (itemId: string, direction: 'in' | 'out') => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    
    const newIndent = direction === 'in' 
      ? Math.min(item.indent + 1, 3)
      : Math.max(item.indent - 1, 0)
    
    onChange(items.map(i => 
      i.id === itemId ? { ...i, indent: newIndent } : i
    ))
  }
  
  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="checklist">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            {items.map((item, idx) => (
              <Draggable key={item.id} draggableId={item.id} index={idx}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    style={{ 
                      paddingLeft: `${item.indent * 20}px`,
                      ...provided.draggableProps.style 
                    }}
                  >
                    <span {...provided.dragHandleProps}>⋮⋮</span>
                    <input 
                      type="checkbox" 
                      checked={item.checked}
                      onChange={(e) => handleToggle(item.id, e.target.checked)}
                    />
                    <textarea 
                      value={item.text}
                      onChange={(e) => handleTextChange(item.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                          e.preventDefault()
                          handleIndent(item.id, e.shiftKey ? 'out' : 'in')
                        }
                      }}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  )
}
```

**Зависимости:**
```bash
npm install --save-exact react-beautiful-dnd@^13.1.1  # MIT
```

**Текущий статус MiroBoard:**
- ❌ Checklist block не существует
- ✓ Базовые блоки (sticky, text) есть
- ✓ Selection/editing есть

**Приоритет:** HIGH (часто запрашиваемая фича)  
**Сложность:** Medium  
**Milestone:** M5

---

### 6. Kanban Block

**Что берём:**
- Column-based layout (Backlog, In Progress, Done)
- Card drag-and-drop между колонками
- Inline card editing
- Custom fields (assignee, labels, due date)

**Как реализуем:**
```typescript
// ✅ Clean room implementation
interface KanbanColumn {
  id: string
  title: string
  color?: string
  cards: KanbanCard[]
}

interface KanbanCard {
  id: string
  title: string
  description?: string
  assignee?: string
  labels: string[]
  dueDate?: string
}

interface KanbanBlock extends BaseBlock {
  type: 'kanban'
  columns: KanbanColumn[]
}

function KanbanBlock({ columns, onChange }: Props) {
  return (
    <div className="kanban-board">
      {columns.map(column => (
        <div key={column.id} className="kanban-column">
          <h3>{column.title}</h3>
          <Droppable droppableId={column.id}>
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {column.cards.map((card, idx) => (
                  <Draggable key={card.id} draggableId={card.id} index={idx}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="kanban-card"
                      >
                        <h4>{card.title}</h4>
                        <p>{card.description}</p>
                        {card.assignee && <span>👤 {card.assignee}</span>}
                        {card.labels.map(label => (
                          <span key={label} className="label">{label}</span>
                        ))}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      ))}
    </div>
  )
}
```

**Текущий статус MiroBoard:**
- ❌ Kanban block не существует
- ✓ Drag-and-drop infrastructure есть (для BPMN nodes/flows)

**Приоритет:** MEDIUM  
**Сложность:** High  
**Milestone:** M6

---

### 7. Calendar Block

**Что берём:**
- Monthly/weekly view
- Event markers на датах
- Click для добавления событий
- Integration с другими блоками (deadlines)

**Как реализуем:**
```bash
npm install --save-exact react-calendar@^4.x  # MIT
```

```typescript
// ✅ Обёртка над MIT-библиотекой
import Calendar from 'react-calendar'

interface CalendarEvent {
  id: string
  title: string
  date: Date
  color?: string
}

interface CalendarBlock extends BaseBlock {
  type: 'calendar'
  events: CalendarEvent[]
  view: 'month' | 'week'
}

function CalendarBlockComponent({ events, view, onChange }: Props) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  
  return (
    <div className="calendar-block">
      <Calendar
        value={selectedDate}
        onChange={setSelectedDate}
        tileContent={({ date }) => {
          const dayEvents = events.filter(e => 
            isSameDay(e.date, date)
          )
          return dayEvents.length > 0 ? (
            <div className="event-markers">
              {dayEvents.map(e => (
                <span key={e.id} style={{ backgroundColor: e.color }}>
                  •
                </span>
              ))}
            </div>
          ) : null
        }}
      />
      <div className="events-list">
        {events
          .filter(e => isSameDay(e.date, selectedDate))
          .map(event => (
            <div key={event.id}>{event.title}</div>
          ))}
      </div>
    </div>
  )
}
```

**Текущий статус MiroBoard:**
- ❌ Calendar block не существует

**Приоритет:** LOW  
**Сложность:** Medium  
**Milestone:** M7+

---

## Безопасные MIT-зависимости из Ideon

### Рекомендуемые для добавления

```json
{
  "dependencies": {
    "@tiptap/react": "^2.x",           // Rich text editor
    "@tiptap/starter-kit": "^2.x",     // Базовые расширения
    "react-beautiful-dnd": "^13.1.1",  // Drag-and-drop
    "react-calendar": "^4.x",          // Calendar widget
    "zustand": "^4.x"                  // State manager (опционально)
  }
}
```

### Уже используемые общие зависимости

- `react` — UI framework
- `yjs` — CRDT для collaboration
- `vite` — Build tool

---

## Clean Room Implementation процесс

### Этап 1: Specification (Читающий агент)

**Ответственный:** Explorer/Worker (читает Ideon)  
**Результат:** Markdown-спецификация поведения

**Пример:**
```markdown
# Checklist Block Specification

## Functional Requirements
1. User can create a checklist block on canvas
2. Each item has checkbox + multiline text
3. User can reorder items via drag handle
4. Tab/Shift+Tab indent/dedent items
5. Enter creates new item below
6. Backspace on empty item removes it

## Data Model
- Block type: 'checklist'
- Items array with: id, checked, text, indent
- Max indent level: 3

## UI Components
- Drag handle: ⋮⋮ icon on left
- Checkbox: standard HTML input
- Text: auto-expanding textarea
- Indent: 20px per level

## Keyboard Shortcuts
- Enter: new item
- Tab: indent
- Shift+Tab: dedent
- Backspace (empty): delete item

## Yjs Integration
- Store in Y.Array<ChecklistItem>
- Real-time sync between users
```

### Этап 2: Implementation (Пишущий агент)

**Ответственный:** Worker (НЕ смотрит на Ideon код)  
**Входные данные:** Только спецификация из Этапа 1  
**Результат:** Чистая реализация

**Правила:**
- ❌ Не открывать `src/` Ideon
- ✅ Читать только спецификацию
- ✅ Использовать MIT-библиотеки
- ✅ Писать код с нуля

### Этап 3: Documentation

**В каждом commit message:**
```
feat: add checklist block

Implement checklist block with drag-and-drop reordering, indent/dedent,
and keyboard shortcuts. Inspired by Ideon's spatial block architecture,
implemented independently following clean room process.

Clean room spec: docs/specs/checklist-block.md
Co-authored-by: factory-droid[bot] <138933559+factory-droid[bot]@users.noreply.github.com>
```

**В ATTRIBUTION.md:**
```markdown
## Ideon (AGPL-3.0) - Architectural Inspiration

URL: https://github.com/3xpyth0n/ideon
License: AGPL-3.0

Features inspired by Ideon's design (clean room implementation, no code copied):
- Block-based canvas architecture
- Checklist block with drag-and-drop
- Keyboard navigation patterns
- Time travel UI concept

Shared MIT dependencies:
- yjs — CRDT collaboration
- react — UI framework
- @tiptap/react — Rich text editor
```

---

## Roadmap интеграции идей

### Phase 1.5 (Post M4, Pre M5)

**Цель:** Подготовка инфраструктуры для новых типов блоков

1. ✅ Рефакторинг существующих блоков в typed system
2. ✅ Создание `BaseBlock` интерфейса
3. ✅ Регистрация block types в едином реестре
4. ⏳ Keyboard navigation infrastructure
5. ⏳ Block template system

**Оценка:** 2-3 недели  
**Риск:** Low (рефакторинг существующего кода)

### M5: Essential Blocks

**Цель:** Добавить самые востребованные типы блоков

1. ⏳ Checklist block (clean room)
2. ⏳ Rich text block с @tiptap/react
3. ⏳ Timeline UI improvements
4. ⏳ Keyboard navigation (arrow keys, Enter, Escape)

**Оценка:** 4-6 недель  
**Риск:** Medium (новые UI-паттерны)

### M6: Advanced Blocks

**Цель:** Расширенные блоки для project management

1. ⏳ Kanban block (clean room)
2. ⏳ Image/file embed blocks
3. ⏳ Link preview blocks
4. ⏳ Table block

**Оценка:** 6-8 недель  
**Риск:** High (сложная интерактивность)

### M7+: Polish & Integration

1. ⏳ Calendar block
2. ⏳ Git integration (опционально)
3. ⏳ Export/import улучшения
4. ⏳ Mobile-friendly UI

**Оценка:** TBD  
**Риск:** Medium

---

## Вопросы для обсуждения с агентами

### 1. Приоритизация блоков

**Вопрос:** Какой тип блока добавить первым?

**Варианты:**
- A) Checklist — часто запрашиваемая, medium сложность
- B) Rich text — улучшит существующие sticky/text блоки
- C) Timeline UI — бэкенд уже готов (M4)

**Рекомендация:** **C → B → A** (от простого к сложному)

### 2. Yjs integration для блоков

**Вопрос:** Как хранить сложные блоки в Y.Doc?

**Варианты:**
- A) Один `Y.Array<BoardElement>`, где `data` содержит JSON
- B) Отдельные `Y.Map` для каждого типа блока
- C) Вложенные Yjs-структуры (Y.Array внутри Y.Map)

**Рекомендация:** **A** (проще, совместимо с M0-M4)

### 3. Keyboard navigation scope

**Вопрос:** Как работать с фокусом при editing?

**Варианты:**
- A) Global keyboard handler (текущий подход)
- B) Per-block keyboard context
- C) Focus trap при editing

**Рекомендация:** **C** (predictable UX)

### 4. Лицензирование документации

**Вопрос:** Нужно ли упоминать Ideon в каждом commit?

**Варианты:**
- A) Да, в каждом связанном commit
- B) Только в feature commit messages
- C) Только в ATTRIBUTION.md

**Рекомендация:** **B + C** (прозрачность + не захламляем git log)

### 5. Performance для больших canvas

**Вопрос:** Как оптимизировать рендеринг 1000+ блоков?

**Ideon использует:**
- `react-virtualized-auto-sizer` (MIT) — viewport culling

**Варианты:**
- A) Добавить virtualization сейчас (preemptive)
- B) Дождаться performance issues (YAGNI)
- C) Использовать Canvas API вместо DOM (ваш Rust/WASM опыт)

**Рекомендация:** **B** (текущий масштаб не требует)

---

## Acceptance Criteria для каждой фичи

### Checklist Block

- [ ] Создание через меню "Add Block"
- [ ] Checkbox toggle сохраняется в Yjs
- [ ] Drag-and-drop reordering работает
- [ ] Tab/Shift+Tab изменяют indent
- [ ] Enter создаёт новый item
- [ ] Backspace на пустом удаляет
- [ ] Max indent = 3 уровня
- [ ] Unit tests ≥90% coverage
- [ ] E2E test в Playwright
- [ ] Документация в README
- [ ] Commit message ссылается на clean room spec

### Rich Text Block

- [ ] Tiptap editor интегрирован
- [ ] Markdown shortcuts работают (**, __, lists)
- [ ] Toolbar показывается при selection
- [ ] HTML сохраняется в Yjs
- [ ] Рендеринг HTML безопасный (sanitized)
- [ ] Работает с undo/redo
- [ ] Unit tests для sanitization
- [ ] E2E test для formatting

### Timeline UI Improvements

- [ ] Range slider показывает все checkpoints
- [ ] Click на checkpoint переключает preview
- [ ] Named checkpoints выделены визуально
- [ ] Restore button disabled в readonly mode
- [ ] Smooth transition между snapshots
- [ ] Timestamp formatting локализован (ru)
- [ ] E2E test для timeline navigation

---

## Risks & Mitigations

### Risk 1: Случайное копирование кода

**Вероятность:** Medium  
**Влияние:** Critical (нарушение лицензии)

**Mitigation:**
- Использовать clean room process (2 агента)
- Code review каждого PR на схожесть с Ideon
- Автоматический lint для проверки импортов из Ideon

**Action items:**
- [ ] Создать `lint-license.mjs` скрипт
- [ ] Добавить в pre-commit hook
- [ ] Обучить всех агентов clean room процессу

### Risk 2: Performance degradation с новыми блоками

**Вероятность:** Low  
**Влияние:** Medium

**Mitigation:**
- Benchmark перед/после каждой фичи
- Playwright performance tests
- Virtualization если >500 блоков

**Action items:**
- [ ] Создать performance test suite
- [ ] Установить SLO (60fps при <500 блоков)

### Risk 3: Yjs schema migration

**Вероятность:** High  
**Влияние:** High (ломает существующие файлы)

**Mitigation:**
- Сохранять `schemaVersion` в .mboard
- Написать миграции v1→v2
- Тестировать на M0-M4 fixtures

**Action items:**
- [ ] Создать `src/format/migrations/v2.ts`
- [ ] Unit tests для backward compatibility
- [ ] Документировать breaking changes в CHANGELOG

---

## Success Metrics

### Adoption Metrics
- [ ] 3+ новых типа блоков в production
- [ ] <5% bug reports связанных с новыми блоками
- [ ] User feedback положительный (community/Discord)

### Technical Metrics
- [ ] Test coverage ≥90% для новых модулей
- [ ] Zero ESLint errors
- [ ] Build time increase <10%
- [ ] .mboard file size increase <20%

### Legal Metrics
- [ ] Zero code copied из AGPL-проектов
- [ ] MIT license остаётся чистой
- [ ] ATTRIBUTION.md актуален

---

## Next Steps

### Immediate (эта неделя)

1. **Создать clean room specs:**
   - [ ] `docs/specs/checklist-block.md`
   - [ ] `docs/specs/rich-text-block.md`
   - [ ] `docs/specs/timeline-ui-v2.md`

2. **Обсудить с агентами:**
   - [ ] Приоритизация (Checklist vs Rich Text vs Timeline)
   - [ ] Yjs schema для блоков
   - [ ] Keyboard navigation approach

3. **Подготовить инфраструктуру:**
   - [ ] Refactor `BoardElement` → `BaseBlock`
   - [ ] Создать block registry
   - [ ] Добавить MIT-зависимости (tiptap, react-beautiful-dnd)

### Short-term (2-4 недели)

1. **Implement Phase 1.5:**
   - [ ] Block type system refactor
   - [ ] Keyboard navigation infrastructure
   - [ ] Timeline UI v2

2. **Начать M5:**
   - [ ] Первый блок (Timeline UI improvements, low risk)
   - [ ] Clean room review process
   - [ ] Documentation updates

### Long-term (2-3 месяца)

1. **Complete M5-M6**
2. **Gather user feedback**
3. **Plan M7 roadmap**

---

## Questions & Answers

### Q: Можем ли мы использовать их UI-компоненты (Tailwind classes)?

**A:** ✅ Да, Tailwind utility classes — это не copyrightable expression. Можно свободно использовать те же классы.

### Q: Если мы наймём контрибьютора Ideon, это проблема?

**A:** ⚠️ Потенциально да. Нужен clear disclosure и clean room review всего их кода.

### Q: Можем ли мы сменить MiroBoard на AGPL в будущем?

**A:** ✅ Да, MIT→AGPL разрешён (обратное невозможно). Но это требует согласия всех контрибьюторов.

### Q: Что если Ideon добавит фичу, которую мы уже реализовали?

**A:** ✅ Нет проблем. Independent creation защищена. Наш git history доказывает, что мы написали первыми.

---

## Approval & Sign-off

**Prepared by:** Droid (Factory AI)  
**Date:** 2026-08-14  
**Status:** DRAFT — requires user review

**Next reviewer:** User (d88u5)

**Changes requested:**
- [ ] Приоритизация блоков (Checklist/Rich Text/Timeline)
- [ ] Yjs schema approach (A/B/C)
- [ ] Keyboard navigation scope
- [ ] Performance optimization timing

---

## References

- [Ideon Repository](https://github.com/3xpyth0n/ideon)
- [AGPL-3.0 License](https://www.gnu.org/licenses/agpl-3.0.en.html)
- [MIT License](https://opensource.org/licenses/MIT)
- [Clean Room Design](https://en.wikipedia.org/wiki/Clean_room_design)
- [MiroBoard Mission](C:\Users\d88u5\.factory\missions\b4963a39-830d-42b1-8a97-f2d6f9ca084c\mission.md)
- [MiroBoard Roadmap](C:\project\miroboard\docs\ROADMAP.md)

---

**End of Plan**
