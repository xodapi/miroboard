import React, { useState } from 'react';
import './help-panel.css';

export function HelpPanel() {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <>
      <button 
        className="help-button" 
        onClick={() => setIsOpen(true)}
        aria-label="Открыть справку"
      >
        ?
      </button>
      
      {isOpen && (
        <>
          <div className="help-backdrop" onClick={() => setIsOpen(false)} />
          <aside className="help-panel">
            <div className="help-header">
              <h1>Руководство по симуляции BPMN для железнодорожной логистики</h1>
              <button 
                className="help-close" 
                onClick={() => setIsOpen(false)}
                aria-label="Закрыть справку"
              >
                ×
              </button>
            </div>
            
            <div className="help-content">
              <section>
                <h2>1. Основы симуляции процессов</h2>

                <h3>Что такое симуляция процесса?</h3>
                <p>Симуляция процесса — это виртуальное моделирование реальной работы вашей железнодорожной системы. Вместо того чтобы ждать месяцы, чтобы увидеть, как изменения повлияют на работу, вы создаете цифровую модель и "прогоняете" через неё тысячи виртуальных заявок и составов.</p>
                <p>Представьте, что у вас есть копия всей станции в компьютере — с диспетчерами, маневровыми локомотивами, инспекторами по технической приемке, путями классификации. Вы можете "запустить время вперёд" и посмотреть, что произойдёт.</p>

                <h3>Зачем нужна симуляция?</h3>
                <p>Симуляция помогает ответить на конкретные вопросы <strong>до того</strong>, как вы примете решение:</p>
                <ul>
                  <li><strong>Хватит ли 3 диспетчеров для приема 45-60 грузовых заявок в смену?</strong> Симуляция покажет, сколько заявок будут ожидать в очереди и как долго.</li>
                  <li><strong>Что будет, если один маневровый локомотив уйдёт на ремонт?</strong> Вы увидите, насколько вырастет время формирования составов.</li>
                  <li><strong>Нужен ли дополнительный инспектор в ночную смену?</strong> Симуляция рассчитает загрузку каждого инспектора и покажет узкие места.</li>
                </ul>
                <p>Без симуляции вы можете только гадать. С симуляцией вы видите конкретные цифры: "Средняя очередь вырастет с 2 до 7 заявок, время ожидания увеличится с 45 минут до 3 часов". Это даёт вам возможность принимать обоснованные решения.</p>
              </section>

              <section>
                <h2>2. Что такое симуляция Монте-Карло?</h2>

                <h3>Почему операции занимают разное время?</h3>
                <p>В реальной жизни одна и та же операция никогда не занимает точно одинаковое время. Возьмём <strong>формирование состава на станции классификации</strong>:</p>
                
                <div className="example">
                  <strong>Пример из практики:</strong>
                  <ul>
                    <li><strong>Простой состав</strong> (транзитный поезд без переформирования): 1-3 часа</li>
                    <li><strong>Стандартная классификация</strong>: 4-8 часов</li>
                    <li><strong>Сложное формирование</strong> (многонаправленный состав): 8-16 часов</li>
                  </ul>
                </div>

                <p><strong>Что влияет на время?</strong></p>
                <ul>
                  <li>Количество вагонов для сортировки (60 или 120 вагонов)</li>
                  <li>Сложность маршрута (одно направление или 5 разных)</li>
                  <li>Доступность маневровых локомотивов (2 работают или только 1)</li>
                  <li>Конфигурация путей (свободны ли нужные пути классификации)</li>
                  <li>Погодные условия (гололёд замедляет маневровые работы на 20-30%)</li>
                  <li>Смена бригады (операция прервана на 30-60 минут)</li>
                </ul>
                <p>Даже при нормальных условиях одно и то же действие может занять 4 или 7 часов — это <strong>естественная вариативность</strong> процесса.</p>

                <h3>Метод Монте-Карло: зачем 500 прогонов?</h3>
                <p>Симуляция Монте-Карло работает так:</p>
                <ol>
                  <li>
                    <strong>Для каждой операции вы задаёте диапазон времени вместо фиксированного значения</strong>
                    <ul>
                      <li>Формирование состава: 4-8 часов (нормальное распределение)</li>
                      <li>Техническая приемка: 30-45 минут (85% случаев), 3-8 часов (5% случаев — найдена неисправность)</li>
                    </ul>
                  </li>
                  <li>
                    <strong>Система запускает процесс 500 раз (или 1000, или больше)</strong>
                    <ul>
                      <li>В каждом прогоне случайным образом выбирается конкретное время из диапазона</li>
                      <li>Прогон №1: формирование заняло 5.2 часа, приемка 35 минут</li>
                      <li>Прогон №2: формирование заняло 7.8 часа, приемка 41 минута</li>
                      <li>Прогон №37: формирование заняло 6.1 часа, приемка 4.5 часа (найдена трещина на колесе)</li>
                    </ul>
                  </li>
                  <li>
                    <strong>После 500 прогонов вы получаете распределение результатов</strong>
                    <ul>
                      <li>Среднее время обработки: 8.2 часа</li>
                      <li>P50 (медиана): 7.5 часов — половина составов обработана быстрее</li>
                      <li>P90: 12.3 часа — 90% составов уложились в это время</li>
                      <li>P95: 15.8 часов — только 5% составов задержались дольше</li>
                    </ul>
                  </li>
                </ol>

                <div className="diagram">
                  <svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
                    <line x1="50" y1="250" x2="550" y2="250" stroke="#666" strokeWidth="2"/>
                    <line x1="50" y1="250" x2="50" y2="50" stroke="#666" strokeWidth="2"/>
                    <text x="20" y="150" fill="#666" fontSize="12" transform="rotate(-90 20 150)">Частота</text>
                    <text x="300" y="280" textAnchor="middle" fill="#666" fontSize="12">Значение</text>
                    <rect x="70" y="220" width="30" height="30" fill="#0066cc" opacity="0.7"/>
                    <rect x="110" y="190" width="30" height="60" fill="#0066cc" opacity="0.7"/>
                    <rect x="150" y="150" width="30" height="100" fill="#0066cc" opacity="0.7"/>
                    <rect x="190" y="120" width="30" height="130" fill="#28a745" opacity="0.7"/>
                    <rect x="230" y="80" width="30" height="170" fill="#28a745" opacity="0.8"/>
                    <rect x="270" y="90" width="30" height="160" fill="#28a745" opacity="0.8"/>
                    <rect x="310" y="70" width="30" height="180" fill="#ff9500" opacity="0.8"/>
                    <rect x="350" y="100" width="30" height="150" fill="#28a745" opacity="0.8"/>
                    <rect x="390" y="130" width="30" height="120" fill="#28a745" opacity="0.7"/>
                    <rect x="430" y="170" width="30" height="80" fill="#0066cc" opacity="0.7"/>
                    <rect x="470" y="210" width="30" height="40" fill="#0066cc" opacity="0.7"/>
                    <rect x="510" y="230" width="30" height="20" fill="#0066cc" opacity="0.7"/>
                    <line x1="310" y1="50" x2="310" y2="250" stroke="#ff9500" strokeWidth="2" strokeDasharray="5,5"/>
                    <text x="315" y="45" fill="#ff9500" fontSize="11">Среднее</text>
                    <rect x="450" y="20" width="15" height="15" fill="#28a745" opacity="0.8"/>
                    <text x="470" y="32" fill="#666" fontSize="11">Норма</text>
                  </svg>
                  <p><em>Гистограмма распределения времени обработки состава после 500 прогонов — большинство значений 6-10 часов, длинный "хвост" до 18 часов из-за редких проблем</em></p>
                </div>

                <h3>Почему это важно?</h3>
                <p>Если бы вы смотрели только на среднее значение (8.2 часа), вы могли бы подумать, что процесс стабилен. Но <strong>P95 = 15.8 часов</strong> говорит: "В 5% случаев (каждый 20-й состав) будет задержка почти вдвое больше". Это критично для планирования ресурсов и SLA.</p>
              </section>

              <section>
                <h2>3. Пошаговое объяснение работы симуляции</h2>

                <h3>Шаг 1: Валидация модели процесса</h3>
                <p>Перед запуском система проверяет ваш BPMN-процесс:</p>
                <ul>
                  <li>Все ли задачи соединены корректно?</li>
                  <li>Есть ли у каждой задачи указание времени выполнения?</li>
                  <li>Указаны ли ресурсы (диспетчеры, инспекторы, локомотивы)?</li>
                  <li>Корректны ли условия на шлюзах (Gateway)?</li>
                </ul>
                <p><strong>Пример ошибки:</strong> "Задача 'Техническая приемка' требует ресурс 'Инспектор', но ни один ресурс с таким именем не объявлен". Вы исправляете и запускаете снова.</p>

                <h3>Шаг 2: Создание виртуальных заявок</h3>
                <p>Система генерирует поток заявок на основе ваших настроек:</p>
                <ul>
                  <li><strong>Класс прибытия "Грузовые составы"</strong>: 15 заявок в час (в среднем)</li>
                  <li><strong>Класс прибытия "Экспресс-контейнеры"</strong>: 3 заявки в час, приоритет "Высокий"</li>
                </ul>
                <p>Заявки создаются с реалистичной вариативностью — не точно каждые 4 минуты, а с естественными колебаниями (распределение Пуассона).</p>
                <div className="example">
                  <strong>За смену 8 часов:</strong>
                  <ul>
                    <li>Ожидается: 15 × 8 = 120 составов</li>
                    <li>Реально приходит: от 105 до 135 (случайная вариация)</li>
                  </ul>
                </div>

                <h3>Шаг 3: Token Runner — движение заявок по процессу</h3>
                <p>Каждая заявка представлена <strong>токеном</strong> — виртуальным объектом, который движется по вашему BPMN-процессу:</p>
                <ol>
                  <li>Токен приходит в первую задачу: "Приём заявки диспетчером"</li>
                  <li>Проверяется: доступен ли ресурс "Диспетчер"?
                    <ul>
                      <li>Если <strong>да</strong> — токен "захватывает" диспетчера и начинается выполнение (15-30 минут)</li>
                      <li>Если <strong>нет</strong> — токен встаёт в очередь FIFO и ждёт</li>
                    </ul>
                  </li>
                  <li>По окончании задачи ресурс "Диспетчер" освобождается и становится доступным для следующей заявки</li>
                  <li>Токен переходит к следующей задаче: "Назначение пути классификации"</li>
                </ol>

                <div className="diagram">
                  <svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
                    <rect x="20" y="70" width="100" height="60" fill="#0066cc" rx="5"/>
                    <text x="70" y="105" textAnchor="middle" fill="white" fontSize="14">Начало</text>
                    <path d="M 120 100 L 160 100" stroke="#666" strokeWidth="2" fill="none" markerEnd="url(#arrow)"/>
                    <rect x="160" y="70" width="100" height="60" fill="#0066cc" rx="5"/>
                    <text x="210" y="95" textAnchor="middle" fill="white" fontSize="12">Обработка</text>
                    <text x="210" y="110" textAnchor="middle" fill="white" fontSize="12">данных</text>
                    <path d="M 260 100 L 300 100" stroke="#666" strokeWidth="2" fill="none" markerEnd="url(#arrow)"/>
                    <rect x="300" y="70" width="100" height="60" fill="#28a745" rx="5"/>
                    <text x="350" y="95" textAnchor="middle" fill="white" fontSize="12">Симуляция</text>
                    <text x="350" y="110" textAnchor="middle" fill="white" fontSize="12">Monte Carlo</text>
                    <path d="M 400 100 L 440 100" stroke="#666" strokeWidth="2" fill="none" markerEnd="url(#arrow)"/>
                    <rect x="440" y="70" width="100" height="60" fill="#0066cc" rx="5"/>
                    <text x="490" y="105" textAnchor="middle" fill="white" fontSize="14">Результат</text>
                    <defs>
                      <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
                      </marker>
                    </defs>
                  </svg>
                  <p><em>Визуализация движения токенов через процесс — несколько токенов в разных задачах одновременно</em></p>
                </div>

                <h3>Шаг 4: Учёт ресурсов и очередей</h3>
                <div className="example">
                  <strong>Пример с маневровыми локомотивами:</strong>
                  <ul>
                    <li>У вас на станции <strong>2 маневровых локомотива</strong></li>
                    <li>Задача "Формирование состава" требует 1 локомотив на 4-8 часов</li>
                  </ul>
                </div>

                <p><strong>Что происходит в симуляции:</strong></p>
                <ul>
                  <li>1-й состав приходит в 08:00 → захватывает локомотив №1 → работа до 13:30</li>
                  <li>2-й состав приходит в 08:15 → захватывает локомотив №2 → работа до 14:00</li>
                  <li>3-й состав приходит в 09:00 → <strong>оба локомотива заняты</strong> → ожидает в очереди</li>
                  <li>Локомотив №1 освобождается в 13:30 → 3-й состав начинает формирование</li>
                </ul>

                <div className="diagram">
                  <svg viewBox="0 0 600 250" xmlns="http://www.w3.org/2000/svg">
                    <text x="50" y="30" fill="#666" fontSize="13" fontWeight="bold">Доступные локомотивы (3)</text>
                    <rect x="50" y="50" width="80" height="50" fill="#28a745" rx="5"/>
                    <circle cx="70" cy="75" r="8" fill="white"/>
                    <circle cx="110" cy="75" r="8" fill="white"/>
                    <text x="90" y="100" textAnchor="middle" fill="white" fontSize="11">Лок-1</text>
                    <rect x="150" y="50" width="80" height="50" fill="#28a745" rx="5"/>
                    <circle cx="170" cy="75" r="8" fill="white"/>
                    <circle cx="210" cy="75" r="8" fill="white"/>
                    <text x="190" y="100" textAnchor="middle" fill="white" fontSize="11">Лок-2</text>
                    <rect x="250" y="50" width="80" height="50" fill="#28a745" rx="5"/>
                    <circle cx="270" cy="75" r="8" fill="white"/>
                    <circle cx="310" cy="75" r="8" fill="white"/>
                    <text x="290" y="100" textAnchor="middle" fill="white" fontSize="11">Лок-3</text>
                    <text x="50" y="150" fill="#666" fontSize="13" fontWeight="bold">Ожидающие поезда (5)</text>
                    <rect x="50" y="170" width="60" height="40" fill="#0066cc" rx="3"/>
                    <rect x="55" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="75" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="95" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <text x="80" y="230" textAnchor="middle" fill="#666" fontSize="10">П-1</text>
                    <rect x="130" y="170" width="60" height="40" fill="#0066cc" rx="3"/>
                    <rect x="135" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="155" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="175" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <text x="160" y="230" textAnchor="middle" fill="#666" fontSize="10">П-2</text>
                    <rect x="210" y="170" width="60" height="40" fill="#ff9500" rx="3"/>
                    <rect x="215" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="235" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="255" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <text x="240" y="230" textAnchor="middle" fill="#666" fontSize="10">П-3</text>
                    <rect x="290" y="170" width="60" height="40" fill="#0066cc" rx="3"/>
                    <rect x="295" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="315" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="335" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <text x="320" y="230" textAnchor="middle" fill="#666" fontSize="10">П-4</text>
                    <rect x="370" y="170" width="60" height="40" fill="#0066cc" rx="3"/>
                    <rect x="375" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="395" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <rect x="415" y="175" width="15" height="30" fill="white" opacity="0.3"/>
                    <text x="400" y="230" textAnchor="middle" fill="#666" fontSize="10">П-5</text>
                    <circle cx="240" cy="165" r="8" fill="#ff9500"/>
                    <text x="240" y="169" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">!</text>
                  </svg>
                  <p><em>Система управления очередью: 3 локомотива обслуживают 5 ожидающих поездов, приоритетный поезд выделен оранжевым</em></p>
                </div>

                <p>Симуляция точно отслеживает:</p>
                <ul>
                  <li>Сколько времени каждый состав ждал</li>
                  <li>Какой процент времени локомотивы были заняты (utilization)</li>
                  <li>Сколько составов ждали одновременно (размер очереди)</li>
                </ul>

                <h3>Шаг 5: Сбор статистики</h3>
                <p>После каждого прогона система собирает данные:</p>
                <ul>
                  <li><strong>Время выполнения каждой задачи</strong> для каждой заявки</li>
                  <li><strong>Время ожидания в очередях</strong></li>
                  <li><strong>Полное время цикла</strong> (от начала до конца процесса)</li>
                  <li><strong>Загрузка ресурсов</strong> (сколько времени были заняты)</li>
                  <li><strong>Нарушения SLA</strong> (сколько заявок не уложились в норматив)</li>
                </ul>
                <p>После 500 прогонов вы получаете агрегированные метрики: среднее, медиану, процентили, min/max.</p>
              </section>

              <section>
                <h2>4. Глоссарий терминов с железнодорожными примерами</h2>

                <h3>SLA (Service Level Agreement) — Норматив обслуживания</h3>
                <p><strong>Определение:</strong> Обязательство выполнить операцию за определённое время.</p>
                <div className="example">
                  <strong>Пример из ЖД:</strong>
                  <ul>
                    <li>SLA для обработки состава на грузовой станции: <strong>не более 24 часов от прибытия до отправления</strong></li>
                    <li>В симуляции 500 прогонов: 437 составов уложились в 24 часа (87.4%), 63 состава превысили норматив (12.6%)</li>
                    <li><strong>Вывод:</strong> Текущие ресурсы недостаточны для выполнения SLA в 95% случаев</li>
                  </ul>
                </div>

                <h3>Прогон (Run, Iteration)</h3>
                <p><strong>Определение:</strong> Одна полная симуляция процесса с уникальным набором случайных значений.</p>
                <div className="example">
                  <strong>Пример из ЖД:</strong>
                  <ul>
                    <li>Прогон №1: Обработано 118 составов за 8-часовую смену, среднее время обработки 6.8 часа</li>
                    <li>Прогон №2: Обработано 121 состав, среднее время 7.2 часа (в этом прогоне случайно было больше сложных формирований)</li>
                    <li>Прогон №250: Обработано 109 составов, среднее время 9.1 часа (в этом прогоне был инцидент — техническая неисправность задержала 3 состава на 4+ часа)</li>
                  </ul>
                </div>
                <p><strong>Зачем много прогонов?</strong> Один прогон может быть "удачным" или "неудачным" случайно. 500 прогонов дают статистически значимую картину.</p>

                <h3>P50, P90, P95 — Процентили</h3>
                <p><strong>Определение:</strong> Значение, ниже которого находится указанный процент измерений.</p>
                <div className="example">
                  <strong>Пример из ЖД — время приёмки состава:</strong>
                  <ul>
                    <li><strong>P50 (медиана) = 52 минуты</strong>: Половина составов обработана быстрее, половина медленнее</li>
                    <li><strong>P90 = 78 минут</strong>: 90% составов обработано за это время или быстрее; 10% занимают больше времени</li>
                    <li><strong>P95 = 245 минут (4.1 часа)</strong>: Только 5% составов задерживаются так долго — это редкие случаи, когда найдены серьёзные технические неисправности (трещина колеса, неисправность тормозной системы)</li>
                  </ul>
                </div>

                <h3>Очередь FIFO (First In, First Out)</h3>
                <p><strong>Определение:</strong> Дисциплина очереди "первым пришёл — первым обслужен".</p>
                <div className="example">
                  <strong>Пример из ЖД:</strong>
                  <ul>
                    <li>Составы ожидают освобождения маневрового локомотива</li>
                    <li>Состав А прибыл в 08:00, состав Б прибыл в 08:15, состав В прибыл в 08:30</li>
                    <li>Когда локомотив освободится в 09:00, он начнёт работу с составом А (первый в очереди)</li>
                  </ul>
                </div>

                <div className="diagram">
                  <svg viewBox="0 0 600 280" xmlns="http://www.w3.org/2000/svg">
                    <text x="150" y="30" textAnchor="middle" fill="#666" fontSize="14" fontWeight="bold">FIFO (First In First Out)</text>
                    <rect x="30" y="50" width="240" height="100" fill="#f5f5f5" stroke="#666" strokeWidth="2" rx="5"/>
                    <rect x="50" y="70" width="50" height="60" fill="#0066cc" rx="3"/>
                    <text x="75" y="105" textAnchor="middle" fill="white" fontSize="12">П-1</text>
                    <text x="75" y="140" textAnchor="middle" fill="#666" fontSize="9">t=0</text>
                    <text x="108" y="105" textAnchor="middle" fill="#666" fontSize="18">→</text>
                    <rect x="120" y="70" width="50" height="60" fill="#0066cc" rx="3"/>
                    <text x="145" y="105" textAnchor="middle" fill="white" fontSize="12">П-2</text>
                    <text x="145" y="140" textAnchor="middle" fill="#666" fontSize="9">t=1</text>
                    <text x="178" y="105" textAnchor="middle" fill="#666" fontSize="18">→</text>
                    <rect x="190" y="70" width="50" height="60" fill="#0066cc" rx="3"/>
                    <text x="215" y="105" textAnchor="middle" fill="white" fontSize="12">П-3</text>
                    <text x="215" y="140" textAnchor="middle" fill="#666" fontSize="9">t=2</text>
                    <text x="450" y="30" textAnchor="middle" fill="#666" fontSize="14" fontWeight="bold">Priority Queue</text>
                    <rect x="330" y="50" width="240" height="100" fill="#f5f5f5" stroke="#666" strokeWidth="2" rx="5"/>
                    <rect x="350" y="70" width="50" height="60" fill="#ff9500" rx="3"/>
                    <text x="375" y="105" textAnchor="middle" fill="white" fontSize="12">П-3</text>
                    <text x="375" y="140" textAnchor="middle" fill="#666" fontSize="9">pri=1</text>
                    <circle cx="365" cy="65" r="6" fill="#ff9500"/>
                    <text x="365" y="69" textAnchor="middle" fill="white" fontSize="9" fontWeight="bold">!</text>
                    <text x="408" y="105" textAnchor="middle" fill="#666" fontSize="18">→</text>
                    <rect x="420" y="70" width="50" height="60" fill="#0066cc" rx="3"/>
                    <text x="445" y="105" textAnchor="middle" fill="white" fontSize="12">П-1</text>
                    <text x="445" y="140" textAnchor="middle" fill="#666" fontSize="9">pri=2</text>
                    <text x="478" y="105" textAnchor="middle" fill="#666" fontSize="18">→</text>
                    <rect x="490" y="70" width="50" height="60" fill="#0066cc" rx="3"/>
                    <text x="515" y="105" textAnchor="middle" fill="white" fontSize="12">П-2</text>
                    <text x="515" y="140" textAnchor="middle" fill="#666" fontSize="9">pri=3</text>
                    <rect x="150" y="180" width="300" height="80" fill="#fff9e6" stroke="#ff9500" strokeWidth="1" rx="3"/>
                    <text x="300" y="205" textAnchor="middle" fill="#666" fontSize="13" fontWeight="bold">Основное отличие</text>
                    <text x="300" y="225" textAnchor="middle" fill="#666" fontSize="11">FIFO: обработка в порядке прибытия</text>
                    <text x="300" y="245" textAnchor="middle" fill="#666" fontSize="11">Priority: обработка по приоритету задачи</text>
                  </svg>
                  <p><em>Сравнение стратегий обработки очереди: FIFO сохраняет порядок прибытия, Priority обслуживает срочные задачи первыми</em></p>
                </div>

                <h3>Распределение (Distribution)</h3>
                <p><strong>Определение:</strong> Математическая функция, описывающая вариативность времени выполнения задачи.</p>
                <p><strong>Типы распределений в ЖД симуляции:</strong></p>

                <p><strong>Нормальное распределение (Normal/Gaussian):</strong></p>
                <ul>
                  <li>Используется для: Стандартные операции без экстремальных выбросов</li>
                  <li>Пример: Техническая приемка вагона: среднее 35 минут, стандартное отклонение 8 минут</li>
                  <li>68% случаев: 27-43 минуты, 95% случаев: 19-51 минута</li>
                </ul>

                <p><strong>Логнормальное распределение (Log-Normal):</strong></p>
                <ul>
                  <li>Используется для: Операции, которые не могут быть отрицательными и имеют "длинный хвост"</li>
                  <li>Пример: Время ожидания в очереди — большинство составов ждут мало (10-30 минут), но редко бывают долгие ожидания (2-4 часа)</li>
                </ul>

                <p><strong>Треугольное распределение (Triangular):</strong></p>
                <ul>
                  <li>Задаётся тремя значениями: минимум, наиболее вероятное, максимум</li>
                  <li>Пример: Формирование состава: мин 4 часа, типично 6 часов, макс 10 часов</li>
                  <li>Простое в настройке, хорошо для начальных моделей</li>
                </ul>
              </section>

              <section>
                <h2>5. Как читать результаты симуляции</h2>
                <p>После завершения симуляции вы видите панель результатов. Вот как интерпретировать ключевые метрики:</p>

                <div className="diagram">
                  <svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
                    <rect x="20" y="20" width="560" height="260" fill="#f5f5f5" stroke="#666" strokeWidth="2" rx="5"/>
                    <text x="300" y="50" textAnchor="middle" fill="#666" fontSize="16" fontWeight="bold">Результаты симуляции</text>
                    <rect x="40" y="80" width="160" height="80" fill="white" stroke="#0066cc" strokeWidth="2" rx="3"/>
                    <text x="120" y="105" textAnchor="middle" fill="#666" fontSize="12">Среднее время</text>
                    <text x="120" y="135" textAnchor="middle" fill="#0066cc" fontSize="24" fontWeight="bold">42.5</text>
                    <text x="120" y="155" textAnchor="middle" fill="#666" fontSize="11">мин</text>
                    <rect x="220" y="80" width="160" height="80" fill="white" stroke="#28a745" strokeWidth="2" rx="3"/>
                    <text x="300" y="105" textAnchor="middle" fill="#666" fontSize="12">Использование</text>
                    <text x="300" y="135" textAnchor="middle" fill="#28a745" fontSize="24" fontWeight="bold">87%</text>
                    <text x="300" y="155" textAnchor="middle" fill="#666" fontSize="11">ресурсов</text>
                    <rect x="400" y="80" width="160" height="80" fill="white" stroke="#ff9500" strokeWidth="2" rx="3"/>
                    <text x="480" y="105" textAnchor="middle" fill="#666" fontSize="12">Пропускная</text>
                    <text x="480" y="135" textAnchor="middle" fill="#ff9500" fontSize="24" fontWeight="bold">156</text>
                    <text x="480" y="155" textAnchor="middle" fill="#666" fontSize="11">поездов/день</text>
                    <text x="40" y="190" fill="#666" fontSize="12">Итераций выполнено:</text>
                    <rect x="40" y="200" width="520" height="25" fill="white" stroke="#666" strokeWidth="1" rx="3"/>
                    <rect x="40" y="200" width="390" height="25" fill="#0066cc" rx="3"/>
                    <text x="300" y="217" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">75% (7500/10000)</text>
                    <line x1="120" y1="170" x2="120" y2="190" stroke="#0066cc" strokeWidth="1" strokeDasharray="3,3"/>
                    <text x="120" y="245" textAnchor="middle" fill="#0066cc" fontSize="10">↑ Целевой показатель: &lt;45 мин</text>
                    <circle cx="550" cy="265" r="8" fill="#28a745"/>
                    <text x="530" y="270" textAnchor="end" fill="#666" fontSize="11">Активно</text>
                  </svg>
                  <p><em>Панель отображает ключевые метрики: среднее время обслуживания, использование ресурсов и пропускную способность</em></p>
                </div>

                <h3>Панель "Общие результаты"</h3>
                <p><strong>Completed runs: 500/500</strong></p>
                <ul>
                  <li>Все 500 прогонов завершились успешно</li>
                  <li>Если меньше: были ошибки в модели (например, бесконечный цикл)</li>
                </ul>

                <h3>Панель "Время цикла" (Cycle Time)</h3>
                <p><strong>Mean cycle time: 8.2 hours</strong> — Среднее полное время обработки состава от прибытия до готовности к отправлению</p>
                <p><strong>P50: 7.5 hours</strong> — Медиана, типичный случай. Половина составов обработана быстрее.</p>
                <p><strong>P90: 12.3 hours</strong> — 90% составов укладывается в это время</p>
                <p><strong>P95: 15.8 hours</strong> — Только 5% составов задерживаются дольше</p>
              </section>

              <section>
                <h2>6. Три пошаговых сценария применения</h2>

                <h3>Сценарий 1: Хватает ли инспекторов по технической приемке?</h3>
                <p><strong>Ситуация:</strong> На вашей станции 2 инспектора в дневную смену. Вы хотите понять, достаточно ли этого для обработки 20-25 составов за смену.</p>

                <p><strong>Шаг 1: Настройка модели</strong></p>
                <ul>
                  <li>Создайте процесс в BPMN: Прибытие → Ожидание инспектора → Техприемка → Отправление</li>
                  <li>Задача "Техприемка": требует ресурс "Инспектор", время выполнения 45-90 минут</li>
                  <li>Ресурс "Инспектор": количество = 2</li>
                  <li>Класс прибытия: 22 состава в смену (8 часов)</li>
                </ul>

                <p><strong>Шаг 2: Запуск симуляции</strong> — Запустите 500 прогонов, каждый прогон = 8-часовая смена</p>

                <p><strong>Шаг 3: Анализ результатов</strong></p>
                <ul>
                  <li>Average wait time для задачи "Техприемка": 45 минут</li>
                  <li>Max wait time: 3.2 часа (в пиковые моменты)</li>
                  <li>Utilization инспекторов: 68%</li>
                </ul>

                <h3>Сценарий 2: Ищем узкое место в процессе обработки заявок</h3>
                <p><strong>Ситуация:</strong> Полный процесс: Приём заявки → Назначение пути → Формирование состава → Техприемка → Отправление. Общее время 18-30 часов, но вы не знаете, где теряется время.</p>

                <p><strong>Решение:</strong> Добавьте checkpoint'ы в модель после каждого этапа и проанализируйте время между ними.</p>

                <div className="diagram">
                  <svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg">
                    <line x1="50" y1="150" x2="550" y2="150" stroke="#666" strokeWidth="3"/>
                    <circle cx="100" cy="150" r="10" fill="#0066cc" stroke="white" strokeWidth="2"/>
                    <text x="100" y="130" textAnchor="middle" fill="#666" fontSize="11" fontWeight="bold">v1.0</text>
                    <text x="100" y="180" textAnchor="middle" fill="#666" fontSize="10">Базовая</text>
                    <text x="100" y="195" textAnchor="middle" fill="#666" fontSize="10">модель</text>
                    <circle cx="220" cy="150" r="10" fill="#0066cc" stroke="white" strokeWidth="2"/>
                    <text x="220" y="130" textAnchor="middle" fill="#666" fontSize="11" fontWeight="bold">v1.1</text>
                    <text x="220" y="180" textAnchor="middle" fill="#666" fontSize="10">+Очереди</text>
                    <circle cx="340" cy="150" r="10" fill="#28a745" stroke="white" strokeWidth="2"/>
                    <text x="340" y="130" textAnchor="middle" fill="#28a745" fontSize="11" fontWeight="bold">v1.2</text>
                    <text x="340" y="180" textAnchor="middle" fill="#666" fontSize="10">+Приоритеты</text>
                    <circle cx="355" cy="135" r="5" fill="#28a745"/>
                    <text x="355" y="138" textAnchor="middle" fill="white" fontSize="8">✓</text>
                    <circle cx="400" cy="150" r="8" fill="#ff9500" stroke="white" strokeWidth="2"/>
                    <path d="M 400 150 Q 430 120, 460 90" stroke="#666" strokeWidth="2" fill="none" strokeDasharray="5,5"/>
                    <circle cx="460" cy="90" r="8" fill="#ff9500" stroke="white" strokeWidth="2"/>
                    <text x="460" y="75" textAnchor="middle" fill="#ff9500" fontSize="11" fontWeight="bold">v2.0-exp</text>
                    <text x="460" y="110" textAnchor="middle" fill="#666" fontSize="9">Эксперимент</text>
                    <circle cx="500" cy="150" r="10" fill="#0066cc" stroke="white" strokeWidth="2"/>
                    <text x="500" y="130" textAnchor="middle" fill="#666" fontSize="11" fontWeight="bold">v1.3</text>
                    <text x="500" y="180" textAnchor="middle" fill="#666" fontSize="10">+Оптимизация</text>
                    <rect x="50" y="230" width="200" height="50" fill="#f5f5f5" stroke="#666" strokeWidth="1" rx="3"/>
                    <circle cx="65" cy="250" r="6" fill="#28a745" stroke="white" strokeWidth="1"/>
                    <text x="80" y="254" fill="#666" fontSize="10">Текущая версия</text>
                    <circle cx="65" cy="268" r="6" fill="#ff9500" stroke="white" strokeWidth="1"/>
                    <text x="80" y="272" fill="#666" fontSize="10">Ветка разработки</text>
                    <polygon points="550,150 540,145 540,155" fill="#666"/>
                    <text x="560" y="155" fill="#666" fontSize="11">время</text>
                  </svg>
                  <p><em>История версий модели с возможностью откатов и параллельных веток для экспериментов</em></p>
                </div>

                <h3>Сценарий 3: Последовательная vs параллельная проверка</h3>
                <p><strong>Ситуация:</strong> Техническая приемка включает две независимые проверки: механическая инспекция (45 мин) и проверка документов (30 мин). Сейчас выполняются последовательно (75 мин). Стоит ли организовать параллельное выполнение?</p>
                <p><strong>Результат:</strong> Параллельная модель сокращает время с 78 до 51 минуты = <strong>35% ускорение</strong></p>
              </section>

              <section>
                <h2>Заключение</h2>
                <p>Симуляция процессов — это мощный инструмент для принятия обоснованных решений в железнодорожной логистике. Метод Монте-Карло позволяет учесть реальную вариативность операций и увидеть не только типичные случаи, но и редкие проблемные ситуации (P90, P95).</p>

                <p><strong>Ключевые принципы:</strong></p>
                <ol>
                  <li><strong>Моделируйте реалистично</strong>: Используйте реальные диапазоны времён из вашей практики</li>
                  <li><strong>Запускайте достаточно прогонов</strong>: Минимум 500, для точных процентилей — 1000+</li>
                  <li><strong>Смотрите на процентили, не только на среднее</strong>: P90 и P95 показывают, насколько плохо может быть</li>
                  <li><strong>Ищите узкие места</strong>: Высокая utilization ресурса (&gt;75%) + длинные очереди = узкое место</li>
                  <li><strong>Экспериментируйте безопасно</strong>: Симуляция позволяет проверить "что если?" без риска для реальной работы</li>
                </ol>
              </section>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
