import type { Theme } from '../board/theme'

export interface ProjectHistoryEntry {
  commit: string
  date: string
  title: string
  release?: string
}

export interface ProjectHistoryModalProps {
  theme: Theme
  repositoryUrl: string
  history: ProjectHistoryEntry[]
  onClose: () => void
}

/**
 * The development timeline, built from the commit list baked in at build time
 * (`__MIROBOARD_HISTORY__`). Read-only, and unrelated to the document timeline
 * in src/history/ — this one is about the project, not the user's board.
 *
 * The history array is passed in rather than read from the global so this file
 * has no build-time defines to declare, and so it can be rendered in a test.
 */
export function ProjectHistoryModal({ theme, repositoryUrl, history, onClose }: ProjectHistoryModalProps) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={onClose} data-ui>
      <section
        className={`w-full max-w-3xl max-h-[82vh] overflow-y-auto rounded-[28px] ${theme.dark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} shadow-2xl p-6`}
        onClick={event => event.stopPropagation()}
        data-testid="project-history-modal"
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-bold">История проекта</h2>
            <p className={`mt-1 text-sm ${theme.textSecondary}`}>Учебная хронология разработки MiroBoard, зафиксированная Git-коммитами.</p>
          </div>
          <button onClick={onClose} className={`size-9 rounded-xl text-lg ${theme.hoverBg}`} aria-label="Закрыть историю">×</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          <a href={repositoryUrl} target="_blank" rel="noreferrer" className={`rounded-2xl p-3 ${theme.dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-50 hover:bg-slate-100'} transition`}>
            <div className={`text-[11px] font-semibold ${theme.textSecondary}`}>Репозиторий</div>
            <div className="mt-1 text-sm font-bold">GitHub ↗</div>
          </a>
          <div className={`rounded-2xl p-3 ${theme.subtleSurface}`}>
            <div className={`text-[11px] font-semibold ${theme.textSecondary}`}>Автономный релиз</div>
            <div className="mt-1 text-sm font-bold">Один HTML-файл</div>
          </div>
          <div className={`rounded-2xl p-3 ${theme.subtleSurface}`}>
            <div className={`text-[11px] font-semibold ${theme.textSecondary}`}>Токены модели</div>
            <div className="mt-1 text-sm font-bold">Не измеряются достоверно</div>
          </div>
        </div>

        <div className={`rounded-2xl p-4 mb-5 ${theme.dark ? 'bg-indigo-950/70' : 'bg-indigo-50'}`}>
          <h3 className="text-sm font-bold">Стек и engineering harness</h3>
          <p className={`mt-1 text-[13px] leading-5 ${theme.textSecondary}`}>
            React, TypeScript, Vite, Tailwind, Yjs, WebRTC, IndexedDB и Rust/WASM. Factory Droid harness выполняет scoped-изменения, Rust/TypeScript-проверки, production build, Git commit/push и ведёт локальную операционную историю через jj.
          </p>
          <p className={`mt-2 text-[12px] leading-5 ${theme.textSecondary}`}>
            Git не содержит точных usage-метрик LLM, поэтому число токенов не выводится как оценка. Достоверный учёт возможен только при подключении telemetry API провайдера модели.
          </p>
        </div>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-bold">Как читать эту историю</h3>
          <p className={`mt-1 text-[13px] leading-5 ${theme.textSecondary}`}>
            <b>Commit</b>, например <code>394dec5</code>, это неизменяемый точный снимок исходного кода. По ссылке можно увидеть, какие файлы и почему изменились. <b>Release</b>, например <code>v0.6.0</code>, это понятная пользователю стабильная версия, объединяющая проверенные commits и готовый HTML.
          </p>
          <p className={`mt-2 text-[13px] leading-5 ${theme.textSecondary}`}>
            jj автоматически хранит локальные операции и позволяет безопасно отменять шаги, но пока не генерирует этот UI-список commits. В текущем release список обновляется вручную и поэтому отражает только опубликованные этапы. Сейчас развивается BPMN-симулятор: после длительностей, стоимости и ресурсов добавлены очереди, SLA и рабочий календарь. Следующий этап, приоритеты очереди, несколько экземпляров процесса и bottleneck-анализ.
          </p>
        </div>

        <h3 className="text-sm font-bold mb-3">Этапы</h3>
        <ol className="space-y-3">
          {history.map(({ date, commit, title, release }) => (
            <li key={commit} className={`relative pl-5 border-l-2 ${theme.dark ? 'border-slate-600' : 'border-slate-200'}`}>
              <span className={`absolute -left-[5px] top-1.5 size-2 rounded-full ${theme.dark ? 'bg-violet-400' : 'bg-violet-500'}`} />
              <div className={`text-[11px] font-mono ${theme.textSecondary}`}>{date}</div>
              <a href={`${repositoryUrl}/commit/${commit}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold hover:underline">
                {title} <span className={`font-mono text-[11px] ${theme.textSecondary}`}>{commit} ↗</span>
              </a>
              {release && (
                <a href={`${repositoryUrl}/releases/tag/${release}`} target="_blank" rel="noreferrer" className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 hover:bg-violet-200">
                  {release}
                </a>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
