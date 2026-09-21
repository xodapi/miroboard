export type ToastTone = 'error' | 'success' | 'info'

export interface ToastProps {
  message: string
  tone: ToastTone
  onDismiss: () => void
}

const TONE_CLASS: Record<ToastTone, string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-violet-200 bg-violet-50 text-violet-800',
}

const TONE_GLYPH: Record<ToastTone, string> = { error: '!', success: '✓', info: 'i' }

/** Transient feedback in the top-right corner. */
export function Toast({ message, tone, onDismiss }: ToastProps) {
  return (
    <div
      className={`absolute right-4 top-16 z-[60] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${TONE_CLASS[tone]}`}
      data-ui
      data-testid="toast"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span>{TONE_GLYPH[tone]}</span>
        <span>{message}</span>
        <button onClick={onDismiss} aria-label="Закрыть уведомление" className="ml-auto text-base leading-none">×</button>
      </div>
    </div>
  )
}
