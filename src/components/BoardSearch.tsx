import { useEffect, useRef } from 'react'
import type { SearchHit } from '../board/search'
import type { Theme } from '../board/theme'

export interface BoardSearchProps {
  theme: Theme
  open: boolean
  query: string
  /** 0-based index into the current hits. Ignored when matchCount is 0. */
  matchIndex: number
  matchCount: number
  /** Bumped by the shell on Ctrl+F so an already-open box re-focuses. */
  focusNonce: number
  /** Hits already computed by the shell. Omitted means no list (counter only). */
  hits?: readonly SearchHit[]
  onOpen: () => void
  onClose: () => void
  onQueryChange: (query: string) => void
  onNext: () => void
  onPrev: () => void
  /** Jump to one hit. Index matches `hits`. */
  onPick?: (index: number) => void
}

/**
 * Find-on-board. The shell owns the query and the hits; this only presents
 * them. It lives outside the canvas (`data-ui`) so a click in the box does
 * not start a marquee.
 */
export function BoardSearch(props: BoardSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { open, focusNonce } = props

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open, focusNonce])

  if (!open) {
    return (
      <button
        type="button"
        data-ui
        data-testid="open-search"
        onClick={props.onOpen}
        title="Найти на доске (Ctrl+F)"
        className={`absolute right-3 top-[60px] z-30 h-8 rounded-lg px-2.5 text-[12px] font-semibold shadow-sm ${props.theme.dark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-700'} border ${props.theme.border}`}
      >
        Найти
      </button>
    )
  }

  const label = props.query.trim()
    ? props.matchCount === 0
      ? 'нет совпадений'
      : `${props.matchIndex + 1} / ${props.matchCount}`
    : 'текст, роль, условие'

  return (
    <form
      data-ui
      data-testid="board-search"
      role="search"
      className={`absolute left-1/2 top-[60px] z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border px-2 py-1 shadow-lg ${props.theme.dark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-800'}`}
      onSubmit={event => {
        event.preventDefault()
        props.onNext()
      }}
    >
      <input
        ref={inputRef}
        value={props.query}
        onChange={event => props.onQueryChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
          } else if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault()
            props.onPrev()
          }
        }}
        placeholder="Найти на доске"
        aria-label="Найти на доске"
        className={`h-7 w-52 bg-transparent px-1 text-[13px] outline-none ${props.theme.dark ? 'placeholder:text-slate-500' : 'placeholder:text-slate-400'}`}
      />
      <span className="min-w-24 text-center text-[11px] font-semibold text-slate-500" aria-live="polite">
        {label}
      </span>
      <button type="button" onClick={props.onPrev} className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Предыдущее (Shift+Enter)" aria-label="Предыдущее совпадение">↑</button>
      <button type="button" onClick={props.onNext} className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Следующее (Enter)" aria-label="Следующее совпадение">↓</button>
      <button type="button" onClick={props.onClose} className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title="Закрыть (Esc)" aria-label="Закрыть поиск">×</button>
      {props.hits && props.hits.length > 0 && (
        <ul
          data-testid="search-results"
          className={`absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border py-1 shadow-lg ${props.theme.dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}
        >
          {props.hits.map((hit, index) => (
            <li key={hit.id}>
              <button
                type="button"
                data-testid="search-result"
                aria-current={index === props.matchIndex ? 'true' : undefined}
                onClick={() => props.onPick?.(index)}
                className={`block w-full truncate px-3 py-1.5 text-left text-[12px] ${index === props.matchIndex ? 'bg-amber-100 font-semibold text-amber-950' : props.theme.dark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                {hit.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
