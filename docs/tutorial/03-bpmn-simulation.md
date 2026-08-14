# BPMN-симуляция

## 1. Поддерживаемые элементы BPMN

MiroBoard поддерживает следующие элементы BPMN:

| Элемент | Описание |
|---------|----------|
| **Задача (Task)** | Единица работы; имеет длительность, роль и стоимость |
| **Начальное событие (Start Event)** | Точка входа токена в процесс |
| **Конечное событие (End Event)** | Точка завершения токена |
| **XOR-шлюз** | Эксклюзивный выбор: токен идёт ровно по одному пути |
| **AND-шлюз** | Параллельное разветвление / слияние: токен идёт по всем путям |
| **Поток (Sequence Flow)** | Стрелка, соединяющая элементы |

<!-- screenshot: палитра BPMN-элементов -->

---

## 2. Добавление BPMN-элемента на холст

1. **Зажмите** левую кнопку мыши на пустом месте холста примерно на 0,5–1 секунду (долгое нажатие).
2. Появится **BPMN-палитра** с доступными элементами.
3. Не отпуская кнопку, перетащите курсор на нужный элемент, затем отпустите — элемент будет размещён на холсте.

<!-- screenshot: долгое нажатие вызывает BPMN-палитру -->

> **Совет.** Обычное (короткое) нажатие рисует стандартную фигуру. Для BPMN-элементов всегда используйте долгое нажатие.

---

## 3. Соединение элементов потоками и вероятности XOR-ветвей

### Создание потока

1. Наведите курсор на исходный элемент — на его краях появятся точки соединения.
2. Потяните от точки соединения к целевому элементу.
3. Отпустите на целевом элементе — поток будет создан.

<!-- screenshot: создание потока между задачей и шлюзом -->

### Вероятности ветвей XOR-шлюза

Каждый исходящий поток из XOR-шлюза имеет вероятность (от 0 до 1). Сумма вероятностей всех исходящих потоков должна равняться 1.

1. Щёлкните на потоке, выходящем из XOR-шлюза.
2. В панели свойств введите значение вероятности (например, `0.7`).
3. Повторите для остальных исходящих потоков.

<!-- screenshot: панель свойств потока с полем вероятности -->

---

## 4. Настройка задачи

Выберите задачу на холсте — откроется панель свойств.

### Распределение длительности

Выберите тип распределения и введите параметры:

| Тип | Параметры |
|-----|-----------|
| **Фиксированное (Fixed)** | Одно значение длительности |
| **Равномерное (Uniform)** | Минимум и максимум |
| **Треугольное (Triangular)** | Минимум, максимум и мода |

### Роль и стоимость

- **Роль** — выберите из списка ролей, определённых в панели ресурсов (или добавьте новую).
- **Стоимость** — стоимость одного выполнения задачи (используется в итоговой статистике).

<!-- screenshot: панель свойств задачи с полями длительности, роли и стоимости -->

---

## 5. Панель ресурсов

Откройте панель **«Ресурсы»** через меню или боковую иконку.

### Ёмкость роли

Для каждой роли задайте максимальное количество исполнителей, работающих параллельно. Если токены поступают быстрее, чем роль успевает обрабатывать, они встают в очередь.

### Дисциплина очереди

| Режим | Поведение |
|-------|-----------|
| **FIFO** | Первым пришёл — первым обслужен (по умолчанию) |
| **Priority** | Токены с более высоким приоритетом обслуживаются первыми |

<!-- screenshot: панель ресурсов с настройками ролей и очередей -->

---

## 6. Классы прибытия (Arrival Classes)

Классы прибытия определяют, как токены входят в процесс через начальное событие.

Для каждого класса задайте:

- **Количество экземпляров** — сколько токенов генерирует этот класс.
- **Интервал прибытия** — время между последовательными токенами.
- **Приоритет** — используется, если дисциплина очереди установлена в «Priority».

<!-- screenshot: настройка классов прибытия -->

---

## 7. Запуск детерминированного прогона токенов

Детерминированный прогон моделирует ровно один сценарий, используя средние (или фиксированные) значения всех параметров. Это полезно для проверки корректности схемы.

1. Убедитесь, что схема завершена: есть начальное событие, конечное событие и все элементы соединены.
2. Нажмите кнопку **▶** на панели симуляции.
3. Симулятор покажет путь токена по схеме, итоговое время и стоимость.

<!-- screenshot: запущенный детерминированный прогон с подсвеченным путём токена -->

---

## 8. Запуск симуляции Монте-Карло

Симуляция Монте-Карло запускает процесс многократно (по умолчанию 500 итераций) со случайными значениями параметров в заданных диапазонах.

1. Нажмите кнопку **◌ MC 500** на панели симуляции.
2. После завершения отобразится таблица статистики:

| Показатель | Описание |
|------------|----------|
| **Min** | Минимальное наблюдаемое время |
| **Mean** | Среднее время |
| **σ** | Стандартное отклонение |
| **P50** | Медиана (50-й перцентиль) |
| **P90** | 90-й перцентиль |
| **P95** | 95-й перцентиль |
| **Max** | Максимальное наблюдаемое время |

<!-- screenshot: таблица результатов Монте-Карло -->

Используйте P90 и P95 для оценки худшего реалистичного сценария при планировании.

---

## 9. SLA-порог

В панели симуляции можно задать **SLA-порог** — целевое максимальное время выполнения процесса.

После завершения Монте-Карло приложение покажет, какой процент итераций уложился в заданный SLA. Если показатель слишком низкий, оптимизируйте схему: добавьте ресурсы, сократите длительность задач или измените маршрутизацию.

<!-- screenshot: поле SLA-порога и результирующий процент соответствия -->

---

## 10. Ограничение на количество шагов

Симулятор имеет встроенную защиту от бесконечных циклов. Если токен делает слишком много шагов за одну итерацию, появляется ошибка:

> «Превышен лимит шагов симуляции. Проверьте наличие завершающей ветви.»

**Как исправить:**

1. Найдите циклические участки схемы (циклы через шлюзы).
2. Убедитесь, что у каждого XOR-шлюза есть хотя бы одна ветвь, ведущая к конечному событию.
3. Если цикл намеренный, добавьте ветвь с условием выхода и ненулевой вероятностью.

<!-- screenshot: пример схемы с добавленной завершающей ветвью -->

---

## 11. Симуляция недоступна в режиме предпросмотра истории

Кнопки **▶** и **◌ MC 500** отключены, пока активен режим предпросмотра панели «История». Сначала выйдите из предпросмотра (нажмите «Вернуться» в баннере), а затем запустите симуляцию.

---

---

# BPMN Simulation

## 1. Supported BPMN Elements

MiroBoard supports the following BPMN elements:

| Element | Description |
|---------|-------------|
| **Task** | A unit of work; has duration, role, and cost |
| **Start Event** | Token entry point |
| **End Event** | Token termination point |
| **XOR Gateway** | Exclusive choice: token follows exactly one path |
| **AND Gateway** | Parallel split / join: token follows all paths |
| **Sequence Flow** | Arrow connecting elements |

<!-- screenshot: BPMN element palette -->

---

## 2. Adding a BPMN Element to the Canvas

1. **Long-press** on an empty area of the canvas for about 0.5–1 second.
2. The **BPMN palette** appears with available elements.
3. Without releasing, drag to the desired element and release — it is placed on the canvas.

<!-- screenshot: long-press triggering the BPMN palette -->

> **Tip.** A regular (short) click draws a standard shape. Always use a long-press for BPMN elements.

---

## 3. Connecting Elements with Flows and XOR Branch Probabilities

### Creating a flow

1. Hover over the source element — connection points appear on its edges.
2. Drag from a connection point to the target element.
3. Release on the target — the flow is created.

<!-- screenshot: drawing a flow between a task and a gateway -->

### XOR gateway branch probabilities

Each outgoing flow from an XOR gateway carries a probability (0 to 1). All outgoing probabilities must sum to 1.

1. Click the flow leaving the XOR gateway.
2. In the properties panel enter the probability value (e.g., `0.7`).
3. Repeat for the remaining outgoing flows.

<!-- screenshot: flow properties panel with probability field -->

---

## 4. Configuring a Task

Select a task on the canvas — the properties panel opens.

### Duration distribution

Choose a distribution type and fill in the parameters:

| Type | Parameters |
|------|------------|
| **Fixed** | Single duration value |
| **Uniform** | Minimum and maximum |
| **Triangular** | Minimum, maximum, and mode |

### Role and cost

- **Role** — select from the roles defined in the Resources panel (or add a new one).
- **Cost** — cost per execution of the task (used in the summary statistics).

<!-- screenshot: task properties panel with duration, role, and cost fields -->

---

## 5. Resources Panel

Open the **Resources** panel via the menu or sidebar icon.

### Role capacity

For each role set the maximum number of workers available in parallel. If tokens arrive faster than the role can process them, they queue up.

### Queue discipline

| Mode | Behaviour |
|------|-----------|
| **FIFO** | First in, first out (default) |
| **Priority** | Higher-priority tokens are served first |

<!-- screenshot: Resources panel with role and queue settings -->

---

## 6. Arrival Classes

Arrival classes control how tokens enter the process through the start event.

For each class configure:

- **Instance count** — how many tokens this class generates.
- **Inter-arrival interval** — time between successive tokens.
- **Priority** — used when the queue discipline is set to Priority.

<!-- screenshot: arrival class configuration -->

---

## 7. Running the Deterministic Token Runner

The deterministic runner simulates exactly one scenario using the mean (or fixed) value of every parameter. Use it to verify that the diagram is wired correctly.

1. Make sure the diagram is complete: it has a start event, an end event, and all elements are connected.
2. Click the **▶** button on the simulation panel.
3. The runner highlights the token path through the diagram and reports total time and cost.

<!-- screenshot: deterministic run with highlighted token path -->

---

## 8. Running Monte Carlo Simulation

The Monte Carlo simulation runs the process many times (500 iterations by default) with random parameter values sampled from the configured distributions.

1. Click the **◌ MC 500** button on the simulation panel.
2. When finished, a statistics table appears:

| Metric | Description |
|--------|-------------|
| **Min** | Minimum observed time |
| **Mean** | Average time |
| **σ** | Standard deviation |
| **P50** | Median (50th percentile) |
| **P90** | 90th percentile |
| **P95** | 95th percentile |
| **Max** | Maximum observed time |

<!-- screenshot: Monte Carlo results table -->

Use P90 and P95 to plan for realistic worst-case scenarios.

---

## 9. SLA Threshold

In the simulation panel you can set an **SLA threshold** — the target maximum end-to-end process time.

After the Monte Carlo run the app shows what percentage of iterations completed within the SLA. If the number is too low, optimise the diagram: add resources, reduce task durations, or adjust routing.

<!-- screenshot: SLA threshold field and resulting compliance percentage -->

---

## 10. The Step Limit Guard

The simulator has a built-in guard against infinite loops. If a token takes too many steps in a single iteration, an error appears:

> "Simulation step limit exceeded. Check that a terminating branch exists."

**How to fix:**

1. Find cyclic sections in the diagram (loops through gateways).
2. Make sure every XOR gateway has at least one branch leading to an end event.
3. If the loop is intentional, add an exit branch with a non-zero probability.

<!-- screenshot: example diagram with an added terminating branch -->

---

## 11. Simulation Is Disabled During History Preview

The **▶** and **◌ MC 500** buttons are disabled while the «История» panel's preview mode is active. Exit preview first (click "Return" in the banner), then run the simulation.
