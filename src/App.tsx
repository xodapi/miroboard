import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as Y from 'yjs'
import { clamp_scale, export_bpmn_xml, import_bpmn_xml, run_bpmn, simulate_bpmn_seed_string, snap_to_grid, validate_bpmn } from './wasm/board-core/board_core'
import { commitElementUpdate } from './persistence/updates'
import { useFileDrop } from './hooks/useFileDrop'
import { DropTargetCue } from './components/DropTargetCue'
import { MiniMap } from './components/MiniMap'
import { openDocument, openDroppedDocument, saveDocument, type FileSession, type OpenOutcome } from './persistence/files'
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog'
import { SimulationModal } from './components/SimulationModal'
import { addBeforeUnloadGuard, createDirtyTracker, RECOVERY_ORIGIN, type DirtyTracker } from './persistence/dirty'
import { captureSnapshot, HISTORY_RESTORE_ORIGIN } from './history/snapshots'
import { createCaptureTriggers, type CaptureTriggers } from './history/capture-triggers'
import { attachRecoveryCache } from './persistence/indexeddb'
import { adoptLegacyRooms, legacyDocumentIdFromCurrentUrl } from './persistence/legacy-adoption'
import { bpmnSimulationFromProfileConfig, DEFAULT_BPMN_SIMULATION, withBpmnSimulation } from './format/profile-config'
import { deserialise, serialise } from './format/mboard'
import type { DocHistory, DocMeta, HistorySnapshot, ProfileConfig } from './format/types'
import basicFixedExample from '../examples/basic-fixed.json'
import parallelQueueExample from '../examples/parallel-queue.json'
import slaCalendarExample from '../examples/sla-calendar.json'
import batchWorkloadExample from '../examples/batch-workload.json'
import priorityQueueExample from '../examples/priority-queue.json'
import fifoPriorityExample from '../examples/fifo-vs-priority.json'
declare global {
  interface Window {
    __MIROBOARD_DEBUG__?: { version: string; createBpmnModel: () => unknown; validateBpmn: () => unknown; exportBpmnXml: () => string; runBpmn: () => unknown; simulateBpmn: (seed: number | string | bigint, runs: number) => BpmnSimulationResult; getElements: () => BoardElement[] }
  }
}
type Point = { x: number; y: number }
type Tool = 'select' | 'pan' | 'pen' | 'marker' | 'eraser' | 'sticky' | 'text' | 'rect' | 'circle' | 'arrow' | 'line' | 'laser' | 'emoji' | 'bpmnStart' | 'bpmnTask' | 'bpmnEnd' | 'bpmnGateway' | 'bpmnParallel' | 'bpmnSequence'
type BpmnNodeType = 'startEvent' | 'endEvent' | 'task' | 'xorGateway' | 'andGateway' | 'orGateway'
type WorkspaceMode = 'board' | 'bpmn' | 'simulation'
const GITHUB_REPOSITORY = 'https://github.com/xodapi/miroboard'
declare const __MIROBOARD_VERSION__: string
declare const __MIROBOARD_HISTORY__: { commit: string; date: string; title: string; release?: string }[]
declare const __MIROBOARD_DEBUG_HOOK__: boolean
const PROJECT_HISTORY = __MIROBOARD_HISTORY__
type ImportedBpmnModel = {
  nodes: { id: string; type: string; name?: string; x?: number; y?: number; width?: number; height?: number; durationMs?: number; durationDistribution?: 'fixed' | 'uniform' | 'triangular'; durationMinMs?: number; durationModeMs?: number; durationMaxMs?: number; resourceRole?: string; costPerHour?: number; resourceCapacity?: number; priority?: number }[]
  flows: { id: string; sourceId: string; targetId: string; flowType?: 'sequence' | 'message'; condition?: string; probability?: number; isDefault?: boolean }[]
  arrivalClasses?: { count: number; intervalMs: number; priority: number }[]
  resourceRoles?: { name: string; capacity: number; queuePolicy?: QueuePolicy }[]
}
type QueuePolicy = 'fifo' | 'priority'
type ArrivalClassDraft = { count: string; intervalSec: string; priority: string }
type RolePolicyDraft = { capacity: string; queuePolicy: QueuePolicy }
type BpmnSimulationResult = {
  seed: number; runs: number; completedRuns: number; simulationInstances: number; arrivalIntervalMs: number
  minDurationMs: number; meanDurationMs: number; standardDeviationMs: number
  p50DurationMs: number; p90DurationMs: number; p95DurationMs: number; maxDurationMs: number; meanCost: number
  slaTargetMs?: number; onTimeRate?: number; roleUtilization: { role: string; capacity: number; meanWorkloadMs: number; meanWaitingMs: number; utilization: number }[]; priorityClasses: { priority: number; instances: number; meanWaitingMs: number; meanDurationMs: number }[]
}
type EducationalExample = { title: string; explanation: string; checks: string[]; model: ImportedBpmnModel }
const EDUCATIONAL_EXAMPLES = [basicFixedExample, parallelQueueExample, slaCalendarExample, batchWorkloadExample, priorityQueueExample, fifoPriorityExample] as unknown as EducationalExample[]
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
  bpmnDurationDistribution?: 'fixed' | 'uniform' | 'triangular'
  bpmnDurationMinMs?: number
  bpmnDurationModeMs?: number
  bpmnDurationMaxMs?: number
  bpmnResourceRole?: string
  bpmnCostPerHour?: number
  bpmnResourceCapacity?: number
  bpmnPriority?: number
  bpmnFlow?: { sourceId: string; targetId: string; flowType?: 'sequence' | 'message'; condition?: string; probability?: number; isDefault?: boolean }
}
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
const EMOJIS = ['👍', '❤️', '⭐', '🔥', '💡', '✅', '❌', '🎯', '📌', '❓', '💪', '🎉', '🚀', '💯', '⚡', '🏆', '👀', '🤔', '💬', '🧠']
type ContextMenuAction = 'edit' | 'duplicate' | 'front' | 'back' | 'delete'
type PendingOpen = { proceed: () => Promise<void> }
const CONTEXT_MENU_ITEMS: { label: string; action: ContextMenuAction; danger?: boolean }[] = [
  { label: '✏️ Редактировать', action: 'edit' },
  { label: '📋 Дублировать', action: 'duplicate' },
  { label: '⬆️ На передний план', action: 'front' },
  { label: '⬇️ На задний план', action: 'back' },
  { label: '🗑️ Удалить', action: 'delete', danger: true },
]
function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, 16)
  }
  // Final fallback (should never reach in modern browsers)
  return Math.random().toString(36).slice(2, 9) + Math.random().toString(36).slice(2, 9)
}
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
export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [bpmnFlowSourceId, setBpmnFlowSourceId] = useState<string | null>(null)
  const [color, setColor] = useState('#000000')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [elements, setElements] = useState<BoardElement[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<Point | null>(null)
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showLearningModules, setShowLearningModules] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('board')
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' | 'info' } | null>(null)
  const [tourStep, setTourStep] = useState(() => {
    try { return localStorage.getItem('miro-onboarding-seen') ? -1 : 0 } catch { return -1 }
  })
  const [showProjectHistory, setShowProjectHistory] = useState(false)
  const [showSimulationPanel, setShowSimulationPanel] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [fileSession, setFileSession] = useState<FileSession>({ handle: null, name: null, isUntitled: true })
  const [isDirty, setIsDirty] = useState(false)
  const [historySnapshots, setHistorySnapshots] = useState<HistorySnapshot[]>([])
  const [pendingOpen, setPendingOpen] = useState<PendingOpen | null>(null)
  const [showBpmnPalette, setShowBpmnPalette] = useState(false)
  const [flowPreviewPoint, setFlowPreviewPoint] = useState<Point | null>(null)
  const [activeBpmnTokenId, setActiveBpmnTokenId] = useState<string | null>(null)
  const [bpmnRunSummary, setBpmnRunSummary] = useState<string | null>(null)
  const [bpmnSimulationSummary, setBpmnSimulationSummary] = useState<string | null>(null)
  const [bpmnSimulationResult, setBpmnSimulationResult] = useState<BpmnSimulationResult | null>(null)
  const [bottleneckRole, setBottleneckRole] = useState<string | null>(null)
  const [simulationResultFingerprint, setSimulationResultFingerprint] = useState<string | null>(null)
  const [simulationSeed, setSimulationSeed] = useState('42')
  const [simulationRuns, setSimulationRuns] = useState('500')
  const [simulationTarget, setSimulationTarget] = useState('')
  const [simulationInstances, setSimulationInstances] = useState('1')
  const [arrivalInterval, setArrivalInterval] = useState('0')
  const [arrivalClasses, setArrivalClasses] = useState<ArrivalClassDraft[]>([])
  const [rolePolicies, setRolePolicies] = useState<Record<string, RolePolicyDraft>>({})
  const [calendarStart, setCalendarStart] = useState('')
  const [calendarEnd, setCalendarEnd] = useState('')
  const [bpmnProfileActive, setBpmnProfileActive] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [selectedEmoji, setSelectedEmoji] = useState('👍')
  const [snapGrid, setSnapGrid] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  // Mirrors the UndoManager stacks. Kept in state so the toolbar buttons do not
  // read the manager ref while rendering.
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false })
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [laserPos, setLaserPos] = useState<Point | null>(null)
  const chooseTool = useCallback((nextTool: Tool) => {
    setTool(nextTool)
    if (nextTool !== 'bpmnSequence') {
      setBpmnFlowSourceId(null)
      setFlowPreviewPoint(null)
    }
  }, [])
  // Drag state
  const [dragInfo, setDragInfo] = useState<{
    id: string; startX: number; startY: number; elStartX: number; elStartY: number
  } | null>(null)
  // Resize state
  const [resizeInfo, setResizeInfo] = useState<{
    id: string; corner: string; startX: number; startY: number;
    elX: number; elY: number; elW: number; elH: number
  } | null>(null)
  // Gesture frames stay local until pointer-up, preventing one Yjs item rewrite
  // (and one gc:false tombstone) per pointer event.
  const [transientFrame, setTransientFrame] = useState<{ id: string; updates: Partial<BoardElement> } | null>(null)
  const transientFrameRef = useRef<{ id: string; updates: Partial<BoardElement> } | null>(null)
  // Long press
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const bpmnImportRef = useRef<HTMLInputElement>(null)
  const bpmnRunTimersRef = useRef<number[]>([])
  // Yjs
  const ydoc = useMemo(() => new Y.Doc({ gc: false }), [])
  const yElements = useRef<Y.Array<BoardElement> | null>(null)
  const dirtyTrackerRef = useRef<DirtyTracker | null>(null)
  const captureTriggersRef = useRef<CaptureTriggers | null>(null)
  const historySnapshotsRef = useRef<HistorySnapshot[]>([])
  const undoManagerRef = useRef<Y.UndoManager | null>(null)
  const profileConfigRef = useRef<Y.Map<unknown> | null>(null)
  const profileConfigJsonRef = useRef('')
  const showToast = useCallback((message: string, tone: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 4200)
  }, [])
  const appendCheckpoint = useCallback((kind: HistorySnapshot['kind'], label?: string, at?: string) => {
    const checkpoint = captureSnapshot(ydoc, kind, label, at)
    historySnapshotsRef.current = [...historySnapshotsRef.current, checkpoint]
    setHistorySnapshots(historySnapshotsRef.current)
    return checkpoint
  }, [ydoc])
  const markCurrentState = useCallback(() => {
    const label = window.prompt('Название состояния')
    if (label === null) return
    if (!label.trim()) {
      showToast('Введите непустое название состояния', 'error')
      return
    }
    captureTriggersRef.current?.captureNow('named', label)
    showToast('Состояние отмечено', 'success')
  }, [showToast])
  const finishTour = useCallback(() => {
    try { localStorage.setItem('miro-onboarding-seen', '1') } catch { /* onboarding is optional */ }
    setTourStep(-1)
  }, [])
  const createBpmnModel = useCallback(() => {
    const nodes = elements
      .filter((element) => element.bpmnNodeType)
      .map((element) => ({
        id: element.id,
        type: element.bpmnNodeType,
        poolId: 'default',
        name: element.text,
        durationMs: element.bpmnDurationMs,
        durationDistribution: element.bpmnDurationDistribution,
        durationMinMs: element.bpmnDurationMinMs,
        durationModeMs: element.bpmnDurationModeMs,
        durationMaxMs: element.bpmnDurationMaxMs,
        resourceRole: element.bpmnResourceRole,
        costPerHour: element.bpmnCostPerHour,
        resourceCapacity: element.bpmnResourceCapacity,
        priority: element.bpmnPriority,
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
    // Only emit roles the user actually configured. An empty list keeps the
    // engine on the per-node `resourceCapacity` fallback, so untouched boards
    // simulate exactly as before.
    const resourceRoles = Object.entries(rolePolicies)
      .filter(([name]) => nodes.some((node) => node.resourceRole === name))
      .map(([name, policy]) => ({
        name,
        capacity: Math.max(1, Number(policy.capacity) || 1),
        queuePolicy: policy.queuePolicy,
      }))
    return {
      nodes,
      flows,
      slaTargetMs: simulationTarget ? Number(simulationTarget) * 1000 : undefined,
      calendarWorkStartMs: calendarStart ? Number(calendarStart) * 3_600_000 : undefined,
      calendarWorkEndMs: calendarEnd ? Number(calendarEnd) * 3_600_000 : undefined,
      simulationInstances: Number(simulationInstances) || 1,
      arrivalIntervalMs: Math.max(0, Number(arrivalInterval) || 0) * 1000,
      arrivalClasses: arrivalClasses.map((arrivalClass) => ({
        count: Math.max(1, Number(arrivalClass.count) || 1),
        intervalMs: Math.max(0, Number(arrivalClass.intervalSec) || 0) * 1000,
        priority: Number(arrivalClass.priority) || 0,
      })),
      resourceRoles,
    }
  }, [elements, simulationTarget, calendarStart, calendarEnd, simulationInstances, arrivalInterval, arrivalClasses, rolePolicies])
  const createSimulationBpmnModel = useCallback(() => {
    const model = createBpmnModel()
    return {
      ...model,
      // The simulation engine executes control flow only. Keep this
      // normalization at its execution boundary so validation and XML export
      // retain the persisted BPMN flow type.
      flows: model.flows.map((flow) => ({
        ...flow,
        flowType: flow.flowType === 'message' ? 'sequence' : flow.flowType,
      })),
    }
  }, [createBpmnModel])
  // A simulation result describes one immutable model/configuration snapshot.
  // Keeping the fingerprint with the result lets rendering discard stale values
  // immediately after an edit, without scheduling synchronous state updates from
  // an effect.
  const simulationFingerprint = useMemo(
    () => JSON.stringify({ model: createSimulationBpmnModel(), seed: simulationSeed, runs: simulationRuns }),
    [createSimulationBpmnModel, simulationSeed, simulationRuns],
  )
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
  // Roles that actually appear on the canvas, with the inline capacity that the
  // engine would use if no explicit role policy is configured.
  const detectedRoles = useMemo(() => {
    const roles = new Map<string, number>()
    for (const element of elements) {
      const role = element.bpmnResourceRole?.trim()
      if (!role) continue
      roles.set(role, Math.max(roles.get(role) ?? 1, element.bpmnResourceCapacity ?? 1))
    }
    return [...roles.entries()].sort(([left], [right]) => left.localeCompare(right))
  }, [elements])
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
    const saved = localStorage.getItem('miro-author-id')
    if (saved) return { id: saved }
    const id = genId()
    try { localStorage.setItem('miro-author-id', id) } catch { /* author id is optional metadata */ }
    return { id }
  }, [])
  useEffect(() => {
    const yarray = ydoc.getArray<BoardElement>('elements')
    const meta = ydoc.getMap<unknown>('meta')
    const profileConfig = ydoc.getMap<unknown>('profileConfig')
    yElements.current = yarray
    dirtyTrackerRef.current = createDirtyTracker(ydoc, setIsDirty)
    captureTriggersRef.current = createCaptureTriggers({
      ydoc,
      capture: appendCheckpoint,
      ignoredOrigins: new Set([RECOVERY_ORIGIN, HISTORY_RESTORE_ORIGIN]),
    })
    profileConfigRef.current = profileConfig
    if (!meta.has('id')) {
      ydoc.transact(() => {
        meta.set('id', legacyDocumentIdFromCurrentUrl() ?? `doc_${genId()}`)
        meta.set('createdAt', new Date().toISOString())
      }, RECOVERY_ORIGIN)
    }
    const applyProfileConfig = () => {
      const config = profileConfig.toJSON() as ProfileConfig
      profileConfigJsonRef.current = JSON.stringify(config)
      const simulation = bpmnSimulationFromProfileConfig(config)
      setBpmnProfileActive(simulation !== null)
      if (!simulation) {
        setWorkspaceMode('board')
        setShowSimulationPanel(false)
        return
      }
      setSimulationSeed(simulation.seed)
      setSimulationRuns(simulation.runs)
      setSimulationTarget(simulation.slaTargetSec)
      setSimulationInstances(simulation.instances)
      setArrivalInterval(simulation.arrivalIntervalSec)
      setArrivalClasses(simulation.arrivalClasses)
      setRolePolicies(simulation.rolePolicies)
      setCalendarStart(simulation.calendarStartHour)
      setCalendarEnd(simulation.calendarEndHour)
    }
    profileConfig.observe(applyProfileConfig)
    applyProfileConfig()
    // UndoManager
    const undoManager = new Y.UndoManager(yarray, {
      captureTimeout: 500,
      trackedOrigins: new Set([null, HISTORY_RESTORE_ORIGIN]),
    })
    undoManagerRef.current = undoManager
    const updateUndoState = () => setUndoState({
      canUndo: undoManager.undoStack.length > 0,
      canRedo: undoManager.redoStack.length > 0,
    })
    undoManager.on('stack-item-added', updateUndoState)
    undoManager.on('stack-item-popped', updateUndoState)
    undoManager.on('stack-item-updated', updateUndoState)
    // IndexedDB is an optional crash-recovery cache. Awaiting sync ensures the
    // initial empty state is distinguishable from a document still loading.
    let persistence: Awaited<ReturnType<typeof attachRecoveryCache>>['persistence'] = null
    let disposed = false
    const attachPersistence = async () => {
      const id = meta.get('id')
      if (typeof id !== 'string') return
      // Copy old room-keyed recovery caches before attaching this document's
      // cache. Adoption is fail-soft and runs after first paint in this effect.
      await adoptLegacyRooms()
      if (disposed) return
      const result = await attachRecoveryCache(id, ydoc)
      if (disposed) {
        result.persistence?.destroy()
        return
      }
      persistence = result.persistence
    }
    void attachPersistence()
    // Sync
    const updateElements = () => setElements(yarray.toArray())
    yarray.observe(updateElements)
    updateElements()
    return () => {
      disposed = true
      dirtyTrackerRef.current?.dispose(); dirtyTrackerRef.current = null
      captureTriggersRef.current?.dispose(); captureTriggersRef.current = null
      yarray.unobserve(updateElements)
      profileConfig.unobserve(applyProfileConfig)
      profileConfigRef.current = null
      undoManager.off('stack-item-added', updateUndoState)
      undoManager.off('stack-item-popped', updateUndoState)
      undoManager.off('stack-item-updated', updateUndoState)
      persistence?.destroy()
      ydoc.destroy()
    }
  }, [appendCheckpoint, ydoc])
  useEffect(() => {
    return addBeforeUnloadGuard(isDirty)
  }, [isDirty])
  const simulationProfile = useMemo(() => ({
    ...DEFAULT_BPMN_SIMULATION,
    seed: simulationSeed,
    runs: simulationRuns,
    slaTargetSec: simulationTarget,
    instances: simulationInstances,
    arrivalIntervalSec: arrivalInterval,
    calendarStartHour: calendarStart,
    calendarEndHour: calendarEnd,
    arrivalClasses,
    rolePolicies,
  }), [simulationSeed, simulationRuns, simulationTarget, simulationInstances, arrivalInterval, calendarStart, calendarEnd, arrivalClasses, rolePolicies])
  useEffect(() => {
    if (!bpmnProfileActive || !profileConfigRef.current) return
    const config = withBpmnSimulation({}, simulationProfile)
    const encoded = JSON.stringify(config)
    if (encoded === profileConfigJsonRef.current) return
    profileConfigJsonRef.current = encoded
    ydoc.transact(() => profileConfigRef.current!.set('bpmn', config.bpmn))
  }, [bpmnProfileActive, simulationProfile, ydoc])
  const activateBpmnProfile = useCallback(() => {
    if (profileConfigRef.current && !bpmnProfileActive) {
      const config = withBpmnSimulation({}, DEFAULT_BPMN_SIMULATION)
      profileConfigJsonRef.current = JSON.stringify(config)
      ydoc.transact(() => profileConfigRef.current!.set('bpmn', config.bpmn))
      setSimulationSeed(DEFAULT_BPMN_SIMULATION.seed)
      setSimulationRuns(DEFAULT_BPMN_SIMULATION.runs)
      setSimulationTarget(DEFAULT_BPMN_SIMULATION.slaTargetSec)
      setSimulationInstances(DEFAULT_BPMN_SIMULATION.instances)
      setArrivalInterval(DEFAULT_BPMN_SIMULATION.arrivalIntervalSec)
      setArrivalClasses(DEFAULT_BPMN_SIMULATION.arrivalClasses)
      setRolePolicies(DEFAULT_BPMN_SIMULATION.rolePolicies)
      setCalendarStart(DEFAULT_BPMN_SIMULATION.calendarStartHour)
      setCalendarEnd(DEFAULT_BPMN_SIMULATION.calendarEndHour)
    }
    setBpmnProfileActive(true)
    setWorkspaceMode('bpmn')
    setShowBpmnPalette(true)
  }, [bpmnProfileActive, ydoc])
  const saveBoard = useCallback(async (mode: 'save' | 'saveAs'): Promise<boolean> => {
    const metaMap = ydoc.getMap<unknown>('meta')
    const metaId = metaMap.get('id')
    const metaTitle = metaMap.get('title')
    const metaCreatedAt = metaMap.get('createdAt')
    const now = new Date().toISOString()
    // The checkpoint is captured before serialisation, so the saved timeline's
    // newest entry is precisely the state that was written to disk.
    captureTriggersRef.current?.captureNow('auto', undefined, now)
    const meta: DocMeta = {
      id: typeof metaId === 'string' ? metaId : `doc_${genId()}`,
      title: typeof metaTitle === 'string' ? metaTitle : 'Untitled board',
      createdAt: typeof metaCreatedAt === 'string' ? metaCreatedAt : now,
      updatedAt: now,
      createdWith: { version: __MIROBOARD_VERSION__, commit: PROJECT_HISTORY[0]?.commit ?? 'local' },
      profiles: [],
    }
    const history: DocHistory = {
      yjsState: null,
      snapshots: historySnapshotsRef.current,
      retention: { keepAllNamed: true, keepLastAuto: 20, decayBucketsHours: [1, 6, 24, 168], maxSnapshots: 120, maxHistoryRatio: 3 },
    }
    const file = serialise({
      elements: yElements.current?.toArray() ?? elements,
      meta,
      profileConfig: (profileConfigRef.current?.toJSON() ?? {}) as ProfileConfig,
      history,
    })
    const outcome = await saveDocument(file, fileSession, mode)
    if (outcome.kind === 'saved') {
      setFileSession(outcome.session)
      ydoc.transact(() => {
        metaMap.set('title', file.meta.title)
        metaMap.set('updatedAt', now)
      })
      dirtyTrackerRef.current?.markSaved()
      showToast('Документ сохранён', 'success')
      return true
    } else if (outcome.kind === 'cancelled') {
      showToast('Сохранение отменено', 'info')
    } else if (outcome.kind === 'failed') {
      showToast('Не удалось сохранить документ. Проверьте доступ к файлу.', 'error')
    }
    return false
  }, [elements, fileSession, showToast, ydoc])
  const resetDocument = useCallback(() => {
    if (isDirty && !window.confirm('Несохраненные изменения будут потеряны. Продолжить?')) return
    const meta = ydoc.getMap<unknown>('meta')
    const profileConfig = ydoc.getMap<unknown>('profileConfig')
    ydoc.transact(() => {
      yElements.current?.delete(0, yElements.current.length)
      meta.clear()
      meta.set('id', `doc_${genId()}`)
      meta.set('createdAt', new Date().toISOString())
      profileConfig.clear()
    }, RECOVERY_ORIGIN)
    setFileSession({ handle: null, name: null, isUntitled: true })
    historySnapshotsRef.current = []
    setHistorySnapshots([])
    setSelectedId(null)
    setWorkspaceMode('board')
    setBpmnProfileActive(false)
    dirtyTrackerRef.current?.markSaved()
    showToast('Создан новый документ', 'success')
  }, [isDirty, showToast, ydoc])
  const applyOpenOutcome = useCallback((outcome: Extract<OpenOutcome, { kind: 'opened' }>) => {
    const loaded = deserialise(outcome.file)
    const meta = ydoc.getMap<unknown>('meta')
    const profileConfig = ydoc.getMap<unknown>('profileConfig')
    ydoc.transact(() => {
      yElements.current?.delete(0, yElements.current.length)
      if (loaded.elements.length) yElements.current?.push(loaded.elements)
      meta.clear()
      Object.entries(loaded.meta).forEach(([key, value]) => meta.set(key, value))
      profileConfig.clear()
      Object.entries(loaded.profileConfig).forEach(([key, value]) => profileConfig.set(key, value))
    }, RECOVERY_ORIGIN)
    setFileSession(outcome.session)
    historySnapshotsRef.current = loaded.history.snapshots
    setHistorySnapshots(loaded.history.snapshots)
    setSelectedId(null)
    dirtyTrackerRef.current?.markSaved()
    showToast(
      outcome.migratedFrom === undefined
        ? `Открыт документ «${outcome.session.name}»`
        : `Открыт документ «${outcome.session.name}». Схема обновлена с v${outcome.migratedFrom} до v1`,
      'success',
    )
  }, [showToast, ydoc])
  const showOpenFailure = useCallback((outcome: Extract<OpenOutcome, { kind: 'failed' }>) => {
    const message = outcome.failure.kind === 'empty'
      ? 'Файл пуст. Выберите непустой документ .mboard'
      : outcome.failure.kind === 'parse-error'
        ? 'Не удалось разобрать JSON документа .mboard'
        : outcome.failure.kind === 'too-new'
          ? `Документ использует более новую схему v${outcome.failure.found}, поддерживается v${outcome.failure.supported}`
          : outcome.failure.kind === 'not-mboard'
            ? 'Файл не является документом .mboard'
            : `Недопустимый документ .mboard: ${outcome.failure.errors[0] ?? 'неизвестная ошибка'}`
    showToast(message, 'error')
  }, [showToast])
  const requestOpen = useCallback(async (proceed: () => Promise<void>) => {
    if (isDirty) setPendingOpen({ proceed })
    else await proceed()
  }, [isDirty])
  const openBoard = useCallback(async () => {
    await requestOpen(async () => {
      const outcome = await openDocument()
      if (outcome.kind === 'opened') applyOpenOutcome(outcome)
      else if (outcome.kind === 'failed') showOpenFailure(outcome)
    })
  }, [applyOpenOutcome, requestOpen, showOpenFailure])
  const loadDroppedBoard = useCallback(async (transfer: DataTransfer) => {
    const outcome = await openDroppedDocument(transfer)
    if (outcome.kind === 'cancelled') return
    if (outcome.kind === 'failed') {
      if (outcome.failure.kind === 'not-mboard') showToast('Поддерживаются только документы .mboard', 'error')
      else showOpenFailure(outcome)
      return
    }
    await requestOpen(async () => {
      applyOpenOutcome(outcome)
      if (outcome.ignoredFileCount) showToast(`Открыт первый .mboard, ещё файлов проигнорировано: ${outcome.ignoredFileCount}`, 'success')
    })
  }, [applyOpenOutcome, requestOpen, showOpenFailure, showToast])
  const { isDropTarget, onDragEnter, onDragOver, onDragLeave, onCanvasDrop } = useFileDrop(loadDroppedBoard)

  // ======================== HELPERS ========================

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
    commitElementUpdate(ydoc, yElements.current, id, updates)
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
      if (idx === yElements.current.length - 1) return
      const el = yElements.current.get(idx)
      const zIndex = Date.now()
      ydoc.transact(() => {
        yElements.current!.delete(idx, 1)
        yElements.current!.push([{ ...el, zIndex }])
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

  const handleContextMenuAction = useCallback((action: ContextMenuAction, id: string) => {
    if (action === 'edit') {
      const element = elements.find(candidate => candidate.id === id)
      if (element) {
        setEditingText(element.id)
        setEditValue(element.text || '')
      }
    } else if (action === 'duplicate') {
      duplicateElement(id)
    } else if (action === 'front') {
      bringToFront(id)
    } else if (action === 'back') {
      sendToBack(id)
    } else {
      deleteElement(id)
    }
    setContextMenu(null)
  }, [elements, duplicateElement, bringToFront, sendToBack, deleteElement])

  const { canUndo, canRedo } = undoState

  const handleUndo = useCallback(() => {
    undoManagerRef.current?.undo()
  }, [])

  const handleRedo = useCallback(() => {
    undoManagerRef.current?.redo()
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
          a.download = 'board.png'
          a.click()
        }
      }, 'image/png')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }, [elements.length])

  const exportToBpmn = useCallback(() => {
    try {
      const xml = export_bpmn_xml(JSON.stringify(createBpmnModel()))
      const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'miroboard.bpmn'
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'BPMN-модель нельзя экспортировать.', 'error')
    }
  }, [createBpmnModel, showToast])

  const runBpmn = useCallback(() => {
    bpmnRunTimersRef.current.forEach(window.clearTimeout)
    bpmnRunTimersRef.current = []
    try {
      const result = JSON.parse(run_bpmn(JSON.stringify(createSimulationBpmnModel()))) as {
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
      showToast(error instanceof Error ? error.message : 'Не удалось запустить BPMN-модель.', 'error')
    }
  }, [createSimulationBpmnModel, showToast])

  const simulateBpmn = useCallback(() => {
    try {
      const runs = Number(simulationRuns)
      if (!Number.isInteger(runs) || runs < 1 || runs > 10000) throw new Error('Количество прогонов должно быть целым числом от 1 до 10000.')
      const result = JSON.parse(simulate_bpmn_seed_string(JSON.stringify(createSimulationBpmnModel()), simulationSeed, runs)) as BpmnSimulationResult
      const seconds = (value: number) => `${(value / 1000).toFixed(1)}с`
      setBpmnSimulationResult(result)
      setBottleneckRole(result.roleUtilization[0]?.role ?? null)
      setBpmnSimulationSummary(`MC ${result.runs}: P50 ${seconds(result.p50DurationMs)} · P90 ${seconds(result.p90DurationMs)} · P95 ${seconds(result.p95DurationMs)}`)
      setSimulationResultFingerprint(simulationFingerprint)
    } catch (error) {
      setBpmnSimulationSummary(null)
      setBottleneckRole(null)
      setSimulationResultFingerprint(null)
      showToast(error instanceof Error ? error.message : 'Не удалось запустить BPMN-симуляцию.', 'error')
    }
  }, [createSimulationBpmnModel, simulationFingerprint, simulationRuns, simulationSeed, showToast])
  const visibleSimulationResult = simulationResultFingerprint === simulationFingerprint ? bpmnSimulationResult : null
  const visibleSimulationSummary = simulationResultFingerprint === simulationFingerprint ? bpmnSimulationSummary : null
  const visibleBottleneckRole = simulationResultFingerprint === simulationFingerprint ? bottleneckRole : null

  useEffect(() => {
    if (!__MIROBOARD_DEBUG_HOOK__) return
    window.__MIROBOARD_DEBUG__ = {
      version: __MIROBOARD_VERSION__,
      createBpmnModel,
      validateBpmn: () => JSON.parse(validate_bpmn(JSON.stringify(createBpmnModel()))),
      exportBpmnXml: () => export_bpmn_xml(JSON.stringify(createBpmnModel())),
      runBpmn: () => JSON.parse(run_bpmn(JSON.stringify(createSimulationBpmnModel()))),
      simulateBpmn: (seed, runs) => JSON.parse(simulate_bpmn_seed_string(JSON.stringify(createSimulationBpmnModel()), String(seed), runs)) as BpmnSimulationResult,
      getElements: () => elements.map((element) => ({ ...element, points: element.points?.map((point) => ({ ...point })), bpmnFlow: element.bpmnFlow && { ...element.bpmnFlow } })),
    }
    return () => { delete window.__MIROBOARD_DEBUG__ }
  }, [createBpmnModel, createSimulationBpmnModel, elements])

  const importFromBpmn = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !yElements.current) return

    try {
      const imported = JSON.parse(import_bpmn_xml(await file.text())) as ImportedBpmnModel
      if (!Array.isArray(imported.nodes) || !Array.isArray(imported.flows)) throw new Error('BPMN import returned an invalid model.')
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

      const replacement: BoardElement[] = [...nodeById.values()]
      for (const flow of imported.flows) {
          if (!nodeById.has(flow.sourceId) || !nodeById.has(flow.targetId)) continue
          replacement.push({
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
          })
      }
      ydoc.transact(() => {
        if (yElements.current!.length) yElements.current!.delete(0, yElements.current!.length)
        yElements.current!.push(replacement)
      })
      setSelectedId(null)
      setTransform({ x: 0, y: 0, scale: 1 })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось импортировать BPMN-файл.', 'error')
    } finally {
      event.target.value = ''
    }
  }, [user.id, ydoc, showToast])

  const loadEducationalExample = useCallback((example: EducationalExample) => {
    if (!yElements.current) return
    const colorForType = (type: BpmnNodeType) => ({
      startEvent: '#6BCB77', endEvent: '#FF5D5D', task: '#4D96FF',
      xorGateway: '#FFB020', andGateway: '#FFB020', orGateway: '#FFB020',
    }[type])
    const normalizeType = (type: string): BpmnNodeType => ['startEvent', 'endEvent', 'xorGateway', 'andGateway', 'orGateway'].includes(type) ? type as BpmnNodeType : 'task'
    ydoc.transact(() => {
      while (yElements.current!.length) yElements.current!.delete(0, 1)
      for (const node of example.model.nodes) {
        const type = normalizeType(node.type)
        const color = colorForType(type)
        yElements.current!.push([{
          id: node.id, type: 'sticky', x: node.x ?? 100, y: node.y ?? 100, w: node.width ?? (type === 'task' ? 176 : 78), h: node.height ?? (type === 'task' ? 76 : 78),
          text: node.name || (type === 'task' ? 'Задача' : ''), color, fill: color, createdBy: user.id, bpmnNodeType: type,
          bpmnDurationMs: node.durationMs, bpmnDurationDistribution: node.durationDistribution, bpmnDurationMinMs: node.durationMinMs, bpmnDurationModeMs: node.durationModeMs, bpmnDurationMaxMs: node.durationMaxMs,
          bpmnResourceRole: node.resourceRole, bpmnCostPerHour: node.costPerHour, bpmnResourceCapacity: node.resourceCapacity,
          bpmnPriority: node.priority,
        }])
      }
      for (const flow of example.model.flows) yElements.current!.push([{
        id: flow.id, type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: user.id,
        bpmnFlow: { sourceId: flow.sourceId, targetId: flow.targetId, flowType: flow.flowType || 'sequence', condition: flow.condition, probability: flow.probability, isDefault: flow.isDefault },
      }])
    })
    // Load arrival classes if provided
    if (example.model.arrivalClasses) {
      setArrivalClasses(
        example.model.arrivalClasses.map((ac) => ({
          count: String(ac.count),
          intervalSec: String(ac.intervalMs / 1000),
          priority: String(ac.priority),
        }))
      )
    } else {
      setArrivalClasses([])
    }
    // Load role policies if provided
    if (example.model.resourceRoles) {
      const policies: Record<string, RolePolicyDraft> = {}
      for (const role of example.model.resourceRoles) {
        policies[role.name] = {
          capacity: String(role.capacity),
          queuePolicy: role.queuePolicy ?? 'fifo',
        }
      }
      setRolePolicies(policies)
    } else {
      setRolePolicies({})
    }
    setSelectedId(null)
    setTransform({ x: 0, y: 0, scale: 1 })
    showToast(`Загружен модуль: ${example.title}. Откройте Симуляцию для проверки.`, 'success')
  }, [user.id, ydoc, showToast])

  // ======================== POINTER HANDLERS ========================
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as Element
    if (target.closest('[data-ui]')) return
    e.preventDefault()
    setContextMenu(null)
    setShowTemplates(false)
    setShowMore(false)

    const point = screenToWorld(e.clientX, e.clientY)
    console.log('[BPMN diagnostic] canvas pointerdown before placement', JSON.stringify({
      tool,
      point,
      paletteVisible: showBpmnPalette,
    }))
    if (e.pointerType === 'touch' && e.isPrimary === false) return

    // Two fingers = pan
    if ('touches' in e.nativeEvent && (e.nativeEvent as unknown as TouchEvent).touches?.length === 2) {
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
        setFlowPreviewPoint({ x: targetNode.x + (targetNode.w || 0) / 2, y: targetNode.y + (targetNode.h || 0) / 2 })
        showToast('Источник выбран. Теперь выберите целевой BPMN-узел.', 'info')
        return
      }

      const sourceNode = elements.find(element => element.id === bpmnFlowSourceId && element.bpmnNodeType)
      if (!sourceNode || sourceNode.id === targetNode.id) {
        setBpmnFlowSourceId(null)
        setFlowPreviewPoint(null)
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
      setFlowPreviewPoint(null)
      setSelectedId(flowId)
      chooseTool('select')
      showToast('Sequence flow создан.', 'success')
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
      chooseTool('select')
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
      chooseTool('select')
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
  }, [tool, screenToWorld, transform, color, strokeWidth, addElement, deleteElement, user.id, selectedId, elements, selectedEmoji, bpmnFlowSourceId, setBpmnFlowSourceId, showToast, chooseTool, showBpmnPalette])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const point = screenToWorld(e.clientX, e.clientY)
    const isLaser = tool === 'laser'
    if (isLaser) setLaserPos(point)
    if (tool === 'bpmnSequence' && bpmnFlowSourceId) setFlowPreviewPoint(point)

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
      const frame = { id: resizeInfo.id, updates: { x: newX, y: newY, w: newW, h: newH } }
      transientFrameRef.current = frame
      setTransientFrame(frame)
      return
    }

    // Drag
    if (dragInfo) {
      let newX = dragInfo.elStartX + (point.x - dragInfo.startX)
      let newY = dragInfo.elStartY + (point.y - dragInfo.startY)
      if (snapGrid) { newX = snapVal(newX); newY = snapVal(newY) }
      const frame = { id: dragInfo.id, updates: { x: newX, y: newY } }
      transientFrameRef.current = frame
      setTransientFrame(frame)
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
  }, [isPanning, panStart, isDrawing, tool, selectedId, elements, screenToWorld, updateElement, dragInfo, resizeInfo, snapGrid, bpmnFlowSourceId])

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
    const frame = transientFrameRef.current
    if (frame) updateElement(frame.id, frame.updates)
    transientFrameRef.current = null
    setTransientFrame(null)
    setIsDrawing(false)
    setCurrentPath([])
    setIsPanning(false)
    setPanStart(null)
    setLastPinchDist(null)
    setDragInfo(null)
    setResizeInfo(null)
  }, [isDrawing, tool, currentPath, color, strokeWidth, addElement, user.id, updateElement])

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

  const fitToContent = useCallback(() => {
    const scoped = workspaceMode === 'board'
      ? elements.filter(element => !element.bpmnNodeType && !element.bpmnFlow)
      : elements.filter(element => element.bpmnNodeType || element.bpmnFlow)
    const visible = scoped.length ? scoped : elements
    if (!visible.length) {
      setTransform({ x: 0, y: 0, scale: 1 })
      return
    }
    const minX = Math.min(...visible.map(element => element.x))
    const minY = Math.min(...visible.map(element => element.y))
    const maxX = Math.max(...visible.map(element => element.x + (element.w || 48)))
    const maxY = Math.max(...visible.map(element => element.y + (element.h || 48)))
    const padding = 64
    const scale = clamp_scale(Math.min(
      (window.innerWidth - padding * 2) / Math.max(maxX - minX, 1),
      (window.innerHeight - 170) / Math.max(maxY - minY, 1),
    ))
    setTransform({
      scale,
      x: (window.innerWidth - (maxX - minX) * scale) / 2 - minX * scale,
      y: (window.innerHeight - (maxY - minY) * scale) / 2 - minY * scale,
    })
  }, [elements, workspaceMode])

  useEffect(() => () => {
    bpmnRunTimersRef.current.forEach(window.clearTimeout)
  }, [])

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (editingText) return
      if (showSimulationPanel && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return
      if (showSimulationPanel) return
      const target = (e.target as HTMLElement | null) || document.activeElement as HTMLElement | null
      if (target?.isContentEditable || (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) deleteElement(selectedId) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); if (selectedId) duplicateElement(selectedId) }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveBoard(e.shiftKey ? 'saveAs' : 'save')
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void openBoard()
        return
      }
      const map: Record<string, Tool> = {
        v: 'select', h: 'pan', p: 'pen', m: 'marker', e: 'eraser',
        s: 'sticky', t: 'text', r: 'rect', o: 'circle', a: 'arrow', l: 'line'
      }
      const bpmnMap: Record<string, Tool> = {
        s: 'bpmnStart', e: 'bpmnEnd', x: 'bpmnGateway', f: 'bpmnSequence',
      }
      if (!e.metaKey && !e.ctrlKey && workspaceMode === 'bpmn' && bpmnMap[e.key.toLowerCase()]) {
        chooseTool(bpmnMap[e.key.toLowerCase()])
        return
      }
      if (!e.metaKey && !e.ctrlKey && map[e.key]) chooseTool(map[e.key])
      if (!e.metaKey && !e.ctrlKey && e.key.toLowerCase() === '0') fitToContent()
      if (e.key === 'Escape') { setSelectedId(null); setContextMenu(null) }
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [selectedId, deleteElement, editingText, handleUndo, handleRedo, duplicateElement, workspaceMode, fitToContent, showSimulationPanel, chooseTool, saveBoard, openBoard])

  // ======================== RENDER ELEMENT ========================
  const renderedElements = useMemo(() => {
    if (!transientFrame) return elements
    return elements.map(element => element.id === transientFrame.id
      ? { ...element, ...transientFrame.updates }
      : element)
  }, [elements, transientFrame])

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
      const isBottleneck = el.bpmnNodeType === 'task' && visibleBottleneckRole !== null && el.bpmnResourceRole === visibleBottleneckRole
      return (
        <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move">
          {el.bpmnNodeType === 'startEvent' && <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 - 4} fill="white" stroke={el.color} strokeWidth={3} />}
          {el.bpmnNodeType === 'endEvent' && <>
            <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 - 4} fill="white" stroke={el.color} strokeWidth={5} />
            <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 - 10} fill="none" stroke={el.color} strokeWidth={1.5} />
          </>}
          {el.bpmnNodeType === 'task' && <>
            <rect width={width} height={height} rx={10} fill={isBottleneck ? '#FFF7ED' : 'white'} stroke={isBottleneck ? '#F97316' : el.color} strokeWidth={isBottleneck ? 4 : 2.5} />
            <rect x={10} y={10} width={5} height={height - 20} rx={2.5} fill={el.color} opacity={0.8} />
          </>}
          {isGateway && <polygon points={`${centerX},2 ${width - 2},${centerY} ${centerX},${height - 2} 2,${centerY}`} fill="white" stroke={el.color} strokeWidth={3} />}
          {isTokenActive && <circle cx={centerX} cy={centerY} r={Math.min(width, height) / 2 + 8} fill="none" stroke="#8B5CF6" strokeWidth={3 * invS}>
            <animate attributeName="r" values={`${Math.min(width, height) / 2 + 4};${Math.min(width, height) / 2 + 12};${Math.min(width, height) / 2 + 4}`} dur="0.65s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.35;1" dur="0.65s" repeatCount="indefinite" />
          </circle>}
          <text x={centerX} y={centerY + 4} textAnchor="middle" fontSize={isEvent ? 11 : isGateway ? 18 : 14} fontWeight={isGateway ? 700 : 600} fill="#1f2937" className="pointer-events-none">
            {isGateway ? (el.bpmnNodeType === 'andGateway' ? '+' : el.bpmnNodeType === 'xorGateway' ? '×' : '○') : el.text}
          </text>
          {el.bpmnNodeType === 'task' && (el.bpmnResourceRole || el.bpmnDurationMs !== undefined) && (
            <text x={centerX} y={height - 12} textAnchor="middle" fontSize="9" fill="#64748B" className="pointer-events-none">
              {[el.bpmnResourceRole, el.bpmnDurationMs !== undefined ? `${(el.bpmnDurationMs / 1000).toFixed(1)}с` : ''].filter(Boolean).join(' · ')}
            </text>
          )}
          {isBottleneck && <text x={width - 10} y={15} textAnchor="end" fontSize="10" fontWeight="700" fill="#EA580C">⚠ bottleneck</text>}
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
              <div className="w-full h-full select-none"
                onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }}>
                {editingText === el.id ? (
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { updateElement(el.id, { text: editValue }); setEditingText(null) }}
                    onKeyDown={e => { if (e.key === 'Enter') { updateElement(el.id, { text: editValue }); setEditingText(null) } }}
                    className="w-full bg-transparent outline-none text-[16px] font-semibold" style={{ color: el.color }} />
                ) : (
                  <div className="text-[16px] font-semibold" style={{ color: el.color }}>{el.text}</div>
                )}
              </div>
            </foreignObject>
            {isSelected && <rect x={-4} y={-4} width={(el.w || 200) + 8} height={(el.h || 60) + 8}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )

      case 'rect':
        return (
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move"
            onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }}
            onDoubleClickCapture={() => { setEditingText(el.id); setEditValue(el.text || '') }}
            onMouseDown={e => { if (e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onMouseUp={e => { if (e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}>
            <rect width={el.w} height={el.h} fill={el.fill || 'transparent'} stroke={el.color}
              strokeWidth={el.stroke} rx={4}
              onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }} />
            <foreignObject x={8} y={8} width={Math.max((el.w || 0) - 16, 120)} height={Math.max((el.h || 0) - 16, 40)}>
              <div className="w-full h-full flex items-center justify-center p-2 text-[14px] leading-snug font-medium text-black/80 break-words text-center select-none">
                {editingText === el.id ? (
                  <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { updateElement(el.id, { text: editValue }); setEditingText(null) }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); updateElement(el.id, { text: editValue }); setEditingText(null) } }}
                    className="w-full h-full bg-transparent outline-none resize-none text-center text-[14px]" />
                ) : (
                  <div onDoubleClick={e => { e.stopPropagation(); setEditingText(el.id); setEditValue(el.text || '') }}>{el.text}</div>
                )}
              </div>
            </foreignObject>
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
          <g key={el.id} data-id={el.id} transform={`translate(${el.x},${el.y})`} className="touch-none cursor-move"
            onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }}
            onDoubleClickCapture={() => { setEditingText(el.id); setEditValue(el.text || '') }}
            onMouseDown={e => { if (e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onMouseUp={e => { if (e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}>
            <ellipse cx={(el.w || 0) / 2} cy={(el.h || 0) / 2} rx={Math.abs((el.w || 0) / 2)} ry={Math.abs((el.h || 0) / 2)}
              fill={el.fill || 'transparent'} stroke={el.color} strokeWidth={el.stroke}
              onDoubleClick={() => { setEditingText(el.id); setEditValue(el.text || '') }} />
            <foreignObject x={8} y={8} width={Math.max((el.w || 0) - 16, 120)} height={Math.max((el.h || 0) - 16, 40)}>
              <div className="w-full h-full flex items-center justify-center p-2 text-[14px] leading-snug font-medium text-black/80 break-words text-center select-none">
                {editingText === el.id ? (
                  <textarea autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={() => { updateElement(el.id, { text: editValue }); setEditingText(null) }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); updateElement(el.id, { text: editValue }); setEditingText(null) } }}
                    className="w-full h-full bg-transparent outline-none resize-none text-center text-[14px]" />
                ) : (
                  <div onDoubleClick={e => { e.stopPropagation(); setEditingText(el.id); setEditValue(el.text || '') }}>{el.text}</div>
                )}
              </div>
            </foreignObject>
            {isSelected && <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )

      case 'arrow': {
        const source = el.bpmnFlow ? renderedElements.find(node => node.id === el.bpmnFlow?.sourceId) : undefined
        const target = el.bpmnFlow ? renderedElements.find(node => node.id === el.bpmnFlow?.targetId) : undefined
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
          <g key={el.id} data-id={el.id} data-testid={el.bpmnFlow ? `bpmn-flow-${el.id}` : undefined} transform={`translate(${startX},${startY})`} className="touch-none cursor-move">
            <line x1={0} y1={0} x2={x2} y2={y2} stroke={el.color} strokeWidth={el.stroke} />
            <polygon points={`${x2},${y2} ${x2 - hs * Math.cos(angle - 0.4)},${y2 - hs * Math.sin(angle - 0.4)} ${x2 - hs * Math.cos(angle + 0.4)},${y2 - hs * Math.sin(angle + 0.4)}`}
              fill={el.color} />
            {el.bpmnFlow && (el.bpmnFlow.condition || el.bpmnFlow.probability !== undefined || el.bpmnFlow.isDefault) && (
              <g transform={`translate(${x2 / 2},${y2 / 2})`}>
                <rect x="-34" y="-12" width="68" height="20" rx="6" fill="white" stroke="#CBD5E1" />
                <text textAnchor="middle" y="2" fontSize="10" fill="#475569">
                  {el.bpmnFlow.isDefault ? 'default' : el.bpmnFlow.condition || (el.bpmnFlow.probability !== undefined ? `P ${(el.bpmnFlow.probability * 100).toFixed(0)}%` : '')}
                </text>
              </g>
            )}
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

  // ======================== JSX ========================
  const dk = false
  const bgMain = '#F7F8FC'
  const bgBar = 'bg-white/95'
  const borderC = 'border-slate-200'
  const textC = 'text-slate-900'
  const textSec = 'text-slate-500'
  const hoverBg = 'hover:bg-slate-100'

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
            <span className={`text-[15px] font-bold tracking-tight ${textC}`}>{fileSession.name ?? 'Новый документ'}</span>
            <span role="status" aria-live="polite" className={`text-[11px] font-semibold ${isDirty ? 'text-amber-700' : textSec}`}>{isDirty ? 'Не сохранено' : 'Сохранено'}</span>
            <span className="select-text rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-600" title="Build version: можно выделить и скопировать">{__MIROBOARD_VERSION__}</span>
            <div className="ml-1 hidden rounded-lg bg-slate-100 p-0.5 sm:flex">
              {([
                ['board', 'Доска'],
                ['bpmn', 'BPMN'],
                ['simulation', 'Симуляция'],
              ] as [WorkspaceMode, string][]).map(([mode, label]) => (
                <button key={mode} onClick={() => {
                  if ((mode === 'bpmn' || mode === 'simulation') && !bpmnProfileActive) {
                    activateBpmnProfile()
                  }
                  setWorkspaceMode(mode)
                  if (mode === 'simulation') setShowSimulationPanel(true)
                }} className={`rounded-md px-2 py-1 text-[10px] font-semibold transition ${workspaceMode === mode ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowProjectHistory(true)}
              className={`h-7 px-2 rounded-lg text-[11px] font-semibold transition ${hoverBg} ${textSec}`}
              title="История проекта"
            >
              История
            </button>
            <button onClick={() => setTourStep(0)} className={`grid size-7 place-items-center rounded-lg text-[12px] font-bold transition ${hoverBg} ${textSec}`} title="Краткий тур по интерфейсу">
              ?
            </button>
            <button onClick={() => setShowLearningModules(true)} className={`h-7 px-2 rounded-lg text-[11px] font-semibold transition ${hoverBg} ${textSec}`} title="Учебные BPMN-примеры">
              Примеры
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
              <button onClick={() => { setWorkspaceMode('simulation'); setShowSimulationPanel(true) }} className="h-7 rounded-lg bg-fuchsia-500 px-2.5 text-[11px] font-bold text-white shadow-sm hover:bg-fuchsia-600" title="Открыть Monte Carlo симуляцию">
                Симуляция
              </button>
              {bpmnRunSummary && (
                <div className={`h-7 px-2 rounded-lg text-[11px] font-semibold ${dk ? 'bg-indigo-950 text-indigo-200' : 'bg-indigo-50 text-indigo-700'}`}>
                  {bpmnRunSummary}
                </div>
              )}
              {visibleSimulationSummary && (
                <div className={`h-7 max-w-[340px] truncate px-2 rounded-lg text-[11px] font-semibold ${dk ? 'bg-fuchsia-950 text-fuchsia-200' : 'bg-fuchsia-50 text-fuchsia-700'}`} title={visibleSimulationSummary}>
                  {visibleSimulationSummary}
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
          {/* Minimap toggle */}
          <button onClick={() => setShowMiniMap(!showMiniMap)} className={`size-8 grid place-items-center rounded-lg transition ${hoverBg} ${textSec}`} title="Мини-карта">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18" /></svg>
          </button>
        </div>
      </div>

      {toast && (
        <div className={`absolute right-4 top-16 z-[60] max-w-sm rounded-2xl border px-4 py-3 text-sm font-medium shadow-xl ${toast.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : toast.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-violet-200 bg-violet-50 text-violet-800'}`} data-ui aria-live="polite">
          <div className="flex items-start gap-3"><span>{toast.tone === 'error' ? '!' : toast.tone === 'success' ? '✓' : 'i'}</span><span>{toast.message}</span><button onClick={() => setToast(null)} className="ml-auto text-base leading-none">×</button></div>
        </div>
      )}

      {pendingOpen && (
        <UnsavedChangesDialog
          onCancel={() => setPendingOpen(null)}
          onDiscard={() => {
            const pending = pendingOpen
            setPendingOpen(null)
            void pending.proceed()
          }}
          onSave={() => {
            const pending = pendingOpen
            void (async () => {
              if (await saveBoard('save')) {
                setPendingOpen(null)
                await pending.proceed()
              }
            })()
          }}
        />
      )}

      {tourStep >= 0 && (
        <div className="absolute inset-0 z-[70] grid place-items-center bg-slate-900/45 p-4 backdrop-blur-sm" data-ui>
          {(() => {
            const steps = [
              ['Добро пожаловать', 'MiroBoard объединяет свободную доску, BPMN-моделирование и воспроизводимую симуляцию. Начните с режима «Доска» или загрузите учебный модуль.'],
              ['Режимы работы', 'В шапке переключаются «Доска», «BPMN» и «Симуляция». В BPMN-режиме слева появляются команды моделирования, проверки и симуляции.'],
              ['Потоки и свойства', 'Выберите «Поток», кликните источник и затем цель. Выбранная задача или стрелка открывает справа свойства: время, ресурсы, условия и вероятность.'],
              ['Проверяемый результат', 'Симуляция показывает длительность, SLA, стоимость, загрузку и очереди. «История» содержит commits и releases, которые формируются при build из Git.'],
            ] as const
            const [title, text] = steps[tourStep] ?? steps[0]
            return <section className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-2xl">
              <div className="mb-4 flex gap-1">{steps.map((_, index) => <span key={index} className={`h-1.5 flex-1 rounded-full ${index <= tourStep ? 'bg-violet-600' : 'bg-slate-200'}`} />)}</div>
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-600">Тур {tourStep + 1} из {steps.length}</div>
              <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{text}</p>
              <div className="mt-7 flex items-center justify-between">
                <button onClick={finishTour} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Пропустить</button>
                <button onClick={() => tourStep === steps.length - 1 ? finishTour() : setTourStep(tourStep + 1)} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-violet-700">
                  {tourStep === steps.length - 1 ? 'Начать работу' : 'Далее'}
                </button>
              </div>
            </section>
          })()}
        </div>
      )}

      {/* ===== CANVAS ===== */}
      <div ref={canvasRef} data-testid="canvas" className="absolute inset-0 touch-none"
        onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}
        onTouchMove={handleTouchMove} onWheel={handleWheel}
        onDragEnter={onDragEnter} onDragOver={onDragOver}
        onDragLeave={onDragLeave} onDrop={onCanvasDrop}
        onContextMenu={e => e.preventDefault()}
        style={{ touchAction: 'none' }}>
        {isDropTarget && <DropTargetCue />}

        <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }}
          onDoubleClick={e => {
            const node = (e.target as Element).closest<SVGGElement>('[data-id]')
            const id = node?.getAttribute('data-id')
            const element = id ? elements.find(candidate => candidate.id === id) : undefined
            if (element && (element.type === 'rect' || element.type === 'circle')) {
              setEditingText(element.id)
              setEditValue(element.text || '')
            }
          }}>
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
            {renderedElements.map(renderElement)}
            {bpmnFlowSourceId && flowPreviewPoint && (() => {
              const source = elements.find(element => element.id === bpmnFlowSourceId)
              if (!source) return null
              const start = { x: source.x + (source.w || 0) / 2, y: source.y + (source.h || 0) / 2 }
              return <line x1={start.x} y1={start.y} x2={flowPreviewPoint.x} y2={flowPreviewPoint.y} stroke="#7C3AED" strokeWidth={2} strokeDasharray="7 6" pointerEvents="none" />
            })()}

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

          </g>
        </svg>

        {workspaceMode === 'bpmn' && elements.some(element => element.bpmnNodeType) && (
          <aside className={`absolute left-3 top-[68px] z-20 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl shadow-slate-900/10 backdrop-blur transition-all ${sidebarCollapsed ? 'w-12' : 'w-52'}`} data-ui>
            <div className="mb-2 flex items-center justify-between px-1">
              {!sidebarCollapsed && <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">BPMN workspace</div>}
              <button onClick={() => setSidebarCollapsed(value => !value)} className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" title={sidebarCollapsed ? 'Развернуть BPMN-меню' : 'Свернуть BPMN-меню'}>{sidebarCollapsed ? '›' : '‹'}</button>
            </div>
            <button onClick={() => { setWorkspaceMode('simulation'); setShowSimulationPanel(true) }} className={`mb-1 flex w-full items-center gap-2 rounded-xl bg-violet-600 py-2.5 text-left text-xs font-bold text-white shadow-sm hover:bg-violet-700 ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`} title="Симуляция">
              <span>◌</span>{!sidebarCollapsed && ' Симуляция'}
            </button>
            <button onClick={() => setShowLearningModules(true)} className={`mb-1 flex w-full items-center gap-2 rounded-xl py-2 text-left text-xs font-semibold text-slate-700 hover:bg-violet-50 ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`} title="Учебные модули">
              <span>◈</span>{!sidebarCollapsed && ' Учебные модули'}
            </button>
            <button onClick={runBpmn} className={`flex w-full items-center gap-2 rounded-xl py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`} title="Проверить поток">
              <span>▶</span>{!sidebarCollapsed && ' Проверить поток'}
            </button>
            {!sidebarCollapsed && <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
              Симуляция показывает время, SLA, стоимость, загрузку и ожидание ресурсов.
            </div>}
          </aside>
        )}

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
              <button onClick={() => setShowTemplates(true)}
                className="mt-4 h-9 px-5 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white text-[14px] font-medium pointer-events-auto active:scale-95 transition shadow-md">
                📋 Начать с шаблона
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ===== MINIMAP ===== */}
      {showMiniMap && <MiniMap elements={renderedElements} transform={transform} darkMode={darkMode} setTransform={setTransform} />}

      {/* ===== BOTTOM TOOLBAR ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-40 pb-[calc(env(safe-area-inset-bottom)+8px)]" data-ui>
        <div className="mx-auto w-fit max-w-[calc(100%-16px)]">

          {/* Emoji picker */}
          {showEmoji && (
            <div className={`mb-2 mx-auto w-fit p-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${borderC}`}>
              <div className="flex flex-wrap gap-1 max-w-[280px]">
                {EMOJIS.map(em => (
                  <button key={em} onClick={() => { setSelectedEmoji(em); chooseTool('emoji'); setShowEmoji(false) }}
                    className={`size-10 rounded-xl grid place-items-center text-[22px] transition active:scale-90 ${selectedEmoji === em ? (dk ? 'bg-violet-600' : 'bg-violet-100') : hoverBg}`}>
                    {em}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showBpmnPalette && (
            <div className={`relative z-10 mb-2 mx-auto w-fit p-2 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-2xl border ${borderC}`}>
              <div className="flex gap-1.5" onClickCapture={(event) => {
                const target = event.target as HTMLElement
                console.log('[BPMN diagnostic] palette click capture', JSON.stringify({
                  targetTitle: target.closest('button')?.title ?? null,
                  paletteVisible: showBpmnPalette,
                  tool,
                }))
              }}>
                {([
                  { id: 'bpmnStart', label: 'Старт', icon: '○' },
                  { id: 'bpmnTask', label: 'Задача', icon: '▭' },
                  { id: 'bpmnGateway', label: 'Шлюз XOR', icon: '◇' },
                  { id: 'bpmnParallel', label: 'Шлюз AND', icon: '+' },
                  { id: 'bpmnEnd', label: 'Конец', icon: '◉' },
                  { id: 'bpmnSequence', label: 'Поток', icon: '→' },
                ] as { id: Tool; label: string; icon: string }[]).map(item => (
                  <button key={item.id} onClick={(event) => {
                    const button = event.currentTarget
                    const styles = window.getComputedStyle(button)
                    const bounds = button.getBoundingClientRect()
                    console.log('[BPMN diagnostic] palette button click start', JSON.stringify({
                      id: item.id,
                      label: item.label,
                      currentTool: tool,
                      paletteVisible: showBpmnPalette,
                      visible: styles.display !== 'none' && styles.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0,
                      clickable: !button.disabled && styles.pointerEvents !== 'none',
                    }))
                    chooseTool(item.id)
                    console.log('[BPMN diagnostic] palette button after chooseTool', JSON.stringify({
                      id: item.id,
                      currentTool: tool,
                      requestedTool: item.id,
                      note: 'React state updates commit after this handler returns',
                    }))
                  }}
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
              <button key={t.id} onClick={() => { chooseTool(t.id); setShowEmoji(false) }}
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
                if (t.id === 'emoji') { setShowEmoji(!showEmoji); chooseTool('emoji') }
                else { chooseTool(t.id); setShowEmoji(false) }
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
            <button onClick={() => { setShowMore(value => !value); setShowBpmnPalette(false) }}
              aria-label="Дополнительные инструменты"
              className={`size-11 grid place-items-center rounded-[14px] transition-all active:scale-90 ${showMore ? 'bg-black text-white' : `${textSec} ${hoverBg}`}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
            </button>
          </div>
        </div>
      </div>
      {/* ===== MORE MENU ===== */}
      {showMore && (
        <div className={`absolute bottom-[104px] left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 p-1.5 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} shadow-xl border ${borderC}`} data-ui>
          <button onClick={() => { chooseTool('line'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${tool === 'line' ? 'bg-black text-white' : hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 19L19 5" /></svg> Линия
          </button>
          <button onClick={() => { chooseTool('laser'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${tool === 'laser' ? 'bg-black text-white' : hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="8" strokeDasharray="4 3" /></svg> Лазер
          </button>
          <button onClick={() => { chooseTool('eraser'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${tool === 'eraser' ? 'bg-black text-white' : hoverBg}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16a1.9 1.9 0 0 1 0-2.8L14.2 2h.8l6 6v.8L9.8 20" /></svg> Ластик
          </button>
          <button onClick={() => { activateBpmnProfile(); setShowMore(false); setShowEmoji(false) }}
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
          <button onClick={() => { resetDocument(); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            Новый
          </button>
          <button onClick={() => { void openBoard(); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            Открыть
          </button>
          <button onClick={() => { void saveBoard('save'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            ⇩ Сохранить
          </button>
          <button onClick={() => { void saveBoard('saveAs'); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            ⇩ Сохранить как
          </button>
          <button onClick={() => { markCurrentState(); setShowMore(false) }}
            className={`h-9 px-3 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition ${hoverBg}`}>
            ◉ Отметить состояние
          </button>
          <span role="status" aria-live="polite" className={`px-2 text-[11px] font-medium ${textSec}`}>
            Контрольные точки: {historySnapshots.length}
          </span>
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
            {CONTEXT_MENU_ITEMS.map((item) => (
              <button key={item.action} onClick={() => handleContextMenuAction(item.action, contextMenu.id)}
                className={`w-full h-10 px-4 text-left text-[14px] flex items-center gap-2 transition ${item.danger ? 'text-red-500 hover:bg-red-50' : `${textSec} ${hoverBg}`}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {/* ===== STICKY COLORS ===== */}
      {selectedBpmnTask && !contextMenu && (
        <aside className={`absolute right-3 top-[68px] z-30 flex w-72 max-w-[calc(100vw-24px)] flex-col gap-3 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} p-4 shadow-xl border ${borderC} max-md:inset-x-3 max-md:top-auto max-md:bottom-20 max-md:w-auto max-md:max-h-[46vh] max-md:overflow-y-auto`} data-ui>
          <div className="text-xs font-bold text-slate-400">Свойства задачи</div>
          <div className="grid grid-cols-2 gap-2">
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
          <select
            value={selectedBpmnTask.bpmnDurationDistribution || 'fixed'}
            onChange={(event) => updateElement(selectedBpmnTask.id, {
              bpmnDurationDistribution: event.target.value as 'fixed' | 'uniform' | 'triangular',
              bpmnDurationMinMs: selectedBpmnTask.bpmnDurationMinMs ?? selectedBpmnTask.bpmnDurationMs ?? 1000,
              bpmnDurationModeMs: selectedBpmnTask.bpmnDurationModeMs ?? selectedBpmnTask.bpmnDurationMs ?? 1000,
              bpmnDurationMaxMs: selectedBpmnTask.bpmnDurationMaxMs ?? selectedBpmnTask.bpmnDurationMs ?? 1000,
            })}
            className={`rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
          >
            <option value="fixed">Fixed</option>
            <option value="uniform">Uniform</option>
            <option value="triangular">Triangular</option>
          </select>
          {(selectedBpmnTask.bpmnDurationDistribution === 'uniform' || selectedBpmnTask.bpmnDurationDistribution === 'triangular') && (
            <>
              <label className={`text-[11px] font-semibold ${textSec}`}>Min
                <input type="number" min="0" value={(selectedBpmnTask.bpmnDurationMinMs ?? 1000) / 1000} onChange={(event) => updateElement(selectedBpmnTask.id, { bpmnDurationMinMs: Math.max(0, Number(event.target.value) * 1000) })} className={`ml-1 w-14 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
              </label>
              {selectedBpmnTask.bpmnDurationDistribution === 'triangular' && (
                <label className={`text-[11px] font-semibold ${textSec}`}>Mode
                  <input type="number" min="0" value={(selectedBpmnTask.bpmnDurationModeMs ?? 1000) / 1000} onChange={(event) => updateElement(selectedBpmnTask.id, { bpmnDurationModeMs: Math.max(0, Number(event.target.value) * 1000) })} className={`ml-1 w-14 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
                </label>
              )}
              <label className={`text-[11px] font-semibold ${textSec}`}>Max
                <input type="number" min="0" value={(selectedBpmnTask.bpmnDurationMaxMs ?? 1000) / 1000} onChange={(event) => updateElement(selectedBpmnTask.id, { bpmnDurationMaxMs: Math.max(0, Number(event.target.value) * 1000) })} className={`ml-1 w-14 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
              </label>
            </>
          )}
          <label className={`text-[11px] font-semibold ${textSec}`}>Роль
            <input value={selectedBpmnTask.bpmnResourceRole || ''} placeholder="Аналитик" onChange={(event) => updateElement(selectedBpmnTask.id, { bpmnResourceRole: event.target.value || undefined })} className={`ml-1 w-20 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
          </label>
          <label className={`text-[11px] font-semibold ${textSec}`}>€/ч
            <input type="number" min="0" step="0.01" value={selectedBpmnTask.bpmnCostPerHour ?? ''} onChange={(event) => { const value = event.target.value; const cost = value === '' ? undefined : Number(value); if (cost === undefined || (Number.isFinite(cost) && cost >= 0)) updateElement(selectedBpmnTask.id, { bpmnCostPerHour: cost }) }} className={`ml-1 w-16 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
          </label>
          <label className={`text-[11px] font-semibold ${textSec}`}>Capacity
            <input type="number" min="1" max="1000" step="1" value={selectedBpmnTask.bpmnResourceCapacity ?? 1} onChange={(event) => { const capacity = Number(event.target.value); if (Number.isInteger(capacity) && capacity >= 1 && capacity <= 1000) updateElement(selectedBpmnTask.id, { bpmnResourceCapacity: capacity }) }} className={`ml-1 w-14 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`} />
          </label>
          <label className={`text-[11px] font-semibold ${textSec}`}>Priority
            <input type="number" min="-100" max="100" step="1" value={selectedBpmnTask.bpmnPriority ?? 0} onChange={(event) => { const priority = Number(event.target.value); if (Number.isInteger(priority) && priority >= -100 && priority <= 100) updateElement(selectedBpmnTask.id, { bpmnPriority: priority }) }} className="ml-1 w-14 rounded-lg border border-slate-200 px-2 py-1 text-[12px] outline-none" />
          </label>
          </div>
        </aside>
      )}
      {selectedBpmnFlow && !contextMenu && (
        <aside className={`absolute right-3 top-[68px] z-30 flex w-72 max-w-[calc(100vw-24px)] flex-col gap-3 rounded-2xl ${dk ? 'bg-slate-800 border-slate-600' : 'bg-white'} p-4 shadow-xl border ${borderC} max-md:inset-x-3 max-md:top-auto max-md:bottom-20 max-md:w-auto max-md:max-h-[46vh] max-md:overflow-y-auto`} data-ui>
          <div className="text-xs font-bold text-slate-400">Свойства sequence flow</div>
          <div className="flex flex-col gap-3">
          <label className={`text-[11px] font-semibold ${textSec}`} htmlFor="bpmn-flow-type">Тип потока</label>
          <select
            id="bpmn-flow-type"
            data-testid="bpmn-flow-type"
            value={selectedBpmnFlow.bpmnFlow?.flowType || 'sequence'}
            onChange={(event) => updateElement(selectedBpmnFlow.id, {
              bpmnFlow: { ...selectedBpmnFlow.bpmnFlow!, flowType: event.target.value as 'sequence' | 'message' },
            })}
            className={`w-32 rounded-lg border px-2 py-1 text-[12px] outline-none ${dk ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
          >
            <option value="sequence">sequence</option>
            <option value="message">message</option>
          </select>
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
        </aside>
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
        <SimulationModal
        arrivalClasses={arrivalClasses}
        arrivalInterval={arrivalInterval}
        calendarEnd={calendarEnd}
        calendarStart={calendarStart}
        detectedRoles={detectedRoles}
        dk={dk}
        hoverBg={hoverBg}
        rolePolicies={rolePolicies}
        setArrivalClasses={setArrivalClasses}
        setArrivalInterval={setArrivalInterval}
        setCalendarEnd={setCalendarEnd}
        setCalendarStart={setCalendarStart}
        setRolePolicies={setRolePolicies}
        setSimulationInstances={setSimulationInstances}
        setSimulationRuns={setSimulationRuns}
        setSimulationSeed={setSimulationSeed}
        setSimulationTarget={setSimulationTarget}
        simulationInstances={simulationInstances}
        simulationRuns={simulationRuns}
        simulationSeed={simulationSeed}
        simulationTarget={simulationTarget}
        simulateBpmn={simulateBpmn}
        textSec={textSec}
        visibleBottleneckRole={visibleBottleneckRole}
        visibleSimulationResult={visibleSimulationResult}
        onClose={() => setShowSimulationPanel(false)}
        />
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
            <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold">Как читать эту историю</h3>
              <p className={`mt-1 text-[13px] leading-5 ${textSec}`}>
                <b>Commit</b>, например <code>394dec5</code>, это неизменяемый точный снимок исходного кода. По ссылке можно увидеть, какие файлы и почему изменились. <b>Release</b>, например <code>v0.6.0</code>, это понятная пользователю стабильная версия, объединяющая проверенные commits и готовый HTML.
              </p>
              <p className={`mt-2 text-[13px] leading-5 ${textSec}`}>
                jj автоматически хранит локальные операции и позволяет безопасно отменять шаги, но пока не генерирует этот UI-список commits. В текущем release список обновляется вручную и поэтому отражает только опубликованные этапы. Сейчас развивается BPMN-симулятор: после длительностей, стоимости и ресурсов добавлены очереди, SLA и рабочий календарь. Следующий этап, приоритеты очереди, несколько экземпляров процесса и bottleneck-анализ.
              </p>
            </div>
            <h3 className="text-sm font-bold mb-3">Этапы</h3>
            <ol className="space-y-3">
              {PROJECT_HISTORY.map(({ date, commit, title, release }) => (
                <li key={commit} className={`relative pl-5 border-l-2 ${dk ? 'border-slate-600' : 'border-slate-200'}`}>
                  <span className={`absolute -left-[5px] top-1.5 size-2 rounded-full ${dk ? 'bg-violet-400' : 'bg-violet-500'}`} />
                  <div className={`text-[11px] font-mono ${textSec}`}>{date}</div>
                  <a href={`${GITHUB_REPOSITORY}/commit/${commit}`} target="_blank" rel="noreferrer" className="text-[13px] font-semibold hover:underline">
                    {title} <span className={`font-mono text-[11px] ${textSec}`}>{commit} ↗</span>
                  </a>
                  {release && <a href={`${GITHUB_REPOSITORY}/releases/tag/${release}`} target="_blank" rel="noreferrer" className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 hover:bg-violet-200">{release}</a>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
      {/* ===== LEARNING MODULES MODAL ===== */}
      {showLearningModules && (
        <div className="absolute inset-0 z-50 grid place-items-center p-4 bg-slate-900/35 backdrop-blur-sm" onClick={() => setShowLearningModules(false)} data-ui>
          <section className="w-full max-w-2xl rounded-[28px] bg-white p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-bold text-slate-900">Учебные BPMN-модули</h2><p className="mt-1 text-sm text-slate-500">Загрузите готовую схему, прочитайте цель и проверьте результат симуляции.</p></div>
              <button onClick={() => setShowLearningModules(false)} className="grid size-9 place-items-center rounded-xl text-lg text-slate-500 hover:bg-slate-100">×</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {EDUCATIONAL_EXAMPLES.map((example, index) => (
                <button key={example.title} onClick={() => { setShowLearningModules(false); loadEducationalExample(example) }} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:border-violet-300 hover:bg-violet-50">
                  <div className="mb-2 text-xs font-bold text-violet-600">Модуль {index + 1}</div>
                  <div className="text-sm font-bold text-slate-900">{example.title}</div>
                  <div className="mt-2 text-xs leading-5 text-slate-500">{example.explanation}</div>
                  <div className="mt-3 text-xs font-semibold text-violet-700">Загрузить →</div>
                </button>
              ))}
            </div>
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
            <h4 className="mt-6 mb-3 text-sm font-bold">Учебные BPMN-модули</h4>
            <div className="space-y-2">
              {EDUCATIONAL_EXAMPLES.map((example) => (
                <button key={example.title} onClick={() => { setShowTemplates(false); loadEducationalExample(example) }}
                  className={`w-full rounded-xl p-3 text-left ${dk ? 'bg-slate-700 hover:bg-slate-600' : 'bg-indigo-50 hover:bg-indigo-100'} transition`}>
                  <div className="text-sm font-semibold">{example.title}</div>
                  <div className={`mt-1 text-xs ${dk ? 'text-slate-300' : 'text-slate-600'}`}>{example.explanation}</div>
                </button>
              ))}
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
          <div className={`h-px ${dk ? 'bg-slate-600' : 'bg-black/10'}`} />
          <button onClick={fitToContent} title="Подогнать содержимое (0)" className={`size-10 grid place-items-center ${hoverBg} ${textSec}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
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
