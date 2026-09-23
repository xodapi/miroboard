import { describe, expect, it, vi } from 'vitest'

const { clampScale } = vi.hoisted(() => ({
  // Mirrors the Rust core's clamp_scale, whose own limits are tested there.
  clampScale: (value: number) => (Number.isFinite(value) ? Math.min(Math.max(value, 0.15), 5) : 1),
}))
vi.mock('../wasm/board-core/board_core', () => ({ clamp_scale: clampScale }))

const { centerOn, elementsInScope, fitTransform, screenToWorld, wheelZoomFactor, zoomAround } = await import('./viewport')
type BoardElement = Parameters<typeof fitTransform>[0][number]

const element = (over: Partial<BoardElement> = {}): BoardElement => ({
  id: 'e', type: 'rect', x: 0, y: 0, w: 100, h: 100, color: '#000', stroke: 2, fill: 'none', ...over,
} as BoardElement)

const rect = { left: 0, top: 0 }

describe('screenToWorld', () => {
  it('inverts the viewport transform', () => {
    const transform = { x: 50, y: 20, scale: 2 }
    expect(screenToWorld(transform, rect, 150, 120)).toEqual({ x: 50, y: 50 })
  })

  it('accounts for a canvas that is not at the page origin', () => {
    expect(screenToWorld({ x: 0, y: 0, scale: 1 }, { left: 30, top: 10 }, 130, 110)).toEqual({ x: 100, y: 100 })
  })
})

describe('zoomAround', () => {
  it('keeps the anchor point under the cursor', () => {
    // The whole purpose of zoom-to-cursor: the world point you pointed at must
    // still be under the pointer afterwards.
    const before = { x: 0, y: 0, scale: 1 }
    const screen = { x: 400, y: 300 }
    const world = screenToWorld(before, rect, screen.x, screen.y)

    const after = zoomAround(before, 2, screen, world)
    expect(screenToWorld(after, rect, screen.x, screen.y)).toEqual(world)
  })

  it('still anchors correctly when the scale is clamped', () => {
    // Clamping changes the scale from what was asked for; the offsets have to
    // be computed from the clamped value or the view jumps at the limit.
    const before = { x: 0, y: 0, scale: 4 }
    const screen = { x: 200, y: 200 }
    const world = screenToWorld(before, rect, screen.x, screen.y)

    const after = zoomAround(before, 10, screen, world)
    expect(after.scale).toBe(5)
    expect(screenToWorld(after, rect, screen.x, screen.y)).toEqual(world)
  })
})

describe('wheelZoomFactor', () => {
  it('zooms in on scroll up and out on scroll down', () => {
    // deltaY is negative when scrolling up, which is the zoom-in direction.
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1)
    expect(wheelZoomFactor(100)).toBeLessThan(1)
  })

  it('uses a fixed step regardless of how hard the wheel is spun', () => {
    // Trackpads report wildly different magnitudes; the original read direction
    // only, and that is preserved deliberately.
    expect(wheelZoomFactor(-1)).toBe(wheelZoomFactor(-4000))
  })
})

describe('fitTransform', () => {
  const viewport = { width: 1000, height: 800 }

  it('goes home for an empty board', () => {
    expect(fitTransform([], viewport)).toEqual({ x: 0, y: 0, scale: 1 })
  })

  it('centres the content it frames', () => {
    const transform = fitTransform([element({ x: 0, y: 0, w: 100, h: 100 })], viewport)
    // The content's centre in world space should land at the viewport's centre.
    const centre = { x: 50, y: 50 }
    expect(centre.x * transform.scale + transform.x).toBeCloseTo(viewport.width / 2)
    expect(centre.y * transform.scale + transform.y).toBeCloseTo(viewport.height / 2)
  })

  it('frames content that sits far from the origin', () => {
    const transform = fitTransform([element({ x: 9000, y: -4000, w: 200, h: 200 })], viewport)
    const centre = { x: 9100, y: -3900 }
    expect(centre.x * transform.scale + transform.x).toBeCloseTo(viewport.width / 2)
    expect(centre.y * transform.scale + transform.y).toBeCloseTo(viewport.height / 2)
  })

  it('does not divide by zero on a zero-sized element', () => {
    const transform = fitTransform([element({ w: 0, h: 0 })], viewport)
    expect(Number.isFinite(transform.x)).toBe(true)
    expect(Number.isFinite(transform.y)).toBe(true)
    expect(transform.scale).toBeGreaterThan(0)
  })

  it('gives sizeless elements a default extent', () => {
    // Lines and freehand paths carry w/h of 0; framing them as points would
    // zoom to the clamp limit.
    const transform = fitTransform([element({ w: 0, h: 0 }), element({ id: 'f', x: 500, y: 500, w: 0, h: 0 })], viewport)
    expect(transform.scale).toBeLessThan(5)
  })

  it('never exceeds the supported zoom range', () => {
    const tiny = fitTransform([element({ w: 1, h: 1 })], viewport)
    const huge = fitTransform([element({ w: 100_000, h: 100_000 })], viewport)
    expect(tiny.scale).toBeLessThanOrEqual(5)
    expect(huge.scale).toBeGreaterThanOrEqual(0.15)
  })
})

describe('centerOn', () => {
  it('puts the box centre at the viewport centre without changing scale', () => {
    const transform = centerOn(
      { x: 0, y: 0, scale: 2 },
      { x: 1000, y: 2000, w: 100, h: 100 },
      { width: 800, height: 600 },
    )
    expect(transform.scale).toBe(2)
    expect(1050 * transform.scale + transform.x).toBeCloseTo(400)
    expect(2050 * transform.scale + transform.y).toBeCloseTo(300)
  })
})

describe('elementsInScope', () => {
  const sticky = element({ id: 'sticky', type: 'sticky' })
  const task = element({ id: 'task', bpmnNodeType: 'task' })
  const flow = element({ id: 'flow', type: 'arrow', bpmnFlow: { sourceId: 'a', targetId: 'b', flowType: 'sequence' } })

  it('leaves out an element this version cannot draw', () => {
    // A file written by a newer version can carry a node kind this build has
    // no renderer for. It is kept on save, but framing the view around
    // something invisible zooms the board out to surround empty space with no
    // visible cause: a ghost at (5000,5000) dropped the scale from 8 to 0.12.
    const ghost = element({ id: 'ghost', type: 'hologram' as BoardElement['type'], x: 5000, y: 5000 })
    expect(elementsInScope([sticky, ghost], 'board')).toEqual([sticky])
  })

  it('does not fall back to undrawable elements when nothing is in scope', () => {
    // The "scoped.length ? scoped : …" fallback exists so an empty scope still
    // frames something. It must not resurrect the ghost.
    const ghost = element({ id: 'ghost', type: 'hologram' as BoardElement['type'] })
    expect(elementsInScope([ghost], 'bpmn')).toEqual([])
  })

  it('frames the free-form content in board mode', () => {
    expect(elementsInScope([sticky, task, flow], 'board')).toEqual([sticky])
  })

  it('frames the process in BPMN and simulation modes', () => {
    expect(elementsInScope([sticky, task, flow], 'bpmn')).toEqual([task, flow])
    expect(elementsInScope([sticky, task, flow], 'simulation')).toEqual([task, flow])
  })

  it('falls back to everything rather than framing nothing', () => {
    // A board holding only BPMN nodes still has to be reachable from board
    // mode, otherwise "fit" appears to do nothing at all.
    expect(elementsInScope([task, flow], 'board')).toEqual([task, flow])
    expect(elementsInScope([sticky], 'bpmn')).toEqual([sticky])
  })
})
