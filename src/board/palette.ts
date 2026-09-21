import type { ContextMenuAction } from './types'

/**
 * The board's fixed visual vocabulary: what a new element can be coloured with,
 * what a sticky note can be, which emoji the picker offers, and what the
 * context menu does. Constants rather than state — they change with a release,
 * never at runtime.
 */

export const COLORS = [
  '#FF5D5D', '#FF9F43', '#FFD93D',
  '#6BCB77', '#4D96FF', '#9D65C9',
  '#EC4899', '#000000', '#FFFFFF',
]

export const STICKY_COLORS = [
  '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF9F43', '#9D65C9', '#FF5D5D',
  '#F9F871', '#A0E7E5',
]

export const EMOJIS = ['👍', '❤️', '⭐', '🔥', '💡', '✅', '❌', '🎯', '📌', '❓', '💪', '🎉', '🚀', '💯', '⚡', '🏆', '👀', '🤔', '💬', '🧠']

export const CONTEXT_MENU_ITEMS: { label: string; action: ContextMenuAction; danger?: boolean }[] = [
  { label: '✏️ Редактировать', action: 'edit' },
  { label: '📋 Дублировать', action: 'duplicate' },
  { label: '⬆️ На передний план', action: 'front' },
  { label: '⬇️ На задний план', action: 'back' },
  { label: '🗑️ Удалить', action: 'delete', danger: true },
]
