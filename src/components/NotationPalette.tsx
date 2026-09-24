import type { GraphIssue } from '../board/graph'
import type { NotationTool } from '../board/graph'

const TOOLS: [NotationTool, string, string][] = [
  ['event', 'Событие', 'eEPC'],
  ['function', 'Функция', 'eEPC'],
  ['xor', 'XOR', 'eEPC'],
  ['org', 'Роль', 'eEPC'],
  ['step', 'Шаг', 'VACD'],
  ['topic', 'Тема', 'Карта'],
  ['link', 'Связь', 'две метки'],
]

export function NotationPalette({
  tool,
  sourceLabel,
  issues,
  onSelect,
}: {
  tool: NotationTool
  sourceLabel: string | null
  issues: readonly GraphIssue[]
  onSelect: (tool: NotationTool) => void
}) {
  return (
    <aside data-ui="" className="absolute left-3 top-16 z-20 w-60 rounded-xl border border-black/10 bg-white p-2 text-black shadow-lg">
      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-black/45">Нотации</p>
      <div className="grid grid-cols-2 gap-1">
        {TOOLS.map(([id, label, hint]) => (
          <button
            key={id}
            type="button"
            data-ui=""
            aria-pressed={tool === id}
            onClick={() => onSelect(id)}
            className={`rounded-lg px-2 py-1.5 text-left text-[12px] ${tool === id ? 'bg-black text-white' : 'bg-black/[0.04] hover:bg-black/[0.08]'}`}
          >
            <span className="block font-medium">{label}</span>
            <span className={`block text-[10px] ${tool === id ? 'text-white/70' : 'text-black/45'}`}>{hint}</span>
          </button>
        ))}
      </div>
      <p className="px-1 pt-2 text-[11px] leading-snug text-black/55">
        {tool === 'link'
          ? (sourceLabel ? `От «${sourceLabel}». Выберите вторую метку той же нотации.` : 'Выберите первую метку, затем вторую.')
          : 'Клик по пустому месту доски ставит выбранную метку.'}
      </p>
      {issues.length > 0 && (
        <ul className="mt-1 max-h-28 space-y-1 overflow-auto px-1 text-[11px] text-amber-800">
          {issues.slice(0, 6).map(issue => <li key={`${issue.code}-${issue.id ?? issue.message}`}>{issue.message}</li>)}
        </ul>
      )}
    </aside>
  )
}
