// Shared Vitest setup for browser-shaped unit tests.
import 'fake-indexeddb/auto'

// Without this flag React's act() only warns ("The current testing environment
// is not configured to support act(...)") and does not fully flush effects, so
// the App smoke suite would assert against a half-rendered tree.
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ships MouseEvent but not PointerEvent, and the canvas is driven entirely
// by pointer events. This is the minimal shape the app reads: coordinates,
// button, shift/alt modifiers, and the touch-detection fields.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    readonly isPrimary: boolean
    readonly width: number
    readonly height: number
    readonly pressure: number
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? ''
      this.isPrimary = params.isPrimary ?? false
      this.width = params.width ?? 1
      this.height = params.height ?? 1
      this.pressure = params.pressure ?? 0
    }
  }
  Object.defineProperty(globalThis, 'PointerEvent', {
    value: PointerEventPolyfill,
    writable: true,
    configurable: true,
  })
}
