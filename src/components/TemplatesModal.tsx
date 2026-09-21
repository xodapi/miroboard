import { EDUCATIONAL_EXAMPLES } from '../board/examples'
import type { EducationalExample } from '../board/types'
import type { Theme } from '../board/theme'

/** Board templates offered by the modal. Static: they change with a release. */
const TEMPLATES = [
  { id: 'kanban', name: '📋 Канбан', desc: 'To Do → В процессе → Готово' },
  { id: 'brainstorm', name: '🧠 Мозговой штурм', desc: 'Идеи вокруг центральной темы' },
  { id: 'swot', name: '📊 SWOT анализ', desc: 'Сильные, слабые, возможности, угрозы' },
  { id: 'retro', name: '🔄 Ретроспектива', desc: 'Что хорошо, что улучшить, действия' },
  { id: 'flowchart', name: '🔀 Блок-схема', desc: 'Последовательность шагов' },
  { id: 'bpmn', name: '⚙️ BPMN 2.0', desc: 'Старт, задача, завершение и проверка' },
]

export interface TemplatesModalProps {
  theme: Theme
  onClose: () => void
  onApplyTemplate: (id: string) => void
  onLoadExample: (example: EducationalExample) => void
}

/**
 * Pick a starting board: a prebuilt template or an educational BPMN module.
 *
 * Both this and LearningModulesModal can load an example, which is how the
 * original markup had it — the templates sheet lists them as a secondary
 * section, the learning sheet presents them with their explanations.
 */
export function TemplatesModal({ theme, onClose, onApplyTemplate, onLoadExample }: TemplatesModalProps) {
  return (
    <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={onClose} data-ui>
      <div
        className={`w-full max-w-[400px] rounded-[28px] ${theme.surface} shadow-2xl p-6`}
        onClick={event => event.stopPropagation()}
        data-testid="templates-modal"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[20px] font-semibold tracking-tight">Шаблоны досок</h3>
          <button onClick={onClose} className={`size-8 grid place-items-center rounded-full ${theme.hoverBg}`} aria-label="Закрыть шаблоны">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {TEMPLATES.map(template => (
            <button
              key={template.id}
              onClick={() => onApplyTemplate(template.id)}
              className={`p-4 rounded-2xl ${theme.dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-50 hover:bg-gray-100'} text-left transition active:scale-95`}
            >
              <div className="text-[28px] mb-2">{template.name.split(' ')[0]}</div>
              <div className="text-[14px] font-semibold mb-0.5">{template.name.split(' ').slice(1).join(' ')}</div>
              <div className={`text-[12px] ${theme.dark ? 'text-slate-400' : 'text-black/50'}`}>{template.desc}</div>
            </button>
          ))}
        </div>
        <h4 className="mt-6 mb-3 text-sm font-bold">Учебные BPMN-модули</h4>
        <div className="space-y-2">
          {EDUCATIONAL_EXAMPLES.map(example => (
            <button
              key={example.title}
              onClick={() => { onClose(); onLoadExample(example) }}
              className={`w-full rounded-xl p-3 text-left ${theme.dark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-indigo-50 hover:bg-indigo-100'} transition`}
            >
              <div className="text-sm font-semibold">{example.title}</div>
              <div className={`mt-1 text-xs ${theme.dark ? 'text-slate-300' : 'text-slate-600'}`}>{example.explanation}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
