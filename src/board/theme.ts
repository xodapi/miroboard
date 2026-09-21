/**
 * The class names App hands to its panels.
 *
 * These lived as local `const dk = darkMode`, `const textSec = '…'` bindings
 * inside the render body, which is fine while every consumer is in the same
 * function and unworkable once panels move into their own files. Bundling them
 * into one object keeps extracted components to a single `theme` prop instead of
 * five, and gives the dark-mode branch one place to live.
 *
 * Several entries are currently constant regardless of `dark` — that is how the
 * original code read, and changing the palette is not part of this refactor.
 */
export interface Theme {
  /** True in dark mode. Named `dark` rather than the original `dk`. */
  dark: boolean
  border: string
  textSecondary: string
  hoverBg: string
  /** Panel/sheet surface, e.g. modals and toolbars. */
  surface: string
  /** A slightly recessed surface used for cards inside a panel. */
  subtleSurface: string
  /** The translucent bar surface, blurred over the canvas. */
  barSurface: string
  /** Hairline divider between groups of controls. */
  divider: string
}

export function createTheme(dark: boolean): Theme {
  return {
    dark,
    border: 'border-slate-200',
    textSecondary: 'text-slate-500',
    hoverBg: 'hover:bg-slate-100',
    surface: dark ? 'bg-slate-800' : 'bg-white',
    subtleSurface: dark ? 'bg-slate-700' : 'bg-slate-50',
    barSurface: 'bg-white/95',
    divider: dark ? 'bg-slate-600' : 'bg-black/10',
  }
}
