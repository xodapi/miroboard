import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { clamp_scale, export_bpmn_xml, import_bpmn_xml, run_bpmn, simulate_bpmn, snap_to_grid, validate_bpmn } from './wasm/board-core/board_core'

// ======================== TYPES ========================
type Point = { x: number; y: number }
type Tool = 'select' | 'pan' | 'pen' | 'marker' | 'eraser' | 'sticky' | 'text' | 'rect' | 'circle' | 'arrow' | 'line' | 'laser' | 'emoji' | 'bpmnStart' | 'bpmnTask' | 'bpmnEnd' | 'bpmnGateway' | 'bpmnParallel' | 'bpmnSequence'
type BpmnNodeType = 'startEvent' | 'endEvent' | 'task' | 'xorGateway' | 'andGateway' | 'orGateway'
const DISPLAY_VERSION = 'df774ad'
const GITHUB_REPOSITORY = 'https://github.com/xodapi/miroboard'
const PROJECT_HISTORY = [
  ['2026-08-07 14:47 UTC+07', 'cc441ad', 'Исходный MiroBoard и автономная single-file сборка'],
  ['2026-08-07 15:30 UTC+07', '3771d26', 'Rust/WASM core для геометрии доски'],
  ['2026-08-07 15:55 UTC+07', '4ec3c49', 'BPMN-валидация графа'],
  ['2026-08-07 16:15 UTC+07', 'addff28', 'Интерактивная BPMN-палитра'],
  ['2026-08-07 16:31 UTC+07', 'b96f15c', 'Создание BPMN sequence flow'],
  ['2026-08-07 16:42 UTC+07', 'a88d178', 'Экспорт BPMN XML'],
  ['2026-08-07 16:56 UTC+07', 'c65e7aa', 'Импорт BPMN XML'],
  ['2026-08-07 17:14 UTC+07', 'cf91a74', 'Сохранение BPMN-DI геометрии'],
  ['2026-08-07 17:27 UTC+07', 'df774ad', 'Привязка стрелок к границам фигур'],
  ['2026-08-07 18:23 UTC+07', '0af0309', 'Первый BPMN token runner'],
  ['2026-08-07 19:21 UTC+07', '6fe4932', 'Видимая версия и Jujutsu workflow'],
  ['2026-08-07 20:56 UTC+07', '4843635', 'Параллельные BPMN AND split/join'],
  ['2026-08-07 21:11 UTC+07', 'ada449b', 'Критический путь и оценка длительности'],
  ['2026-08-07 21:47 UTC+07', '58587e3', 'Редактирование длительности BPMN-задач'],
] as const
type ImportedBpmnModel = {
  nodes: { id: string; type: string; name?: string; x?: number; y?: number; width?: number; height?: number }[]
  flows: { id: string; sourceId: string; targetId: string; flowType?: 'sequence' | 'message'; condition?: string; probability?: number; isDefault?: boolean }[]
}
type BpmnSimulationResult = {
  seed: number
  runs: number
  completedRuns: number
  minDurationMs: number
  meanDurationMs: number
  p50DurationMs: number
  p90DurationMs: number
  p95DurationMs: number
  maxDurationMs: number
}

interface BoardElement {
  id: string
  type: 'path' | 'sticky' | 'rect' | 'circle' | 'arrow' | 'line' | 'text' | 'emoji'
  x: number
  y: number
  w?: number
  h?: number
  points?: Point[]
  text?: string
  color: string
  stroke?: number
  fill?: string
  rotation?: number
  createdBy?: string
  emoji?: string
  zIndex?: number
  bpmnNodeType?: BpmnNodeType
  bpmnDurationMs?: number
  bpmnFlow?: { sourceId: string; targetId: string; flowType?: 'sequence' | 'message'; condition?: string; probability?: number; isDefault?: boolean }
}

interface Cursor {
  id: string
  x: number
  y: number
  name: string
  color: string
  tool?: string
  isLaser?: boolean
}

// ======================== CONSTANTS ========================
const COLORS = [
  '#FF5D5D', '#FF9F43', '#FFD93D',
  '#6BCB77', '#4D96FF', '#9D65C9',
  '#EC4899', '#000000', '#FFFFFF'
]

const STICKY_COLORS = [
  '#FFD93D', '#6BCB77', '#4D96FF',
  '#FF9F43', '#9D65C9', '#FF5D5D',
  '#F9F871', '#A0E7E5'
]

const USER_COLORS = [
  '#FF5D5D', '#4D96FF', '#6BCB77',
  '#FF9F43', '#9D65C9', '#EC4899',
  '#14B8A6', '#F97316'
]

const RUSSIAN_NAMES = ['Аня', 'Макс', 'Саша', 'Лера', 'Дима', 'Катя', 'Илья', 'Соня', 'Ваня', 'Даша']

const EMOJIS = ['👍', '❤️', '⭐', '🔥', '💡', '✅', '❌', '🎯', '📌', '❓', '💪', '🎉', '🚀', '💯', '⚡', '🏆', '👀', '🤔', '💬', '🧠']

function genId() { return Math.random().toString(36).slice(2, 9) }

// ======================== UTILITY FUNCTIONS ========================
function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len
}

function simplifyPath(points: Point[], tolerance = 2): Point[] {
  if (points.length <= 2) return points
  let maxDist = 0, maxIdx = 0
  const first = points[0], last = points[points.length - 1]
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointToLineDistance(points[i], first, last)
    if (d > maxDist) { maxDist = d; maxIdx = i }
  }
  if (maxDist > tolerance) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), tolerance)
    const right = simplifyPath(points.slice(maxIdx), tolerance)
    return [...left.slice(0, -1), ...right]
  }
  return [first, last]
}

function smoothPathD(points: Point[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2
    const my = (points[i].y + points[i + 1].y) / 2
    d += ` Q ${points[i].x} ${points[i].y} ${mx} ${my}`
  }
  d += ` L ${points[points.length - 1].x} ${points[points.length - 1].y}`
  return d
}

function snapVal(v: number, grid = 20) { return snap_to_grid(v, grid) }

function bpmnEdgeAnchor(element: BoardElement, towardX: number, towardY: number): Point {
  const width = element.w || 0
  const height = element.h || 0
  const centerX = element.x + width / 2
  const centerY = element.y + height / 2
  const dx = towardX - centerX
  const dy = towardY - centerY
  if (dx === 0 && dy === 0) return { x: centerX, y: centerY }

  const halfWidth = width / 2
  const halfHeight = height / 2
  let scale: number
  if (element.bpmnNodeType === 'startEvent' || element.bpmnNodeType === 'endEvent') {
    scale = Math.min(halfWidth, halfHeight) / Math.hypot(dx, dy)
  } else if (element.bpmnNodeType === 'xorGateway' || element.bpmnNodeType === 'andGateway' || element.bpmnNodeType === 'orGateway') {
    scale = 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight)
  } else {
    scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight)
  }
  return { x: centerX + dx * scale, y: centerY + dy * scale }
}

// ======================== MAIN APP ========================
export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [elements, setElements] = useState<BoardElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [cursors, setCursors] = useState<Cursor[]>([])
  const [participants, setParticipants] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<Point | null>(null)
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showProjectHistory, setShowProjectHistory] = useState(false)
  const [showSimulationPanel, setShowSimulationPanel] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showBpmnPalette, setShowBpmnPalette] = useState(false)
  const [bpmnFlowSourceId, setBpmnFlowSourceId] = useState<string | null>(null)
  const [activeBpmnTokenId, setActiveBpmnTokenId] = useState<string | null>(null)
  const [bpmnRunSummary, setBpmnRunSummary] = useState<string | null>(null)
  const [bpmnSimulationSummary, setBpmnSimulationSummary] = useState<string | null>(null)
  const [bpmnSimulationResult, setBpmnSimulationResult] = useState<BpmnSimulationResult | null>(null)
  const [simulationSeed, setSimulationSeed] = useState('42')
  const [simulationRuns, setSimulationRuns] = useState('500')
  const [showEmoji, setShowEmoji] = useState(false)
  const [selectedEmoji, setSelectedEmoji] = useState('👍')
  const [snapGrid, setSnapGrid] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [, setUndoRev] = useState(0)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [laserPos, setLaserPos] = useState<Point | null>(null)

  // Drag state
  const [dragInfo, setDragInfo] = useState<{
    id: string; startX: number; startY: number; elStartX: number; elStartY: number
  } | null>(null)

  // Resize state
  const [resizeInfo, setResizeInfo] = useState<{
    id: string; corner: string; startX: number; startY: number;
    elX: number; elY: number; elW: number; elH: number
  } | null>(null)

  // Long press
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const bpmnImportRef = useRef<HTMLInputElement>(null)
  const bpmnRunTimersRef = useRef<number[]>([])

  // Yjs
  const ydoc = useMemo(() => new Y.Doc(), [])
  const providerRef = useRef<WebrtcProvider | null>(null)
  const yElements = useRef<Y.Array<BoardElement> | null>(null)
  const awarenessRef = useRef<any>(null)
  const undoManagerRef = useRef<Y.UndoManager | null>(null)

  const createBpmnModel = useCallback(() => {
    const nodes = elements
      .filter((element) => element.bpmnNodeType)
      .map((element) => ({
        id: element.id,
        type: element.bpmnNodeType,
        poolId: 'default',
        name: element.text,
        durationMs: element.bpmnDurationMs,
        x: element.x,
        y: element.y,
        width: element.w,
        height: element.h,
      }))
    const flows = elements
      .filter((element) => element.bpmnFlow)
      .map((element) => ({
        id: element.id,
        ...element.bpmnFlow,
      }))
    return { nodes, flows }
  }, [elements])

  const bpmnIssues = useMemo(() => {
    const model = createBpmnModel()
    if (model.nodes.length === 0) return []

    try {
      return JSON.parse(validate_bpmn(JSON.stringify(model))).issues as {
        severity: 'error' | 'warning'
        message: string
        elementId?: string
      }[]
    } catch {
      return [{ severity: 'error' as const, message: 'Не удалось проверить BPMN-модель.' }]
    }
  }, [createBpmnModel])

  const selectedBpmnTask = useMemo(
    () => elements.find((element) => element.id === selectedId && element.bpmnNodeType === 'task') ?? null,
    [elements, selectedId],
  )
  const selectedBpmnFlow = useMemo(
    () => elements.find((element) => element.id === selectedId && element.bpmnFlow) ?? null,
    [elements, selectedId],
  )
  const selectedBpmnFlowIsXor = useMemo(
    () => selectedBpmnFlow?.bpmnFlow && elements.find((element) => element.id === selectedBpmnFlow.bpmnFlow!.sourceId)?.bpmnNodeType === 'xorGateway',
    [elements, selectedBpmnFlow],
  )

  const user = useMemo(() => {
    const saved = localStorage.getItem('miro-user')
    if (saved) return JSON.parse(saved)
    const u = {
      id: genId(),
      name: RUSSIAN_NAMES[Math.floor(Math.random() * RUSSIAN_NAMES.length)],
      color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]
    }
    localStorage.setItem('miro-user', JSON.stringify(u))
    return u
  }, [])

  const roomId = useMemo(() => {
    const url = new URL(window.location.href)
    let id = url.searchParams.get('board')
    if (!id) {
      id = genId() + genId()
      url.searchParams.set('board', id)
      window.history.replaceState({}, '', url.toString())
    }
    return id
  }, [])

  const shareUrl = typeof window !== 'undefined' ? window.location.href : ''

  // ======================== YJS SETUP ========================
  useEffect(() => {
    const yarray = ydoc.getArray<BoardElement>('elements')
    yElements.current = yarray

    let provider: WebrtcProvider | null = null
    try {
      provider = new WebrtcProvider(roomId, ydoc, {
        signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com']
      })
      providerRef.current = provider
      awarenessRef.current = provider.awareness
    } catch (e) {
      console.warn('WebRTC setup failed, working offline', e)
    }

    // UndoManager
    const undoManager = new Y.UndoManager(yarray, { captureTimeout: 500 })
    undoManagerRef.current = undoManager

    const updateUndoState = () => setUndoRev(c => c + 1)
    undoManager.on('stack-item-added', updateUndoState)
    undoManager.on('stack-item-popped', updateUndoState)
    undoManager.on('stack-item-updated', updateUndoState)

    // IndexedDB persistence
    try { new IndexeddbPersistence(roomId, ydoc) } catch (e) { console.warn('IndexedDB failed', e) }

    // Awareness
    if (awarenessRef.current) {
      awarenessRef.current.setLocalStateField('user', {
        name: user.name, color: user.color, id: user.id
      })

      const updateCursors = () => {
        const states = Array.from(awarenessRef.current.getStates().entries()) as [number, any][]
        const cs: Cursor[] = []
        states.forEach(([cid, state]) => {
          if (cid !== awarenessRef.current.clientID && state.cursor && state.user) {
            cs.push({
              id: state.user.id, x: state.cursor.x, y: state.cursor.y,
              name: state.user.name, color: state.user.color,
              tool: state.cursor.tool, isLaser: state.cursor.isLaser
            })
          }
        })
        setCursors(cs)
        setParticipants(states.length)
      }
      awarenessRef.current.on('change', updateCursors)
      updateCursors()
    }

    // Sync
    const updateElements = () => setElements(yarray.toArray())
    yarray.observe(updateElements)
    updateElements()

    // Fallback load
    const saved = localStorage.getItem(`board-${roomId}`)
    if (saved && yarray.length === 0) {
      try {
        const parsed = JSON.parse(saved)
        ydoc.transact(() => parsed.forEach((el: BoardElement) => yarray.push([el])))
      } catch { /* ignore */ }
    }

    // Auto-save
    const si = setInterval(() => {
      localStorage.setItem(`board-${roomId}`, JSON.stringify(yarray.toArray()))
    }, 3000)

    return () => {
      clearInterval(si)
      yarray.unobserve(updateElements)
      undoManager.off('stack-item-added', updateUndoState)
      undoManager.off('stack-item-popped', updateUndoState)
      undoManager.off('stack-item-updated', updateUndoState)
      provider?.destroy()
      ydoc.destroy()
    }
  }, [roomId, ydoc, user])

  // ======================== HELPERS ========================
  const updateCursor = useCallback((x: number, y: number, isLaser = false) => {
    if (awarenessRef.current) {
      awarenessRef.current.setLocalStateField('cursor', { x, y, tool, isLaser })
    }
  }, [tool])

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: (sx - rect.left - transform.x) / transform.scale,
      y: (sy - rect.top - transform.y) / transform.scale
    }
  }, [transform])

  const addElement = useCallback((el: BoardElement) => {
    if (!yElements.current) return
    ydoc.transact(() => { yElements.current!.push([el]) })
    if ('vibrate' in navigator) navigator.vibrate(10)
  }, [ydoc])

  const updateElement = useCallback((id: string, updates: Partial<BoardElement>) => {
    if (!yElements.current) return
    const idx = yElements.current.toArray().findIndex(e => e.id === id)
    if (idx >= 0) {
      ydoc.transact(() => {
        const cur = yElements.current!.get(idx)
        yElements.current!.delete(idx, 1)
        yElements.current!.insert(idx, [{ ...cur, ...updates }])
      })
    }
  }, [ydoc])

  const deleteElement = useCallback((id: string) => {
    if (!yElements.current) return
    const idx = yElements.current.toArray().findIndex(e => e.id === id)
    if (idx >= 0) ydoc.transact(() => { yElements.current!.delete(idx, 1) })
    setSelectedId(null)
    setContextMenu(null)
  }, [ydoc])

  const bringToFront = useCallback((id: string) => {
    if (!yElements.current) return
    const idx = yElements.current.toArray().findIndex(e => e.id === id)
    if (idx >= 0) {
      ydoc.transact(() => {
        const el = yElements.current!.get(idx)
        yElements.current!.delete(idx, 1)
        yElements.current!.push([{ ...el, zIndex: Date.now() }])
      })
    }
  }, [ydoc])

  const sendToBack = useCallback((id: string) => {
    updateElement(id, { zIndex: 0 })
  }, [updateElement])

  const duplicateElement = useCallback((id: string) => {
    const el = elements.find(e => e.id === id)
    if (el) {
      const newEl = { ...el, id: genId(), x: el.x + 20, y: el.y + 20 }
      addElement(newEl)
    }
  }, [elements, addElement])

  const canUndo = undoManagerRef.current ? undoManagerRef.current.undoStack.length > 0 : false
  const canRedo = undoManagerRef.current ? undoManagerRef.current.redoStack.length > 0 : false

  const handleUndo = useCallback(() => {
    undoManagerRef.current?.undo()
    setUndoRev(c => c + 1)
  }, [])

  const handleRedo = useCallback(() => {
    undoManagerRef.current?.redo()
    setUndoRev(c => c + 1)
  }, [])

  const applyTemplate = useCallback((name: string) => {
    if (!yElements.current) return
    // Clear existing
    ydoc.transact(() => {
      while (yElements.current!.length > 0) yElements.current!.delete(0, 1)
      const t: BoardElement[] = []
      const s = (text: string, x: number, y: number, w = 160, h = 60, fill = '#FFD93D') =>
        ({ id: genId(), type: 'sticky' as const, x, y, w, h, text, color: fill, fill, createdBy: user.id })

      if (name === 'kanban') {
        t.push(s('📋 Сделать', 40, 30, 200, 55, '#FFD93D'))
        t.push(s('🔄 В процессе', 280, 30, 200, 55, '#4D96FF'))
        t.push(s('✅ Готово', 520, 30, 200, 55, '#6BCB77'))
        t.push(s('Задача 1', 40, 110, 200, 90, '#FFFFFF'))
        t.push(s('Задача 2', 40, 220, 200, 90, '#FFFFFF'))
        t.push(s('Задача 3', 40, 330, 200, 90, '#FFFFFF'))
      } else if (name === 'brainstorm') {
        t.push(s('🧠 Главная идея', 250, 200, 220, 80, '#9D65C9'))
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2
          t.push(s(`Идея ${i + 1}`, 250 + Math.cos(angle) * 250 - 60, 200 + Math.sin(angle) * 200 - 30, 140, 70, STICKY_COLORS[i]))
        }
      } else if (name === 'swot') {
        t.push(s('💪 Сильные стороны', 20, 20, 280, 200, '#6BCB77'))
        t.push(s('⚠️ Слабые стороны', 320, 20, 280, 200, '#FF5D5D'))
        t.push(s('🚀 Возможности', 20, 240, 280, 200, '#4D96FF'))
        t.push(s('🧨 Угрозы', 320, 240, 280, 200, '#FF9F43'))
      } else if (name === 'retro') {
        t.push(s('😊 Что прошло хорошо', 20, 20, 220, 50, '#6BCB77'))
        t.push(s('🤔 Что улучшить', 260, 20, 220, 50, '#FF9F43'))
        t.push(s('🚀 Действия', 500, 20, 220, 50, '#4D96FF'))
        t.push(s('', 20, 90, 220, 100, '#FFFFFF'))
        t.push(s('', 260, 90, 220, 100, '#FFFFFF'))
        t.push(s('', 500, 90, 220, 100, '#FFFFFF'))
      } else if (name === 'flowchart') {
        t.push(s('Старт', 250, 20, 120, 50, '#6BCB77'))
        t.push({ id: genId(), type: 'arrow', x: 310, y: 70, w: 0, h: 60, color: '#000', stroke: 2, fill: 'transparent', createdBy: user.id })
        t.push(s('Шаг 1', 230, 140, 160, 60, '#4D96FF'))
        t.push({ id: genId(), type: 'arrow', x: 310, y: 200, w: 0, h: 60, color: '#000', stroke: 2, fill: 'transparent', createdBy: user.id })
        t.push(s('Шаг 2', 230, 270, 160, 60, '#FFD93D'))
        t.push({ id: genId(), type: 'arrow', x: 310, y: 330, w: 0, h: 60, color: '#000', stroke: 2, fill: 'transparent', createdBy: user.id })
        t.push(s('Результат', 230, 400, 160, 60, '#9D65C9'))
      } else if (name === 'bpmn') {
        const startId = genId()
        const taskId = genId()
        const endId = genId()
        t.push({ id: startId, type: 'sticky', x: 80, y: 180, w: 86, h: 56, text: 'Старт', color: '#6BCB77', fill: '#6BCB77', createdBy: user.id, bpmnNodeType: 'startEvent' })
        t.push({ id: taskId, type: 'sticky', x: 250, y: 170, w: 180, h: 76, text: 'Выполнить задачу', color: '#4D96FF', fill: '#4D96FF', createdBy: user.id, bpmnNodeType: 'task' })
        t.push({ id: endId, type: 'sticky', x: 510, y: 180, w: 86, h: 56, text: 'Конец', color: '#FF5D5D', fill: '#FF5D5D', createdBy: user.id, bpmnNodeType: 'endEvent' })
        t.push({ id: genId(), type: 'arrow', x: 166, y: 208, w: 84, h: 0, color: '#000', stroke: 2, fill: 'transparent', createdBy: user.id, bpmnFlow: { sourceId: startId, targetId: taskId } })
        t.push({ id: genId(), type: 'arrow', x: 430, y: 208, w: 80, h: 0, color: '#000', stroke: 2, fill: 'transparent', createdBy: user.id, bpmnFlow: { sourceId: taskId, targetId: endId } })
      }
      t.forEach(el => yElements.current!.push([el]))
    })
    setShowTemplates(false)
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [ydoc, user.id])

  const exportToPNG = useCallback(() => {
    const svg = svgRef.current
    if (!svg || elements.length === 0) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = svg.clientWidth * 2
      canvas.height = svg.clientHeight * 2
      const ctx = canvas.getContext('2d')!
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(b => {
        if (b) {
          const a = document.createElement('a')
          a.href = URL.createObjectURL(b)
          a.download = `board-${roomId.slice(0, 6)}.png`
          a.click()
        }
      }, 'image/png')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [elements.length, roomId])

  const exportToBpmn = useCallback(() => {
    try {
      const xml = export_bpmn_xml(JSON.stringify(createBpmnModel()))
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `miroboard-${roomId.slice(0, 6)}.bpmn`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'BPMN-модель нельзя экспортировать.')
    }
  }, [createBpmnModel, roomId])

  const runBpmn = useCallback(() => {
    bpmnRunTimersRef.current.forEach(window.clearTimeout)
    bpmnRunTimersRef.current = []
    try {
      const result = JSON.parse(run_bpmn(JSON.stringify(createBpmnModel()))) as {
        completed: boolean
        tokenPath: string[]
        estimatedDurationMs: number
      }
      setBpmnRunSummary(`Оценка: ${(result.estimatedDurationMs / 1000).toFixed(1)} с`)
      result.tokenPath.forEach((nodeId, index) => {
        bpmnRunTimersRef.current.push(window.setTimeout(() => {
          setActiveBpmnTokenId(nodeId)
        }, index * 650))
      })
      bpmnRunTimersRef.current.push(window.setTimeout(() => {
        setActiveBpmnTokenId(null)
        bpmnRunTimersRef.current = []
      }, result.tokenPath.length * 650 + 350))
    } catch (error) {
      setActiveBpmnTokenId(null)
      setBpmnRunSummary(null)
      window.alert(error instanceof Error ? error.message : 'Не удалось запустить BPMN-модель.')
    }
  }, [createBpmnModel])

  const simulateBpmn = useCallback(() => {
    try {
      const seed = BigInt(simulationSeed)
      const runs = Number(simulationRuns)
      if (!Number.isInteger(runs) || runs < 1 || runs > 10000) throw new Error('Количество прогонов должно быть целым числом от 1 до 10000.')
      const result = JSON.parse(simulate_bpmn(JSON.stringify(createBpmnModel()), seed, runs)) as BpmnSimulationResult
      const seconds = (value: number) => `${(value / 1000).toFixed(1)}с`
      setBpmnSimulationResult(result)
      setBpmnSimulationSummary(`MC ${result.runs}: P50 ${seconds(result.p50DurationMs)} · P90 ${seconds(result.p90DurationMs)} · P95 ${seconds(result.p95DurationMs)}`)
    } catch (error) {
      setBpmnSimulationSummary(null)
      window.alert(error instanceof Error ? error.message : 'Не удалось запустить BPMN-симуляцию.')
    }
  }, [createBpmnModel, simulationRuns, simulationSeed])

  const importFromBpmn = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !yElements.current) return

    try {
      const imported = JSON.parse(import_bpmn_xml(await file.text())) as ImportedBpmnModel
      const normalizeType = (type: string): BpmnNodeType => {
        if (type === 'startEvent' || type === 'endEvent' || type === 'xorGateway' || type === 'andGateway' || type === 'orGateway') return type
        return 'task'
      }
      const colorForType = (type: BpmnNodeType) => ({
        startEvent: '#6BCB77', endEvent: '#FF5D5D', task: '#4D96FF',
        xorGateway: '#FFB020', andGateway: '#FFB020', orGateway: '#FFB020',
      }[type])
      const nodeById = new Map(imported.nodes.map((node, index) => {
        const type = normalizeType(node.type)
        const width = type === 'task' ? 176 : 78
        const height = type === 'task' ? 76 : 78
        const column = index % 3
        const row = Math.floor(index / 3)
        return [node.id, {
          id: node.id, type: 'sticky' as const, x: node.x ?? 100 + column * 260, y: node.y ?? 130 + row * 180,
          w: node.width ?? width, h: node.height ?? height, text: node.name || (type === 'task' ? 'Задача' : ''),
          color: colorForType(type), fill: colorForType(type), createdBy: user.id, bpmnNodeType: type,
          bpmnDurationMs: type === 'task' ? 1000 : undefined,
        }]
      }))

      ydoc.transact(() => {
        while (yElements.current!.length > 0) yElements.current!.delete(0, 1)
        for (const node of nodeById.values()) yElements.current!.push([node])
        for (const flow of imported.flows) {
          if (!nodeById.has(flow.sourceId) || !nodeById.has(flow.targetId)) continue
          yElements.current!.push([{
            id: flow.id, type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2,
            fill: 'transparent', createdBy: user.id,
            bpmnFlow: {
              sourceId: flow.sourceId,
              targetId: flow.targetId,
              flowType: flow.flowType || 'sequence',
              condition: flow.condition,
              probability: flow.probability,
              isDefault: flow.isDefault,
            },
          }])
        }
      })
      setSelectedId(null)
      setTransform({ x: 0, y: 0, scale: 1 })
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Не удалось импортировать BPMN-файл.')
    } finally {
      event.target.value = ''
    }
  }, [user.id, ydoc])

  // ======================== POINTER HANDLERS ========================
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as Element
    if (target.closest('[data-ui]')) return
    e.preventDefault()
    setContextMenu(null)
    setShowTemplates(false)
    setShowMore(false)
    setShowBpmnPalette(false)

    const point = screenToWorld(e.clientX, e.clientY)
    updateCursor(point.x, point.y, tool === 'laser')

    if (e.pointerType === 'touch' && e.isPrimary === false) return

    // Two fingers = pan
    if ('touches' in e.nativeEvent && (e.nativeEvent as any).touches?.length === 2) {
      setIsPanning(true)
      return
    }

    // Laser
    if (tool === 'laser') {
      setLaserPos(point)
      return
    }

    // Emoji
    if (tool === 'emoji') {
      addElement({
        id: genId(), type: 'emoji', x: point.x - 24, y: point.y - 24,
        w: 48, h: 48, emoji: selectedEmoji, color: 'transparent', createdBy: user.id
      })
      return
    }

    if (tool === 'pan' || (tool === 'select' && e.altKey) || e.button === 1) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y })
      return
    }

    if (tool === 'select') {
      // Check resize handle
      const resizeHandle = target.closest('[data-resize]') as HTMLElement
      if (resizeHandle && selectedId) {
        const el = elements.find(e => e.id === selectedId)
        if (el) {
          setResizeInfo({
            id: selectedId, corner: resizeHandle.dataset.resize!,
            startX: point.x, startY: point.y,
            elX: el.x, elY: el.y, elW: el.w || 0, elH: el.h || 0
          })
          return
        }
      }

      const el = target.closest('[data-id]') as HTMLElement
      if (el) {
        const elId = el.dataset.id!
        const boardEl = elements.find(e2 => e2.id === elId)
        setSelectedId(elId)
        if (boardEl) {
          setDragInfo({
            id: elId, startX: point.x, startY: point.y,
            elStartX: boardEl.x, elStartY: boardEl.y
          })
        }
        // Long press detection
        longPressRef.current = {
          timer: window.setTimeout(() => {
            setContextMenu({ x: point.x, y: point.y, id: elId })
            if ('vibrate' in navigator) navigator.vibrate(30)
          }, 500),
          x: e.clientX, y: e.clientY
        }
      } else {
        setSelectedId(null)
      }
      return
    }

    if (tool === 'eraser') {
      const el = target.closest('[data-id]') as HTMLElement
      if (el?.dataset.id) deleteElement(el.dataset.id)
      return
    }

    if (tool === 'bpmnSequence') {
      const elementTarget = target.closest('[data-id]') as HTMLElement
      const targetId = elementTarget?.dataset.id
      const targetNode = targetId ? elements.find(element => element.id === targetId && element.bpmnNodeType) : undefined
      if (!targetNode) return

      if (!bpmnFlowSourceId) {
        setBpmnFlowSourceId(targetNode.id)
        setSelectedId(targetNode.id)
        return
      }

      const sourceNode = elements.find(element => element.id === bpmnFlowSourceId && element.bpmnNodeType)
      if (!sourceNode || sourceNode.id === targetNode.id) {
        setBpmnFlowSourceId(null)
        return
      }

      const sourceX = sourceNode.x + (sourceNode.w || 0) / 2
      const sourceY = sourceNode.y + (sourceNode.h || 0) / 2
      const targetX = targetNode.x + (targetNode.w || 0) / 2
      const targetY = targetNode.y + (targetNode.h || 0) / 2
      const flowId = genId()
      addElement({
        id: flowId,
        type: 'arrow',
        x: sourceX,
        y: sourceY,
        w: targetX - sourceX,
        h: targetY - sourceY,
        color: '#334155',
        stroke: 2,
        fill: 'transparent',
        createdBy: user.id,
        bpmnFlow: { sourceId: sourceNode.id, targetId: targetNode.id, flowType: 'sequence' },
      })
      setBpmnFlowSourceId(null)
      setSelectedId(flowId)
      return
    }

    const bpmnNodeByTool: Partial<Record<Tool, { type: BpmnNodeType; text: string; w: number; h: number; color: string; durationMs?: number }>> = {
      bpmnStart: { type: 'startEvent', text: 'Старт', w: 72, h: 72, color: '#6BCB77' },
      bpmnTask: { type: 'task', text: 'Задача', w: 176, h: 76, color: '#4D96FF', durationMs: 1000 },
      bpmnEnd: { type: 'endEvent', text: 'Конец', w: 72, h: 72, color: '#FF5D5D' },
      bpmnGateway: { type: 'xorGateway', text: 'X', w: 78, h: 78, color: '#FFB020' },
      bpmnParallel: { type: 'andGateway', text: '+', w: 78, h: 78, color: '#FFB020' },
    }
    const bpmnNode = bpmnNodeByTool[tool]
    if (bpmnNode) {
      const id = genId()
      const newEl: BoardElement = {
        id,
        type: 'sticky',
        x: point.x - bpmnNode.w / 2,
        y: point.y - bpmnNode.h / 2,
        w: bpmnNode.w,
        h: bpmnNode.h,
        text: bpmnNode.text,
        color: bpmnNode.color,
        fill: bpmnNode.color,
        createdBy: user.id,
        bpmnNodeType: bpmnNode.type,
        bpmnDurationMs: bpmnNode.durationMs,
      }
      addElement(newEl)
      setSelectedId(id)
      return
    }

    if (tool === 'sticky' || tool === 'text') {
      const id = genId()
      const newEl: BoardElement = {
        id, type: tool === 'sticky' ? 'sticky' : 'text',
        x: point.x - 80, y: point.y - 40, w: 160, h: 160,
        text: tool === 'sticky' ? 'Заметка' : 'Текст',
        color: tool === 'sticky' ? STICKY_COLORS[0] : '#000000',
        fill: tool === 'sticky' ? STICKY_COLORS[0] : 'transparent',
        createdBy: user.id
      }
      addElement(newEl)
      setSelectedId(id)
      setEditingText(id)
      setEditValue(newEl.text || '')
      setTool('select')
      return
    }

    if (tool === 'rect' || tool === 'circle' || tool === 'arrow' || tool === 'line') {
      const id = genId()
      addElement({
        id, type: tool, x: point.x, y: point.y, w: 0, h: 0,
        color, stroke: strokeWidth, fill: 'transparent', createdBy: user.id
      })
      setSelectedId(id)
      setIsDrawing(true)
      return
    }

    if (tool === 'pen' || tool === 'marker') {
      setIsDrawing(true)
      setCurrentPath([point])
    }
  }, [tool, screenToWorld, updateCursor, transform, color, strokeWidth, addElement, deleteElement, user.id, selectedId, elements, selectedEmoji, bpmnFlowSourceId])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const point = screenToWorld(e.clientX, e.clientY)
    const isLaser = tool === 'laser'
    updateCursor(point.x, point.y, isLaser)
    if (isLaser) setLaserPos(point)

    // Cancel long press if moved
    if (longPressRef.current) {
      if (Math.hypot(e.clientX - longPressRef.current.x, e.clientY - longPressRef.current.y) > 8) {
        clearTimeout(longPressRef.current.timer)
        longPressRef.current = null
      }
    }

    if (isPanning && panStart) {
      setTransform(t => ({ ...t, x: e.clientX - panStart.x, y: e.clientY - panStart.y }))
      return
    }

    // Resize
    if (resizeInfo) {
      const dx = point.x - resizeInfo.startX
      const dy = point.y - resizeInfo.startY
      const c = resizeInfo.corner
      let newX = resizeInfo.elX, newY = resizeInfo.elY
      let newW = resizeInfo.elW, newH = resizeInfo.elH

      if (c === 'se') { newW = Math.max(30, resizeInfo.elW + dx); newH = Math.max(30, resizeInfo.elH + dy) }
      else if (c === 'sw') { newX = resizeInfo.elX + dx; newW = Math.max(30, resizeInfo.elW - dx); newH = Math.max(30, resizeInfo.elH + dy) }
      else if (c === 'ne') { newY = resizeInfo.elY + dy; newW = Math.max(30, resizeInfo.elW + dx); newH = Math.max(30, resizeInfo.elH - dy) }
      else if (c === 'nw') { newX = resizeInfo.elX + dx; newY = resizeInfo.elY + dy; newW = Math.max(30, resizeInfo.elW - dx); newH = Math.max(30, resizeInfo.elH - dy) }

      if (snapGrid) { newX = snapVal(newX); newY = snapVal(newY); newW = snapVal(newW); newH = snapVal(newH) }
      updateElement(resizeInfo.id, { x: newX, y: newY, w: newW, h: newH })
      return
    }

    // Drag
    if (dragInfo) {
      let newX = dragInfo.elStartX + (point.x - dragInfo.startX)
      let newY = dragInfo.elStartY + (point.y - dragInfo.startY)
      if (snapGrid) { newX = snapVal(newX); newY = snapVal(newY) }
      updateElement(dragInfo.id, { x: newX, y: newY })
      return
    }

    if (!isDrawing) return

    if (tool === 'pen' || tool === 'marker') {
      setCurrentPath(prev => [...prev, point])
      return
    }

    if (selectedId && (tool === 'rect' || tool === 'circle' || tool === 'arrow' || tool === 'line')) {
      const el = elements.find(e => e.id === selectedId)
      if (el) {
        let w = point.x - el.x, h = point.y - el.y
        if (snapGrid) { w = snapVal(w); h = snapVal(h) }
        updateElement(selectedId, { w, h })
      }
    }
  }, [isPanning, panStart, isDrawing, tool, selectedId, elements, screenToWorld, updateCursor, updateElement, dragInfo, resizeInfo, snapGrid])

  const handlePointerUp = useCallback(() => {
    // Cancel long press
    if (longPressRef.current) {
      clearTimeout(longPressRef.current.timer)
      longPressRef.current = null
    }

    if (isDrawing && (tool === 'pen' || tool === 'marker') && currentPath.length > 1) {
      const simplified = simplifyPath(currentPath, 2)
      const xs = simplified.map(p => p.x), ys = simplified.map(p => p.y)
      const minX = Math.min(...xs), minY = Math.min(...ys)
      const maxX = Math.max(...xs), maxY = Math.max(...ys)
      addElement({
        id: genId(), type: 'path', x: minX, y: minY, w: maxX - minX, h: maxY - minY,
        points: simplified.map(p => ({ x: p.x - minX, y: p.y - minY })),
        color: tool === 'marker' ? color + '80' : color,
        stroke: tool === 'marker' ? strokeWidth * 3 : strokeWidth,
        createdBy: user.id
      })
    }
    setIsDrawing(false)
    setCurrentPath([])
    setIsPanning(false)
    setPanStart(null)
    setLastPinchDist(null)
    setDragInfo(null)
    setResizeInfo(null)
  }, [isDrawing, tool, currentPath, color, strokeWidth, addElement, user.id])

  // Touch pinch
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const cx = (t1.clientX + t2.clientX) / 2, cy = (t1.clientY + t2.clientY) / 2
      if (lastPinchDist) {
        const s = dist / lastPinchDist
        setTransform(t => {
          const ns = clamp_scale(t.scale * s)
          const wc = screenToWorld(cx, cy)
          return { scale: ns, x: cx - wc.x * ns, y: cy - wc.y * ns }
        })
      }
      setLastPinchDist(dist)
    }
  }, [lastPinchDist, screenToWorld])

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.ctrlKey || e.metaKey ? -e.deltaY : -e.deltaY
    const scale = delta > 0 ? 1.08 : 0.92
    const point = screenToWorld(e.clientX, e.clientY)
    setTransform(t => {
      const ns = clamp_scale(t.scale * scale)
      return { scale: ns, x: e.clientX - point.x * ns, y: e.clientY - point.y * ns }
    })
  }, [screenToWorld])

  useEffect(() => {
    if (tool !== 'bpmnSequence') setBpmnFlowSourceId(null)
  }, [tool])

  useEffect(() => () => {
    bpmnRunTimersRef.current.forEach(window.clearTimeout)
  }, [])

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editingText) return
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) deleteElement(selectedId) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); if (selectedId) duplicateElement(selectedId) }
      const map: Record<string, Tool> = {
        v: 'select', h: 'pan', p: 'pen', m: 'marker', e: 'eraser',
        s: 'sticky', t: 'text', r: 'rect', o: 'circle', a: 'arrow', l: 'line'
      }
      if (!e.metaKey && !e.ctrlKey && map[e.key]) setTool(map[e.key])
      if (e.key === 'Escape') { setSelectedId(null); setContextMenu(null) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [selectedId, deleteElement, editingText, handleUndo, handleRedo, duplicateElement])

  // ======================== RENDER ELEMENT ========================
  const renderElement = (el: BoardElement) => {
    const isSelected = selectedId === el.id
    const invS = 1 / transform.scale

    if (el.bpmnNodeType) {
      const width = el.w || 80
      const height = el.h || 80
      const centerX = width / 2
      const centerY = height / 2
      const isTokenActive = activeBpmnTokenId === el.id
      const isGateway = el.bpmnNodeType === 'xorGateway' || el.bpmnNodeType === 'andGateway' || el.bpmnNodeType === 'orGateway'
      const isEvent = el.bpmnNodeType === 'startEvent' || el.bpmnNodeType === 'endEvent'
      return (
        <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
          {el.bpmnNodeType === 'startEvent' && <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 - 4} fill="white" stroke={el.color} strokeWidth={3} />}
          {el.bpmnNodeType === 'endEvent' && <>
            <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 - 4} fill="white" stroke={el.color} strokeWidth={5} />
            <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 - 10} fill="none" stroke={el.color} strokeWidth={1.5} />
          </>}
          {el.bpmnNodeType === 'task' && <rect width={width} height={height} rx={10} fill="white" stroke={el.color} strokeWidth={3} />}
          {isGateway && <polygon points={`${centerX},2 ${width - 2},${centerY} ${centerX},${height - 2} 2,${centerY}`} fill="white" stroke={el.color} strokeWidth={3} />}
          {isTokenActive && <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 + 8} fill="none" stroke="#8B5CF6" strokeWidth={3 * invS}>
            <animate attributeName="r" values={`${Math.min(width, height) / 2 + 4};${Math.min(width, height) / 2 + 12};${Math.min(width, height) / 2 + 4}`} dur="0.65s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.35;1" dur="0.65s" repeatCount="indefinite" />
          </circle>}
          <text x={centerX} y={centerY + 5} textAnchor="middle" fontSize={isEvent ? 11 : isGateway ? 24 : 14} fontWeight={isGateway ? 700 : 600} fill="#1f2937" className="pointer-events-none">
            {el.text}
          </text>
          {isSelected && <rect x={-4} y={-4} width={width + 8} height={height + 8}
            fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={isEvent ? width / 2 : 6} />}
        </g>
      )
    }

    switch (el.type) {
      case 'path': {
        if (!el.points || el.points.length < 2) return null
        const d = smoothPathD(el.points)
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none">
            <path d={d} fill="none" stroke={el.color} strokeWidth={el.stroke}
              strokeLinecap="round" strokeLinejoin="round" className="pointer-events-stroke"
              style={{ paintOrder: 'stroke', ...(el.stroke && el.stroke > 6 ? { filter: `blur(${el.stroke > 10 ? 1 : 0}px)` } : {}) }} />
            {isSelected && (
              <rect x={-4} y={-4} width={(el.w || 0) + 8} height={(el.h || 0) + 8}
                fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />
            )}
          </g>
        )
      }

      case 'sticky':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
            <rect width={el.w} height={el.h} fill={el.fill} rx={10}
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))' }} />
            <rect width={el.w} height={el.h} fill={el.fill} rx={10} />
            <foreignObject x={8} y={8} width={(el.w || 160) - 16} height={(el.h || 160) - 16}>
              <div className="w-full h-full flex items-center justify-center p-2 text-[14px] leading-snug font-medium text-black/80 break-words text-center select-none">
                {editingText === el.id ? (
                  <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { updateElement(el.id, { text: editValue }); setEditingText(null) }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); updateElement(el.id, { text: editValue }); setEditingText(null) } }}
                    className="w-full h-full bg-transparent outline-none resize-none text-center text-[14px]" />
                ) : (
                  <div onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }}>{el.text}</div>
                )}
              </div>
            </foreignObject>
            {isSelected && <>
              <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
                fill="none" stroke="#4D96FF" strokeWidth={2 * invS} rx={12} />
              {/* Resize handles */}
              {([['nw', -6, -6], ['ne', (el.w || 0) - 2, -6], ['sw', -6, (el.h || 0) - 2], ['se', (el.w || 0) - 2, (el.h || 0) - 2]] as [string, number, number][]).map(([c, cx, cy]) => (
                <circle key={c} data-resize={c} cx={cx} cy={cy} r={7 * invS}
                  fill="white" stroke="#4D96FF" strokeWidth={2 * invS} className="cursor-nwse-resize" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' }} />
              ))}
            </>}
          </g>
        )

      case 'text':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
            <foreignObject width={el.w || 200} height={el.h || 60}>
              <div className="w-full h-full select-none">
                {editingText === el.id ? (
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { updateElement(el.id, { text: editValue }); setEditingText(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') { updateElement(el.id, { text: editValue }); setEditingText(null) } }}
                    className="w-full bg-transparent outline-none text-[16px] font-semibold" style={{ color: el.color }} />
                ) : (
                  <div className="text-[16px] font-semibold pointer-events-none" style={{ color: el.color }}
                    onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }}>{el.text}</div>
                )}
              </div>
            </foreignObject>
            {isSelected && <rect x={-4} y={-4} width={(el.w || 200) + 8} height={(el.h || 60) + 8}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )

      case 'rect':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
            <rect width={el.w} height={el.h} fill={el.fill || 'transparent'} stroke={el.color}
              strokeWidth={el.stroke} rx={4} />
            {isSelected && <>
              <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
                fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={6} />
              {([['se', (el.w || 0), (el.h || 0)]] as [string, number, number][]).map(([c, cx, cy]) => (
                <circle key={c} data-resize={c} cx={cx} cy={cy} r={7 * invS}
                  fill="white" stroke="#4D96FF" strokeWidth={2 * invS} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' }} />
              ))}
            </>}
          </g>
        )

      case 'circle':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
            <ellipse cx={(el.w || 0) / 2} cy={(el.h || 0) / 2} rx={Math.abs((el.w || 0) / 2)} ry={Math.abs((el.h || 0) / 2)}
              fill={el.fill || 'transparent'} stroke={el.color} strokeWidth={el.stroke} />
            {isSelected && <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )

      case 'arrow': {
        const source = el.bpmnFlow ? elements.find(node => node.id === el.bpmnFlow?.sourceId) : undefined
        const target = el.bpmnFlow ? elements.find(node => node.id === el.bpmnFlow?.targetId) : undefined
        const sourceCenter = source ? { x: source.x + (source.w || 0) / 2, y: source.y + (source.h || 0) / 2 } : undefined
        const targetCenter = target ? { x: target.x + (target.w || 0) / 2, y: target.y + (target.h || 0) / 2 } : undefined
        const start = source && targetCenter ? bpmnEdgeAnchor(source, targetCenter.x, targetCenter.y) : { x: el.x, y: el.y }
        const end = target && sourceCenter ? bpmnEdgeAnchor(target, sourceCenter.x, sourceCenter.y) : { x: el.x + (el.w || 0), y: el.y + (el.h || 0) }
        const startX = start.x
        const startY = start.y
        const x2 = end.x - startX
        const y2 = end.y - startY
        const angle = Math.atan2(y2, x2)
        const hs = 12
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${startX},${startY})`} className="touch-none cursor-move">
            <line x1={0} y1={0} x2={x2} y2={y2} stroke={el.color} strokeWidth={el.stroke} />
            <polygon points={`${x2},${y2} ${x2 - hs * Math.cos(angle - 0.4)},${y2 - hs * Math.sin(angle - 0.4)} ${x2 - hs * Math.cos(angle + 0.4)},${y2 - hs * Math.sin(angle + 0.4)}`}
              fill={el.color} />
            {isSelected && <rect x={Math.min(0, x2) - 4} y={Math.min(0, y2) - 4}
              width={Math.abs(x2) + 8} height={Math.abs(y2) + 8}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )
      }

      case 'line':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
            <line x1={0} y1={0} x2={el.w || 0} y2={el.h || 0} stroke={el.color} strokeWidth={el.stroke} strokeLinecap="round" />
            {isSelected && <rect x={Math.min(0, el.w || 0) - 4} y={Math.min(0, el.h || 0) - 4}
              width={Math.abs(el.w || 0) + 8} height={Math.abs(el.h || 0) + 8}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )

      case 'emoji':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
            <foreignObject width={el.w || 48} height={el.h || 48}>
              <div className="w-full h-full flex items-center justify-center select-none" style={{ fontSize: Math.min((el.w || 48) * 0.8, 64) }}>
                {el.emoji || '👍'}
              </div>
            </foreignObject>
            {isSelected && <rect x={-2} y={-2} width={(el.w || 48) + 4} height={(el.h || 48) + 4}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={6} />}
          </g>
        )

      default: return null
    }
  }

  // ======================== MINIMAP ========================
  const renderMiniMap = () => {
    if (!showMiniMap || elements.length === 0) return null
    const MW = 130, MH = 90
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
    elements.forEach(el => {
      mnx = Math.min(mnx, el.x); mny = Math.min(mny, el.y)
      mxx = Math.max(mxx, el.x + (el.w || 20)); mxy = Math.max(mxy, el.y + (el.h || 20))
    })
    if (!isFinite(mnx)) return null
    const pad = 80; mnx -= pad; mny -= pad; mxx += pad; mxy += pad
    const ww = mxx - mnx, wh = mxy - mny
    const ms = Math.min(MW / ww, MH / wh)
    const tm = (wx: number, wy: number) => ({ x: (wx - mnx) * ms, y: (wy - mny) * ms })
    const vpX1 = -transform.x / transform.scale, vpY1 = -transform.y / transform.scale
    const vpX2 = vpX1 + (window.innerWidth) / transform.scale
    const vpY2 = vpY1 + (window.innerHeight) / transform.scale
    const vs = tm(vpX1, vpY1), ve = tm(vpX2, vpY2)

    const handleNav = (e: React.MouseEvent<SVGSVGElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      const wx = (e.clientX - r.left) / ms + mnx
      const wy = (e.clientY - r.top) / ms + mny
      setTransform(t => ({ ...t, x: -wx * t.scale + window.innerWidth / 2, y: -wy * t.scale + window.innerHeight / 2 }))
    }

    return (
      <div className={`absolute bottom-[100px] left-3 z-20 rounded-2xl overflow-hidden shadow-xl border ${darkMode ? 'bg-[#1e293b] border-slate-600' : 'bg-white border-black/10'}`} data-ui>
        <svg width={MW} height={MH} onClick={handleNav} className="cursor-pointer">
          <rect width={MW} height={MH} fill={darkMode ? '#1e293b' : '#f8f8f6'} />
          {elements.map(el => {
            const p = tm(el.x, el.y)
            const w = Math.max((el.w || 6) * ms, 2), h = Math.max((el.h || 6) * ms, 2)
            return <rect key={el.id} x={p.x} y={p.y} width={w} height={h}
              fill={el.fill || el.color || '#888'} rx={1} opacity={0.7} />
          })}
          <rect x={vs.x} y={vs.y} width={Math.max(ve.x - vs.x, 4)} height={Math.max(ve.y - vs.y, 4)}
            fill="rgba(77,150,255,0.15)" stroke="#4D96FF" strokeWidth={1.5} rx={2} />
        </svg>
      </div>
    )
  }

  // ======================== JSX ========================
  const dk = darkMode
  const bgMain = dk ? '#0f172a' : '#F7F7F5'
  const bgBar = dk ? 'bg-slate-800/95' : 'bg-white/95'
  const borderC = dk ? 'border-slate-600' : 'border-black/10'
  const textC = dk ? 'text-white' : 'text-black'
  const textSec = dk ? 'text-slate-300' : 'text-black/70'
  const hoverBg = dk ? 'hover:bg-slate-700' : 'hover:bg-black/5'

  return (
    <div className={`fixed inset-0 overflow-hidden select-none ${dk ? 'bg-slate-900 text-white' : 'bg-[#F7F7F5] text-black'}`}>
      <input ref={bpmnImportRef} type="file" accept=".bpmn,.xml,application/xml,text/xml" className="hidden" onChange={importFromBpmn} />

      {/* ===== HEADER ===== */}
      <div className={`absolute top-0 left-0 right-0 z-30 h-[52px] flex items-center justify-between px-3 ${dk ? 'bg-slate-900/90' : 'bg-white/90'} backdrop-blur-xl border-b ${borderC}`} data-ui>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="size-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 grid place-items-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </div>
            <span className={`text-[15px] font-bold tracking-tight ${textC}`}>MiroBoard</span>
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold ${dk ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>
              {DISPLAY_VERSION}
            </span>
            <button
              onClick={() => setShowProjectHistory(true)}
              className={`h-7 px-2 rounded-lg text-[11px] font-semibold transition ${hoverBg} ${textSec}`}
              title="История проекта"
            >
              История
            </button>
          </div>
          <div className={`h-4 w-px ${dk ? 'bg-slate-600' : 'bg-black/10'}`} />
          {/* Undo/Redo */}
          <button onClick={handleUndo} disabled={!canUndo}
            className={`size-8 grid place-items-center rounded-lg transition ${canUndo ? hoverBg + ' ' + textSec : 'opacity-25 cursor-default'}`} title="Отменить (Ctrl+Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10h13a4 4 0 0 1 0 8H9M3 10l5-5M3 10l5 5" /></svg>
          </button>
          <button onClick={handleRedo} disabled={!canRedo}
            className={`size-8 grid place-items-center rounded-lg transition ${canRedo ? hoverBg + ' ' + textSec : 'opacity-25 cursor-default'}`} title="Вернуть (Ctrl+Shift+Z)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H8a4 4 0 0 0 0 8h7M21 10l-5-5M21 10l-5 5" /></svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {tool === 'bpmnSequence' && (
            <div className={`h-7 px-2 rounded-lg text-[11px] font-semibold ${dk ? 'bg-violet-900 text-violet-100' : 'bg-violet-100 text-violet-700'}`}>
              {bpmnFlowSourceId ? 'Поток: выберите цель' : 'Поток: выберите источник'}
            </div>
          )}
          {elements.some(element => element.bpmnNodeType) && (
            <>
              <div
                className={`h-7 px-2 rounded-lg text-[11px] font-semibold flex items-center gap-1 ${bpmnIssues.some(issue => issue.severity === 'error') ? 'bg-red-100 text-red-700' : bpmnIssues.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}
                title={bpmnIssues.map(issue => issue.message).join('\n') || 'BPMN-модель корректна'}
              >
                <span>{bpmnIssues.some(issue => issue.severity === 'error') ? '!' : '✓'}</span>
                BPMN {bpmnIssues.length || 'OK'}
              </div>
              {bpmnRunSummary && (
                <div className={`h-7 px-2 rounded-lg text-[11px] font-semibold ${dk ? 'bg-indigo-950 text-indigo-200' : 'bg-indigo-50 text-indigo-700'}`}>
                  {bpmnRunSummary}
                </div>
              )}
              {bpmnSimulationSummary && (
                <div className={`h-7 max-w-[340px] truncate px-2 rounded-lg text-[11px] font-semibold ${dk ? 'bg-fuchsia-950 text-fuchsia-200' : 'bg-fuchsia-50 text-fuchsia-700'}`} title={bpmnSimulationSummary}>
                  {bpmnSimulationSummary}
                </div>
              )}
            </>
          )}
          {/* Snap */}
          <button onClick={() => setSnapGrid(!snapGrid)}
            className={`h-7 px-2 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${snapGrid ? (dk ? 'bg-violet-600 text-white' : 'bg-violet-100 text-violet-700') : (dk ? 'text-slate-400 hover:bg-slate-700' : 'text-black/40 hover:bg-black/5')}`} title="Привязка к сетке">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>
            Сетка
          </button>
          {/* Dark mode */}
          <button onClick={() => setDarkMode(!dk)} className={`size-8 grid place-items-center rounded-lg transition ${hoverBg} ${textSec}`} title="Тёмная тема">
            {dk ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
          </button>
          {/* Participants */}
          <div className={`h-7 px-2 rounded-full ${dk ? 'bg-slate-700' : 'bg-black/5'} flex items-center gap-1.5 text-[12px] font-medium`}>
            <span className={`size-1.5 rounded-full ${participants > 1 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            {participants}
          </div>
          {/* Minimap toggle */}
          <button onClick={() => setShowMiniMap(!showMiniMap)} className={`size-8 grid place-items-center rounded-lg transition ${hoverBg} ${textSec}`} title="Мини-карта">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18" /></svg>
          </button>
          {/* Share */}
          <button onClick={() => setShowShare(true)}
            className="h-8 px-3 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition shadow-md shadow-violet-500/20">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13" /></svg>
            <span className="hidden sm:inline">Поделиться</span>
          </button>
        </div>
      </div>

      {/* ===== CANVAS ===== */}
      <div ref={canvasRef} className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        onTouchMove={handleTouchMove} onWheel={handleWheel}
        onContextMenu={e => e.preventDefault()}
        style={{ touchAction: 'none' }}>

        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }}>
          <defs>
            <pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              <circle cx="0" cy="0" r={snapGrid ? 1.5 : 1} fill={dk ? '#fff' : '#000'} fillOpacity={snapGrid ? (dk ? 0.12 : 0.1) : (dk ? 0.05 : 0.06)} />
            </pattern>
            <pattern id="grid-large" width={200} height={200} patternUnits="userSpaceOnUse"
              patternTransform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              <circle cx="0" cy="0" r={1.8} fill={dk ? '#fff' : '#000'} fillOpacity={dk ? 0.08 : 0.1} />
            </pattern>
            {/* Snap grid lines */}
            {snapGrid && (
              <pattern id="snap-grid" width={40} height={40} patternUnits="userSpaceOnUse"
                patternTransform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
                <line x1={0} y1={0} x2={40} y2={0} stroke={dk ? '#fff' : '#000'} strokeOpacity={0.04} strokeWidth={0.5} />
                <line x1={0} y1={0} x2={0} y2={40} stroke={dk ? '#fff' : '#000'} strokeOpacity={0.04} strokeWidth={0.5} />
              </pattern>
            )}
          </defs>
          <rect width="100%" height="100%" fill={bgMain} />
          {snapGrid && <rect width="100%" height="100%" fill="url(#snap-grid)" />}
          <rect width="100%" height="100%" fill="url(#grid)" />
          <rect width="100%" height="100%" fill="url(#grid-large)" />

          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {elements.map(renderElement)}

            {/* Current drawing path */}
            {isDrawing && currentPath.length > 1 && (tool === 'pen' || tool === 'marker') && (
              <path d={smoothPathD(currentPath)} fill="none"
                stroke={tool === 'marker' ? color + '80' : color}
                strokeWidth={tool === 'marker' ? strokeWidth * 3 : strokeWidth}
                strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
            )}

            {/* Laser pointer */}
            {tool === 'laser' && laserPos && (
              <g transform={`translate(${laserPos.x},${laserPos.y})`}>
                <circle r={8} fill="#FF5D5D" opacity={0.9}>
                  <animate attributeName="r" values="6;12;6" dur="1s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.9;0.4;0.9" dur="1s" repeatCount="indefinite" />
                </circle>
                <circle r={3} fill="#FF0000" />
              </g>
            )}

            {/* Remote cursors */}
            {cursors.map(c => (
              <g key={c.id} transform={`translate(${c.x},${c.y})`} className="pointer-events-none">
                {c.isLaser ? (
                  <g>
                    <circle r={10} fill={c.color} opacity={0.7}>
                      <animate attributeName="r" values="8;14;8" dur="1s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.7;0.3;0.7" dur="1s" repeatCount="indefinite" />
                    </circle>
                    <circle r={4} fill={c.color} />
                  </g>
                ) : (
                  <>
                    <path d="M0 0 L0 16 L4 12 L8 18 L10 17 L6 11 L12 11 Z" fill={c.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" />
                    <rect x="12" y="8" rx="4" ry="4" width={c.name.length * 7 + 12} height="18" fill={c.color} />
                    <text x="18" y="20" fontSize="11" fill="white" fontWeight="600" fontFamily="inherit">{c.name}</text>
                  </>
                )}
              </g>
            ))}
          </g>
        </svg>

        {/* Empty state */}
        {elements.length === 0 && !showTemplates && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ paddingTop: '52px' }}>
            <div className={`text-center px-6 -mt-20 ${textC}`}>
              <div className={`inline-flex size-16 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white shadow-xl shadow-black/5 border border-black/5'} items-center justify-center mb-4 border`}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="text-violet-500">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="text-[22px] font-semibold tracking-tight">Начните творить</h2>
              <p className={`text-[14px] ${dk ? 'text-slate-400' : 'text-black/55'} mt-1.5 max-w-[280px] mx-auto leading-snug`}>
                Выберите инструмент внизу и касайтесь экрана. Или начните с шаблона!
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <div className={`h-7 px-3 rounded-full ${dk ? 'bg-slate-700 text-slate-300' : 'bg-black/5 text-black/70'} text-[12px] font-medium flex items-center gap-1.5`}>
                  <span className={`size-1.5 rounded-full ${participants > 1 ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
                  {participants > 1 ? `${participants} онлайн` : 'Ожидание...'}
                </div>
              </div>
              <button onClick={() => setShowTemplates(true)}
                className="mt-4 h-9 px-5 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white text-[14px] font-medium pointer-events-auto active:scale-95 transition shadow-md">
                📋 Начать с шаблона
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MINIMAP ===== */}
      {renderMiniMap()}

      {/* ===== BOTTOM TOOLBAR ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pb-[calc(env(safe-area-inset-bottom)+8px)]" data-ui>
        <div className="mx-auto w-fit max-w-[calc(100%-16px)]">

          {/* Emoji picker */}
          {showEmoji && (
            <div className={`mb-2 mx-auto w-fit p-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${borderC}`}>
              <div className="flex flex-wrap gap-1 max-w-[280px]">
                {EMOJIS.map(em => (
                  <button key={em} onClick={() => { setSelectedEmoji(em); setTool('emoji'); setShowEmoji(false) }}
                    className={`size-10 rounded-xl grid place-items-center text-[22px] transition active:scale-90 ${selectedEmoji === em ? (dk ? 'bg-violet-600' : 'bg-violet-100') : hoverBg}`}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showBpmnPalette && (
            <div className={`mb-2 mx-auto w-fit p-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${borderC}`}>
              <div className="flex gap-1.5">
                {([
                  { id: 'bpmnStart', label: 'Старт', icon: '○' },
                  { id: 'bpmnTask', label: 'Задача', icon: '▭' },
                  { id: 'bpmnGateway', label: 'Шлюз XOR', icon: '◇' },
                  { id: 'bpmnParallel', label: 'Шлюз AND', icon: '+' },
                  { id: 'bpmnEnd', label: 'Конец', icon: '◉' },
                  { id: 'bpmnSequence', label: 'Поток', icon: '→' },
                ] as { id: Tool; label: string; icon: string }[]).map(item => (
                  <button key={item.id} onClick={() => { setTool(item.id); setShowBpmnPalette(false); setShowMore(false) }}
                    className={`min-w-14 h-12 px-2 rounded-xl grid place-items-center text-center transition active:scale-90 ${tool === item.id ? 'bg-violet-600 text-white' : hoverBg}`}
                    title={item.label}>
                    <span className="text-xl leading-none">{item.icon}</span>
                    <span className="text-[10px] leading-none mt-0.5">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Color picker */}
          {showColorPicker && (
            <div className={`mb-2 mx-auto w-fit flex items-center gap-1.5 p-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${borderC}`}>
              {COLORS.map(c => (
                <button key={c} onClick={() => { setColor(c); setShowColorPicker(false) }}
                  className="size-8 rounded-full transition-all active:scale-90"
                  style={{ backgroundColor: c, border: c === '#FFFFFF' ? `1px solid ${dk ? '#555' : '#e5e5e5'}` : 'none', boxShadow: color === c ? '0 0 0 2px white, 0 0 0 4px #4D96FF' : 'none' }} />
              ))}
              <div className={`w-px h-6 ${dk ? 'bg-slate-600' : 'bg-black/10'} mx-1`} />
              {[2, 4, 7, 12].map(w => (
                <button key={w} onClick={() => setStrokeWidth(w)}
                  className={`size-8 rounded-full grid place-items-center transition ${strokeWidth === w ? (dk ? 'bg-slate-600' : 'bg-black/10') : hoverBg}`}>
                  <div className="rounded-full bg-current" style={{ width: w * 2, height: w * 2, color: dk ? '#fff' : '#000' }} />
                </button>
              ))}
            </div>
          )}

          {/* Main toolbar */}
          <div className={`flex items-center gap-0.5 p-1.5 rounded-[22px] ${bgBar} backdrop-blur-2xl shadow-2xl shadow-black/20 border ${borderC}`}>
            {([
              { id: 'select', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg>, label: 'Выбор' },
              { id: 'pan', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 11V8a1 1 0 0 0-1-1h-3M6 13v3a1 1 0 0 0 1 1h3M13 18h3a1 1 0 0 0 1-1v-3M11 6H8a1 1 0 0 0-1 1v3" /></svg>, label: 'Рука' },
              { id: 'pen', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><path d="M11 11l4 4" /></svg>, label: 'Перо' },
              { id: 'marker', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.34 4.93l-3.59 3.59-1.41-1.42-1.42 1.42 1.42 1.41-3.6 3.59c-.39.39-.39 1.02 0 1.41L10.34 19c.39.39 1.02.39 1.41 0l3.6-3.59 1.41 1.42 1.42-1.42-1.42-1.41 3.59-3.59c.39-.39.39-1.02 0-1.41L15.75 4.93c-.39-.39-1.02-.39-1.41 0z" /></svg>, label: 'Маркер' },
            ] as { id: Tool; icon: React.ReactNode; label: string }[]).map(t => (
              <button key={t.id} onClick={() => { setTool(t.id); setShowEmoji(false) }}
                className={`size-11 grid place-items-center rounded-[14px] transition-all active:scale-90 ${tool === t.id ? 'bg-black text-white shadow-md' : `${textSec} ${hoverBg}`}`}
                title={t.label}>{t.icon}</button>
            ))}

            <div className={`w-px h-7 ${dk ? 'bg-slate-600' : 'bg-black/10'} mx-0.5`} />

            {([
              { id: 'sticky', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" fill="#FFD93D" stroke="#000" strokeOpacity="0.1" /><path d="M7 8h10M7 12h7M7 16h4" stroke="#000" strokeOpacity="0.5" strokeWidth="1.5" strokeLinecap="round" /></svg> },
              { id: 'text', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7V4h16v3M9 20h6M12 4v16" /></svg> },
              { id: 'emoji', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg> },
              { id: 'rect', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /></svg> },
              { id: 'circle', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /></svg> },
              { id: 'arrow', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7" /></svg> },
            ] as { id: Tool; icon: React.ReactNode }[]).map(t => (
              <button key={t.id} onClick={() => {
                if (t.id === 'emoji') { setShowEmoji(!showEmoji); setTool('emoji') }
                else { setTool(t.id); setShowEmoji(false) }
              }}
                className={`size-11 grid place-items-center rounded-[14px] transition-all active:scale-90 ${tool === t.id ? 'bg-black text-white shadow-md' : `${textSec} ${hoverBg}`}`}
              >{t.icon}</button>
            ))}

            <div className={`w-px h-7 ${dk ? 'bg-slate-600' : 'bg-black/10'} mx-0.5`} />

            {/* Color */}
            <button onClick={() => setShowColorPicker(!showColorPicker)}
              className={`size-11 grid place-items-center rounded-[14px] ${hoverBg} transition`}>
              <div className="size-6 rounded-full ring-2 ring-black/10 shadow-inner" style={{ backgroundColor: color, border: color === '#FFFFFF' ? `1px solid ${dk ? '#555' : '#ddd'}` : 'none' }} />
            </button>

            {/* More */}
            <button onClick={() => setShowMore(!showMore)}
              className={`size-11 grid place-items-center rounded-[14px] transition-all active:scale-90 ${showMore ? 'bg-black text-white' : `${textSec} ${hoverBg}`}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ===== MORE MENU ===== */}
      {showMore && (
        <div className={`absolute bottom-[104px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC}`} data-ui>
          <button onClick={() => { setTool('line'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${tool === 'line' ? 'bg-black text-white' : hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 19L19 5" /></svg> Линия
          </button>
          <button onClick={() => { setTool('laser'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${tool === 'laser' ? 'bg-black text-white' : hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="4 3" /></svg> Лазер
          </button>
          <button onClick={() => { setTool('eraser'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${tool === 'eraser' ? 'bg-black text-white' : hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16a1.9 1.9 0 0 1 0-2.8L14.2 2h.8l6 6v.8L9.8 20" /></svg> Ластик
          </button>
          <button onClick={() => { setShowBpmnPalette(!showBpmnPalette); setShowMore(false); setShowEmoji(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${showBpmnPalette ? 'bg-violet-600 text-white' : hoverBg}`}>
            ◇ BPMN
          </button>
          <div className={`w-px h-6 ${dk ? 'bg-slate-600' : 'bg-black/10'}`} />
          <button onClick={() => { setShowTemplates(true); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            📋 Шаблоны
          </button>
          <button onClick={() => { bpmnImportRef.current?.click(); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            ⇧ BPMN
          </button>
          {elements.some(element => element.bpmnNodeType) && (
            <>
              <button onClick={() => { runBpmn(); setShowMore(false) }}
                className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
                ▶ Запуск
              </button>
              <button onClick={() => { setShowSimulationPanel(true); setShowMore(false) }}
                className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
                ◌ Симуляция
              </button>
              <button onClick={() => { exportToBpmn(); setShowMore(false) }}
                className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
                ⇩ BPMN
              </button>
            </>
          )}
          <button onClick={() => { exportToPNG(); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg> PNG
          </button>
          <button onClick={() => { setTransform({ x: 0, y: 0, scale: 1 }); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M9 22V12h6v10" /></svg> Домой
          </button>
        </div>
      )}

      {/* ===== CONTEXT MENU ===== */}
      {contextMenu && (
        <div className="absolute z-40" style={{
          left: contextMenu.x * transform.scale + transform.x,
          top: contextMenu.y * transform.scale + transform.y
        }} data-ui>
          <div className={`rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${borderC} overflow-hidden py-1 min-w-[180px]`}>
            {[
              { label: '✏️ Редактировать', action: () => { const el = elements.find(e => e.id === contextMenu.id); if (el) { setEditingText(el.id); setEditValue(el.text || ''); } } },
              { label: '📋 Дублировать', action: () => duplicateElement(contextMenu.id) },
              { label: '⬆️ На передний план', action: () => bringToFront(contextMenu.id) },
              { label: '⬇️ На задний план', action: () => sendToBack(contextMenu.id) },
              { label: '🗑️ Удалить', action: () => deleteElement(contextMenu.id), danger: true },
            ].map((item, i) => (
              <button key={i} onClick={() => { item.action(); setContextMenu(null) }}
                className={`w-full h-10 px-4 text-left text-[14px] flex items-center gap-2 transition ${(item as any).danger ? 'text-red-500 hover:bg-red-50' : `${textSec} ${hoverBg}`}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ===== STICKY COLORS ===== */}
      {selectedBpmnTask && !contextMenu && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-[154px] z-30 flex items-center gap-2 px-3 py-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC}`} data-ui>
          <label className={`text-[11px] font-semibold ${textSec}`} htmlFor="bpmn-duration">Длительность, с</label>
          <input
            id="bpmn-duration"
            type="number"
            min="0"
            max="3600"
            step="0.1"
            value={(selectedBpmnTask.bpmnDurationMs ?? 1000) / 1000}
            onChange={(event) => {
              const seconds = Number(event.target.value)
              if (Number.isFinite(seconds) && seconds >= 0) {
                updateElement(selectedBpmnTask.id, { bpmnDurationMs: Math.round(Math.min(seconds, 3600) * 1000) })
              }
            }}
            className={`w-16 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
          />
        </div>
      )}
      {selectedBpmnFlow && !contextMenu && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-[204px] z-30 flex items-center gap-2 px-3 py-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC}`} data-ui>
          <label className={`text-[11px] font-semibold ${textSec}`} htmlFor="bpmn-flow-condition">Условие</label>
          <input
            id="bpmn-flow-condition"
            value={selectedBpmnFlow.bpmnFlow?.condition || ''}
            placeholder="true"
            onChange={(event) => updateElement(selectedBpmnFlow.id, {
              bpmnFlow: { ...selectedBpmnFlow.bpmnFlow!, condition: event.target.value || undefined },
            })}
            className={`w-20 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
          />
          {selectedBpmnFlowIsXor && (
            <>
              <label className={`text-[11px] font-semibold ${textSec}`} htmlFor="bpmn-flow-probability">P</label>
              <input
                id="bpmn-flow-probability"
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={selectedBpmnFlow.bpmnFlow?.probability ?? ''}
                onChange={(event) => {
                  const value = event.target.value
                  const probability = value === '' ? undefined : Number(value)
                  if (probability === undefined || (Number.isFinite(probability) && probability >= 0 && probability <= 1)) {
                    updateElement(selectedBpmnFlow.id, {
                      bpmnFlow: { ...selectedBpmnFlow.bpmnFlow!, probability },
                    })
                  }
                }}
                className={`w-14 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
              />
              <label className={`flex items-center gap-1 text-[11px] font-semibold ${textSec}`}>
                <input
                  type="checkbox"
                  checked={selectedBpmnFlow.bpmnFlow?.isDefault || false}
                  onChange={(event) => updateElement(selectedBpmnFlow.id, {
                    bpmnFlow: { ...selectedBpmnFlow.bpmnFlow!, isDefault: event.target.checked },
                  })}
                />
                default
              </label>
            </>
          )}
        </div>
      )}
      {selectedId && elements.find(e => e.id === selectedId && (e.type === 'sticky' || e.type === 'rect' || e.type === 'circle')) && !contextMenu && (
        <div className={`absolute left-1/2 -translate-x-1/2 bottom-[104px] z-30 flex items-center gap-1 p-1.5 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC}`} data-ui>
          {STICKY_COLORS.map(c => (
            <button key={c} onClick={() => updateElement(selectedId, { color: c, fill: c })}
              className="size-7 rounded-full ring-1 ring-black/10 active:scale-90 transition" style={{ background: c }} />
          ))}
        </div>
      )}

      {/* ===== SIMULATION MODAL ===== */}
      {showSimulationPanel && (
        <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={() => setShowSimulationPanel(false)} data-ui>
          <section className={`w-full max-w-md rounded-[28px] ${dk ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} shadow-2xl p-6`} onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold">Monte Carlo симуляция</h2>
                <p className={`mt-1 text-sm ${textSec}`}>Вероятности XOR, фиксированный seed и воспроизводимый результат.</p>
              </div>
              <button onClick={() => setShowSimulationPanel(false)} className={`size-9 rounded-xl text-lg ${hoverBg}`} aria-label="Закрыть симуляцию">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <label className={`text-[12px] font-semibold ${textSec}`}>Seed
                <input value={simulationSeed} onChange={event => setSimulationSeed(event.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
              <label className={`text-[12px] font-semibold ${textSec}`}>Прогоны
                <input type="number" min="1" max="10000" value={simulationRuns} onChange={event => setSimulationRuns(event.target.value)} className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'border-slate-200'}`} />
              </label>
            </div>
            <button onClick={simulateBpmn} className="w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2.5 text-sm font-bold text-white">
              Запустить симуляцию
            </button>
            {bpmnSimulationResult && (
              <div className={`mt-5 grid grid-cols-3 gap-2 rounded-2xl p-3 ${dk ? 'bg-slate-700' : 'bg-slate-50'}`}>
                {([
                  ['Min', bpmnSimulationResult.minDurationMs],
                  ['Mean', bpmnSimulationResult.meanDurationMs],
                  ['P50', bpmnSimulationResult.p50DurationMs],
                  ['P90', bpmnSimulationResult.p90DurationMs],
                  ['P95', bpmnSimulationResult.p95DurationMs],
                  ['Max', bpmnSimulationResult.maxDurationMs],
                ] as const).map(([label, milliseconds]) => (
                  <div key={label} className="text-center">
                    <div className={`text-[10px] font-semibold ${textSec}`}>{label}</div>
                    <div className="text-sm font-bold">{(milliseconds / 1000).toFixed(1)}с</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===== PROJECT HISTORY MODAL ===== */}
      {showProjectHistory && (
        <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={() => setShowProjectHistory(false)} data-ui>
          <section className={`w-full max-w-3xl max-h-[82vh] overflow-y-auto rounded-[28px] ${dk ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'} shadow-2xl p-6`} onClick={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h2 className="text-xl font-bold">История проекта</h2>
                <p className={`mt-1 text-sm ${textSec}`}>Учебная хронология разработки MiroBoard, зафиксированная Git-коммитами.</p>
              </div>
              <button onClick={() => setShowProjectHistory(false)} className={`size-9 rounded-xl text-lg ${hoverBg}`} aria-label="Закрыть историю">×</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 mb-6">
              <a href={GITHUB_REPOSITORY} target="_blank" rel="noreferrer" className={`rounded-2xl p-3 ${dk ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-50 hover:bg-slate-100'} transition`}>
                <div className={`text-[11px] font-semibold ${textSec}`}>Репозиторий</div>
                <div className="mt-1 text-sm font-bold">GitHub ↗</div>
              </a>
              <div className={`rounded-2xl p-3 ${dk ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <div className={`text-[11px] font-semibold ${textSec}`}>Автономный релиз</div>
                <div className="mt-1 text-sm font-bold">Один HTML-файл</div>
              </div>
              <div className={`rounded-2xl p-3 ${dk ? 'bg-slate-700' : 'bg-slate-50'}`}>
                <div className={`text-[11px] font-semibold ${textSec}`}>Токены модели</div>
                <div className="mt-1 text-sm font-bold">Не измеряются достоверно</div>
              </div>
            </div>

            <div className={`rounded-2xl p-4 mb-5 ${dk ? 'bg-indigo-950/70' : 'bg-indigo-50'}`}>
              <h3 className="text-sm font-bold">Стек и engineering harness</h3>
              <p className={`mt-1 text-[13px] leading-5 ${textSec}`}>
                React, TypeScript, Vite, Tailwind, Yjs, WebRTC, IndexedDB и Rust/WASM. Factory Droid harness выполняет scoped-изменения, Rust/TypeScript-проверки, production build, Git commit/push и ведёт локальную операционную историю через jj.
              </p>
              <p className={`mt-2 text-[12px] leading-5 ${textSec}`}>
                Git не содержит точных usage-метрик LLM, поэтому число токенов не выводится как оценка. Достоверный учёт возможен только при подключении telemetry API провайдера модели.
              </p>
            </div>

            <h3 className="text-sm font-bold mb-3">Этапы</h3>
            <ol className="space-y-3">
              {PROJECT_HISTORY.map(([timestamp, commit, title]) => (
                <li key={commit} className={`relative pl-5 border-l-2 ${dk ? 'border-slate-600' : 'border-slate-200'}`}>
                  <span className={`absolute -left-[5px] top-1.5 size-2 rounded-full ${dk ? 'bg-violet-400' : 'bg-violet-500'}`} />
                  <div className={`text-[11px] font-mono ${textSec}`}>{timestamp}</div>
                  <a href={`${GITHUB_REPOSITORY}/commit/${commit}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold hover:underline">
                    {title} <span className={`font-mono text-[11px] ${textSec}`}>{commit} ↗</span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}

      {/* ===== TEMPLATES MODAL ===== */}
      {showTemplates && (
        <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={() => setShowTemplates(false)} data-ui>
          <div className={`w-full max-w-[400px] rounded-[28px] ${dk ? 'bg-slate-800' : 'bg-white'} shadow-2xl p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[20px] font-semibold tracking-tight">Шаблоны досок</h3>
              <button onClick={() => setShowTemplates(false)} className={`size-8 grid place-items-center rounded-full ${hoverBg}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'kanban', name: '📋 Канбан', desc: 'To Do → В процессе → Готово', gradient: 'from-yellow-400 to-orange-400' },
                { id: 'brainstorm', name: '🧠 Мозговой штурм', desc: 'Идеи вокруг центральной темы', gradient: 'from-violet-400 to-purple-500' },
                { id: 'swot', name: '📊 SWOT анализ', desc: 'Сильные, слабые, возможности, угрозы', gradient: 'from-green-400 to-blue-400' },
                { id: 'retro', name: '🔄 Ретроспектива', desc: 'Что хорошо, что улучшить, действия', gradient: 'from-blue-400 to-cyan-400' },
                { id: 'flowchart', name: '🔀 Блок-схема', desc: 'Последовательность шагов', gradient: 'from-pink-400 to-rose-400' },
                { id: 'bpmn', name: '⚙️ BPMN 2.0', desc: 'Старт, задача, завершение и проверка', gradient: 'from-indigo-400 to-violet-500' },
              ].map(t => (
                <button key={t.id} onClick={() => applyTemplate(t.id)}
                  className={`p-4 rounded-2xl ${dk ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-50 hover:bg-gray-100'} text-left transition active:scale-95`}>
                  <div className={`text-[28px] mb-2`}>{t.name.split(' ')[0]}</div>
                  <div className="text-[14px] font-semibold mb-0.5">{t.name.split(' ').slice(1).join(' ')}</div>
                  <div className={`text-[12px] ${dk ? 'text-slate-400' : 'text-black/50'}`}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== SHARE MODAL ===== */}
      {showShare && (
        <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-black/60 backdrop-blur-xl" onClick={() => setShowShare(false)} data-ui>
          <div className={`w-full max-w-[380px] rounded-[28px] ${dk ? 'bg-slate-800' : 'bg-white'} shadow-2xl p-6`} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[20px] font-semibold tracking-tight">Пригласить в доску</h3>
                <p className={`text-[14px] ${dk ? 'text-slate-400' : 'text-black/60'} mt-1`}>Работайте вместе в реальном времени</p>
              </div>
              <button onClick={() => setShowShare(false)} className={`size-8 grid place-items-center rounded-full ${hoverBg} -mr-1 -mt-1`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className={`mt-5 p-3 rounded-2xl ${dk ? 'bg-slate-700' : 'bg-[#F7F7F5]'} border ${borderC}`}>
              <div className={`text-[12px] font-medium ${dk ? 'text-slate-400' : 'text-black/50'} uppercase tracking-wide`}>Ссылка-приглашение</div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className={`flex-1 truncate text-[14px] font-mono ${dk ? 'bg-slate-600' : 'bg-white'} rounded-xl px-3 py-2 border ${borderC}`}>{shareUrl}</div>
                <button onClick={() => { navigator.clipboard.writeText(shareUrl); if ('vibrate' in navigator) navigator.vibrate(10) }}
                  className="h-9 px-3 rounded-xl bg-black text-white text-[13px] font-medium active:scale-95 transition whitespace-nowrap">
                  Копировать
                </button>
              </div>
            </div>

            {/* QR Code */}
            <div className="mt-4 flex justify-center">
              <div className={`p-3 rounded-2xl ${dk ? 'bg-white' : 'bg-white'} shadow-inner`}>
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(shareUrl)}&bgcolor=ffffff&color=000000`}
                  alt="QR Code" width={120} height={120} className="rounded-lg" />
              </div>
            </div>
            <p className={`text-[12px] text-center mt-2 ${dk ? 'text-slate-400' : 'text-black/40'}`}>Отсканируйте QR-код телефоном</p>

            {/* Share buttons */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: 'WhatsApp', color: '#25D366', url: `https://wa.me/?text=${encodeURIComponent('Присоединяйся к доске: ' + shareUrl)}` },
                { label: 'Telegram', color: '#229ED9', url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Присоединяйся к доске!')}` },
                { label: 'Копировать', color: '#000', url: '' },
              ].map(b => (
                <button key={b.label} onClick={() => {
                  if (b.url) window.open(b.url, '_blank')
                  else navigator.clipboard.writeText(shareUrl)
                  if ('vibrate' in navigator) navigator.vibrate(10)
                }} className="h-11 rounded-xl font-medium text-[13px] text-white active:scale-95 transition" style={{ background: b.color }}>
                  {b.label}
                </button>
              ))}
            </div>

            {/* Participants */}
            <div className={`mt-5 pt-5 border-t ${dk ? 'border-slate-600' : 'border-black/5'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium">Кто онлайн</div>
                  <div className={`text-[12px] ${dk ? 'text-slate-400' : 'text-black/55'}`}>{participants} участников</div>
                </div>
                <div className="flex -space-x-2">
                  {cursors.slice(0, 3).map(c => (
                    <div key={c.id} className="size-8 rounded-full grid place-items-center text-[11px] font-bold text-white"
                      style={{ background: c.color, border: `2px solid ${dk ? '#1e293b' : '#fff'}` }}>{c.name[0]}</div>
                  ))}
                  <div className="size-8 rounded-full bg-black grid place-items-center text-[11px] font-bold text-white"
                    style={{ border: `2px solid ${dk ? '#1e293b' : '#fff'}` }}>{user.name[0]}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== ZOOM CONTROLS ===== */}
      <div className="absolute right-3 bottom-[120px] z-20 flex flex-col gap-1.5" data-ui>
        <div className={`flex flex-col rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC} overflow-hidden`}>
          <button onClick={() => setTransform(t => ({ ...t, scale: clamp_scale(t.scale * 1.2) }))}
            className={`size-10 grid place-items-center ${hoverBg} ${textSec}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <div className={`h-px ${dk ? 'bg-slate-600' : 'bg-black/10'}`} />
          <button onClick={() => setTransform(t => ({ ...t, scale: Math.max(t.scale / 1.2, 0.15) }))}
            className={`size-10 grid place-items-center ${hoverBg} ${textSec}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14" /></svg>
          </button>
        </div>
        <div className={`h-8 px-2.5 grid place-items-center rounded-xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC} text-[11px] font-medium ${dk ? 'text-slate-300' : 'text-black/60'} tabular-nums`}>
          {Math.round(transform.scale * 100)}%
        </div>
      </div>

      {/* ===== ELEMENT COUNT ===== */}
      {elements.length > 0 && (
        <div className={`absolute top-[60px] left-3 z-10 h-6 px-2.5 rounded-full ${dk ? 'bg-slate-800/80 border-slate-600' : 'bg-white/80 border-black/5'} border backdrop-blur-sm text-[11px] font-medium ${dk ? 'text-slate-400' : 'text-black/40'} flex items-center gap-1`}>
          {elements.length} элем.
        </div>
      )}

      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        html, body { overscroll-behavior: none; position: fixed; overflow: hidden; width: 100%; height: 100%; }
        ::-webkit-scrollbar { display: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  )
}
