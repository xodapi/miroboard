import { EDUCATIONAL_EXAMPLES } from '../board/examples'
import type { EducationalExample } from '../board/types'

export interface LearningModulesModalProps {
  onClose: () => void
  onLoadExample: (example: EducationalExample) => void
}

/**
 * The «Примеры» sheet: each educational BPMN module with the point it teaches.
 *
 * Deliberately light-mode only, matching the original markup — unlike the
 * templates sheet this one is a reading surface, and it hardcoded white.
 */
export function LearningModulesModal({ onClose, onLoadExample }: LearningModulesModalProps) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-slate-900/35 backdrop-blur-sm" onClick={onClose} data-ui>
      <section
        className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl"
        onClick={event => event.stopPropagation()}
        data-testid="learning-modules-modal"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Учебные BPMN-модули</h2>
            <p className="mt-1 text-sm text-slate-500">Загрузите готовую схему, прочитайте цель и проверьте результат симуляции.</p>
          </div>
          <button onClick={onClose} className="grid size-9 place-items-center rounded-xl text-lg text-slate-500 hover:bg-slate-100" aria-label="Закрыть учебные модули">×</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {EDUCATIONAL_EXAMPLES.map((example, index) => (
            <button
              key={example.title}
              onClick={() => { onClose(); onLoadExample(example) }}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50"
            >
              <div className="mb-2 text-xs font-bold text-violet-600">Модуль {index + 1}</div>
              <div className="text-sm font-bold text-slate-900">{example.title}</div>
              <div className="mt-2 text-xs leading-5 text-slate-500">{example.explanation}</div>
              <div className="mt-3 text-xs font-semibold text-violet-700">Загрузить →</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
