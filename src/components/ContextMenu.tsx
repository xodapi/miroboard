import { CONTEXT_MENU_ITEMS } from '../board/palette'
import type { ContextMenuAction } from '../board/types'
import type { Theme } from '../board/theme'

export interface ContextMenuProps {
  /** World coordinates of the element the menu acts on. */
  x: number
  y: number
  /** Current viewport, used to place the menu over that world point. */
  transform: { x: number; y: number; scale: number }
  theme: Theme
  onAction: (action: ContextMenuAction) => void
}

/**
 * Per-element actions, opened by a long press on the board.
 *
 * Positioned in world space and projected through the viewport, so the menu
 * stays anchored to its element rather than to the screen.
 */
export function ContextMenu({ x, y, transform, theme, onAction }: ContextMenuProps) {
  return (
    <div
      className="absolute z-40"
      style={{ left: x * transform.scale + transform.x, top: y * transform.scale + transform.y }}
      data-ui
      data-testid="context-menu"
      role="menu"
    >
      <div className={`rounded-2xl ${theme.dark ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${theme.border} overflow-hidden py-1 min-w-[180px]`}>
        {CONTEXT_MENU_ITEMS.map(item => (
          <button
            key={item.action}
            role="menuitem"
            onClick={() => onAction(item.action)}
            className={`w-full h-10 px-4 text-left text-[14px] flex items-center gap-2 transition ${item.danger ? 'text-red-500 hover:bg-red-50' : `${theme.textSecondary} ${theme.hoverBg}`}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
