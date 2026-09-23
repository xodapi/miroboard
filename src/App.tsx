import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as Y from 'yjs'
import { clamp_scale, export_bpmn_xml, import_bpmn_xml, run_bpmn, simulate_bpmn_seed_string, validate_bpmn } from './wasm/board-core/board_core'
import { commitElementUpdate } from './persistence/updates'
import { LOAD, LOCAL_CLIPBOARD, LOCAL_EDIT, LOCAL_GESTURE, LOCAL_ORIGINS, LOCAL_TEMPLATE, NON_EDIT_ORIGINS } from './collab/origins'
import { PASTE_OFFSET, parseClipboard, preparePaste, serialiseSelection } from './collab/clipboard'
import { readProfile, writeProfile, type UserProfile } from './collab/user-profile'
import {
  clearSelection, idsOf, isSelected as isIdSelected, primaryOf, removeFromSelection, retainExisting,
  selectMany, selectOnly, unionSelection, type Selection,
} from './collab/selection'
import { normaliseRect, selectInRect, type Bounds } from './collab/marquee'
import { useFileDrop } from './hooks/useFileDrop'
import { DropTargetCue } from './components/DropTargetCue'
import { MiniMap } from './components/MiniMap'
import { RecoveryDivergenceNotice } from './components/RecoveryDivergenceNotice'
import { openDocument, openDroppedDocument, saveDocument, type FileSession, type OpenOutcome } from './persistence/files'
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog'
import { SimulationModal } from './components/SimulationModal'
import { TemplatesModal } from './components/TemplatesModal'
import { LearningModulesModal } from './components/LearningModulesModal'
import { ProjectHistoryModal } from './components/ProjectHistoryModal'
import { BpmnTaskProperties } from './components/BpmnTaskProperties'
import { BpmnFlowProperties } from './components/BpmnFlowProperties'
import { ColorPicker } from './components/ColorPicker'
import { AlignBar } from './components/AlignBar'
import { StrokeStyleBar } from './components/StrokeStyleBar'
import { BoardHeader } from './components/BoardHeader'
import { BoardSearch } from './components/BoardSearch'
import { ZoomControls, ElementCount } from './components/ZoomControls'
import { CanvasBackground } from './components/CanvasBackground'
import { ChangedInPreview, LockBadges, ResizeHandles } from './components/element-chrome'
import { ElementTextEditor } from './components/ElementTextEditor'
import { useSimulationSettings } from './board/use-simulation-settings'
import { centerOn, elementsInScope, fitTransform, screenToWorld as toWorld, wheelZoomFactor, zoomAround } from './board/viewport'
import { ALIGN_SCREEN_PX, snapDragFrames, snapResizeFrames, type Guide } from './board/align'
import { hitBounds, searchBoard, stepIndex } from './board/search'
import { readUiPreferences, writeUiPreferences } from './board/preferences'
import {
  frontierAdvice, frontierRole, frontierRuns, markFrontier, roleCapacity, sweepCapacities, withRoleCapacity,
  type FrontierPoint,
} from './board/frontier'
import { alignUnitCount, type AlignAxis } from './board/arrange'
import * as commands from './board/commands'
import { clickTargets, expandIds, groupOutlines, planGroup, planUngroup, toggleGrouped } from './board/group'
import { isLocked, selectionLockAction } from './board/lock'
import { paintChannels, paintPatch } from './board/paint'
import { arrowHeadOf, dashOf, isLineElement, strokeDasharray, type ArrowHead, type LineDash } from './board/stroke-style'
import { BottomToolbar } from './components/BottomToolbar'
import { ProfilePanel } from './components/ProfilePanel'
import { OnboardingTour } from './components/OnboardingTour'
import { Toast, type ToastTone } from './components/Toast'
import { MoreMenu } from './components/MoreMenu'
import { ContextMenu } from './components/ContextMenu'
import { createTheme } from './board/theme'
import { addBeforeUnloadGuard, createDirtyTracker, RECOVERY_ORIGIN, type DirtyTracker } from './persistence/dirty'
import { captureSnapshot, fromBase64, HISTORY_RESTORE_ORIGIN, readSnapshot, restoreSnapshot, toBase64 } from './history/snapshots'
import { loadIntoDoc } from './history/state'
import { createCaptureTriggers, type CaptureTriggers } from './history/capture-triggers'
import { TimelinePanel } from './history/TimelinePanel'
import { HistoryPreviewBanner } from './history/HistoryPreviewBanner'
import { DEFAULT_RETENTION, retainForSave } from './history/retention'
import { HistoryRetentionControls } from './history/HistoryRetentionControls'
import { attachRecoveryCache } from './persistence/indexeddb'
import { createRecoverySession, inspectRecoverySession, setRecoverySession } from './persistence/recovery-session'
import { adoptLegacyRooms, legacyDocumentIdFromCurrentUrl } from './persistence/legacy-adoption'
import { bpmnSimulationFromProfileConfig, withBpmnSimulation } from './format/profile-config'
import { serialise } from './format/mboard'
import type { DocHistory, DocMeta, HistorySnapshot, ProfileConfig } from './format/types'
import { HelpPanel } from './HelpPanel'
import './help-panel.css'
import { bpmnEdgeAnchor, simplifyPath, smoothPathD, snapVal } from './board/geometry'
import { dragFrame, resizeFrame, type DragInfo, type ResizeCorner, type ResizeInfo } from './board/gesture'
import { canRotate, frameTransform, rotationFromPointer, type RotateInfo } from './board/rotate'
import { genId } from './board/id'
import { STICKY_COLORS } from './board/palette'
import type {
  BoardElement, BpmnNodeType, BpmnSimulationResult, ContextMenuAction, EducationalExample,
  ImportedBpmnModel, PendingOpen, Point, Tool, WorkspaceMode,
} from './board/types'
declare global {
  interface Window {
    __MIROBOARD_DEBUG__?: { version: string; createBpmnModel: () => unknown; validateBpmn: () => unknown; exportBpmnXml: () => string; runBpmn: () => unknown; simulateBpmn: (seed: number | string | bigint, runs: number) => BpmnSimulationResult; getElements: () => BoardElement[] }
  }
}
const GITHUB_REPOSITORY = 'https://github.com/xodapi/miroboard'
declare const __MIROBOARD_VERSION__: string
declare const __MIROBOARD_HISTORY__: { commit: string; date: string; title: string; release?: string }[]
declare const __MIROBOARD_DEBUG_HOOK__: boolean

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [bpmnFlowSourceId, setBpmnFlowSourceId] = useState<string | null>(null)
  // Device preferences, read once. A later effect writes them back. They are
  // not document state: a shared .mboard must not carry one person's theme.
  const [uiPrefs] = useState(() => readUiPreferences(localStorage))
  const [color, setColor] = useState(uiPrefs.color)
  const [strokeWidth, setStrokeWidth] = useState(uiPrefs.strokeWidth)
  // Device defaults for the next arrow or line. The file stores the mark's own
  // dash and head; these only remember what the pen should draw next.
  const [lineDash, setLineDash] = useState<LineDash>(uiPrefs.lineDash)
  const [arrowHead, setArrowHead] = useState<ArrowHead>(uiPrefs.arrowHead)
  const [elements, setElements] = useState<BoardElement[]>([])
  const [selectedIds, setSelectedIds] = useState<Selection>(clearSelection)
  /** The element property panels and resize handles act on: single selection only. */
  const selectedElementId = primaryOf(selectedIds)
  /** Shift-marquee anchor: the selection a Shift drag extends or shrinks. */
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentPath, setCurrentPath] = useState<Point[]>([])
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<Point | null>(null)
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [darkMode, setDarkMode] = useState(uiPrefs.darkMode)
  const [showTemplates, setShowTemplates] = useState(false)
  const [showLearningModules, setShowLearningModules] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('board')
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null)
  const [tourStep, setTourStep] = useState(() => {
    try { return localStorage.getItem('miro-onboarding-seen') ? -1 : 0 } catch { return -1 }
  })
  const [showProjectHistory, setShowProjectHistory] = useState(false)
  const [showTimeline, setShowTimeline] = useState(false)
  const [previewSnapshot, setPreviewSnapshot] = useState<HistorySnapshot | null>(null)
  const [previewElements, setPreviewElements] = useState<BoardElement[] | null>(null)
  const [showSimulationPanel, setShowSimulationPanel] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [fileSession, setFileSession] = useState<FileSession>({ handle: null, name: null, isUntitled: true })
  const [isDirty, setIsDirty] = useState(false); const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null)
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
  const [frontierTrace, setFrontierTrace] = useState<{ fingerprint: string; role: string; advice: string; runs: number; points: FrontierPoint[] } | null>(null)
  const simulation = useSimulationSettings()
  // Stable across renders (it is the raw setState), so the long-lived
  // profileConfig observer can capture it without re-subscribing.
  const replaceSimulation = simulation.replace
  const [bpmnProfileActive, setBpmnProfileActive] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [selectedEmoji, setSelectedEmoji] = useState('👍')
  const [snapGrid, setSnapGrid] = useState(uiPrefs.snapGrid)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  // Mirrors the UndoManager stacks. Kept in state so the toolbar buttons do not
  // read the manager ref while rendering.
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false })
  const [showMiniMap, setShowMiniMap] = useState(uiPrefs.showMiniMap)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchIndex, setSearchIndex] = useState(0)
  const [searchFocusNonce, setSearchFocusNonce] = useState(0)
  const [alignGuides, setAlignGuides] = useState<Guide[]>([])
  const [laserPos, setLaserPos] = useState<Point | null>(null)
  const chooseTool = useCallback((nextTool: Tool) => {
    setTool(nextTool)
    if (nextTool === 'arrow') setArrowHead('triangle')
    if (nextTool === 'line') setArrowHead('none')
    if (nextTool !== 'bpmnSequence') {
      setBpmnFlowSourceId(null)
      setFlowPreviewPoint(null)
    }
  }, [])
  // Drag state. One gesture moves the whole selection, so it carries the start
  // frame of every dragged element instead of a single one.
  //
  // Refs rather than state: nothing renders from them, and reading gesture
  // geometry from state made the outcome depend on whether React had committed
  // the pointermove renders before pointerup arrived — a flick released inside
  // one frame finished with the pointerdown geometry and silently did nothing
  // (see src/board/gesture.ts).
  const dragInfoRef = useRef<DragInfo | null>(null)
  // Resize state
  const resizeInfoRef = useRef<ResizeInfo | null>(null)
  const rotateInfoRef = useRef<RotateInfo | null>(null)
  // Gesture frames stay local until pointer-up, preventing one Yjs item rewrite
  // (and one gc:false tombstone) per pointer event.
  const [transientFrame, setTransientFrame] = useState<{ id: string; updates: Partial<BoardElement> }[] | null>(null)
  const transientFrameRef = useRef<{ id: string; updates: Partial<BoardElement> }[] | null>(null)
  // Marquee selection in world coordinates; Shift extends the current selection.
  const [marquee, setMarquee] = useState<Bounds | null>(null)
  const marqueeRef = useRef<{ from: Point; shift: boolean } | null>(null)
  const longPressRef = useRef<{ timer: number | null; x: number; y: number; startedAt: number } | null>(null)
  const bpmnImportRef = useRef<HTMLInputElement>(null)
  const bpmnRunTimersRef = useRef<number[]>([])
  // Yjs
  const ydoc = useMemo(() => new Y.Doc({ gc: false }), [])
  const yElements = useRef<Y.Array<BoardElement> | null>(null)
  const dirtyTrackerRef = useRef<DirtyTracker | null>(null)
  const captureTriggersRef = useRef<CaptureTriggers | null>(null)
  const historySnapshotsRef = useRef<HistorySnapshot[]>([])
  const compactHistoryOnSaveRef = useRef(false)
  const undoManagerRef = useRef<Y.UndoManager | null>(null)
  const profileConfigRef = useRef<Y.Map<unknown> | null>(null); const profileConfigJsonRef = useRef(''); const profileConfigHydratingRef = useRef(false)
  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast({ message, tone })
    window.setTimeout(() => setToast(null), 4200)
  }, [])
  const appendCheckpoint = useCallback((kind: HistorySnapshot['kind'], label?: string, at?: string) => {
    const checkpoint = captureSnapshot(ydoc, kind, label, at)
    historySnapshotsRef.current = [...historySnapshotsRef.current, checkpoint]
    setHistorySnapshots(historySnapshotsRef.current)
    return checkpoint
  }, [ydoc])
  const exitPreview = useCallback(() => {
    setPreviewSnapshot(null)
    setPreviewElements(null)
    setSelectedIds(clearSelection())
    setEditingText(null)
    transientFrameRef.current = null
    setTransientFrame(null)
  }, [])
  const closeTimeline = useCallback(() => {
    setShowTimeline(false)
    exitPreview()
  }, [exitPreview])
  const selectSnapshot = useCallback((snapshot: HistorySnapshot) => {
    const historical = readSnapshot<BoardElement>(ydoc, snapshot)
    setPreviewSnapshot(snapshot)
    setPreviewElements(historical)
    setShowSimulationPanel(false)
    setSelectedIds(clearSelection())
    setEditingText(null)
    setShowMore(false)
    setShowColorPicker(false)
    setShowEmoji(false)
    setShowBpmnPalette(false)
    chooseTool('pan')
    setShowTimeline(true)
  }, [chooseTool, ydoc])
  const restorePreview = useCallback(() => {
    if (!previewSnapshot) return; appendCheckpoint('restore-transition'); undoManagerRef.current?.stopCapturing()
    restoreSnapshot<BoardElement>(ydoc, previewSnapshot); dirtyTrackerRef.current?.markDirty(); exitPreview(); showToast('Состояние восстановлено', 'success')
  }, [appendCheckpoint, exitPreview, previewSnapshot, showToast, ydoc])
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
  const compactHistory = useCallback(() => { historySnapshotsRef.current = []; setHistorySnapshots([]); compactHistoryOnSaveRef.current = true; showToast('Контрольные точки удалены. Сохраните документ, чтобы уменьшить его размер.', 'success') }, [showToast])
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
    const resourceRoles = Object.entries(simulation.rolePolicies)
      .filter(([name]) => nodes.some((node) => node.resourceRole === name))
      .map(([name, policy]) => ({
        name,
        capacity: Math.max(1, Number(policy.capacity) || 1),
        queuePolicy: policy.queuePolicy,
      }))
    return {
      nodes,
      flows,
      slaTargetMs: simulation.slaTargetSec ? Number(simulation.slaTargetSec) * 1000 : undefined,
      calendarWorkStartMs: simulation.calendarStartHour ? Number(simulation.calendarStartHour) * 3_600_000 : undefined,
      calendarWorkEndMs: simulation.calendarEndHour ? Number(simulation.calendarEndHour) * 3_600_000 : undefined,
      simulationInstances: Number(simulation.instances) || 1,
      arrivalIntervalMs: Math.max(0, Number(simulation.arrivalIntervalSec) || 0) * 1000,
      arrivalClasses: simulation.arrivalClasses.map((arrivalClass) => ({
        count: Math.max(1, Number(arrivalClass.count) || 1),
        intervalMs: Math.max(0, Number(arrivalClass.intervalSec) || 0) * 1000,
        priority: Number(arrivalClass.priority) || 0,
      })),
      resourceRoles,
    }
  }, [elements, simulation.slaTargetSec, simulation.calendarStartHour, simulation.calendarEndHour, simulation.instances, simulation.arrivalIntervalSec, simulation.arrivalClasses, simulation.rolePolicies])
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
    () => JSON.stringify({ model: createSimulationBpmnModel(), seed: simulation.seed, runs: simulation.runs }),
    [createSimulationBpmnModel, simulation.seed, simulation.runs],
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
    () => elements.find((element) => element.id === selectedElementId && element.bpmnNodeType === 'task') ?? null,
    [elements, selectedElementId],
  )
  const selectedBpmnFlow = useMemo(
    () => elements.find((element) => element.id === selectedElementId && element.bpmnFlow) ?? null,
    [elements, selectedElementId],
  )
  // Boolean, not `boolean | undefined`: the old expression short-circuited to
  // undefined for a flow without bpmnFlow, which read as false everywhere it was
  // used but is not assignable to a boolean prop.
  const selectedBpmnFlowIsXor = useMemo(
    () => Boolean(selectedBpmnFlow?.bpmnFlow && elements.find((element) => element.id === selectedBpmnFlow.bpmnFlow!.sourceId)?.bpmnNodeType === 'xorGateway'),
    [elements, selectedBpmnFlow],
  )
  // Local participant profile. Device-scoped and fail-soft: it carries the
  // author id that `createdBy` on every node already stores, plus the name and
  // colour a collaboration session will publish through awareness.
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const profile = readProfile(localStorage, genId)
    writeProfile(localStorage, profile)
    return profile
  })
  const [showProfile, setShowProfile] = useState(false)
  const updateUserProfile = useCallback((next: UserProfile) => {
    setUserProfile(next)
    writeProfile(localStorage, next)
  }, [])
  useEffect(() => {
    writeUiPreferences(localStorage, { darkMode, snapGrid, showMiniMap, color, strokeWidth, lineDash, arrowHead })
  }, [darkMode, snapGrid, showMiniMap, color, strokeWidth, lineDash, arrowHead])
  useEffect(() => {
    const yarray = ydoc.getArray<BoardElement>('elements')
    const meta = ydoc.getMap<unknown>('meta')
    const profileConfig = ydoc.getMap<unknown>('profileConfig')
    yElements.current = yarray
    // NON_EDIT_ORIGINS rather than the tracker's default: opening a document is
    // labelled LOAD, and a load must not report unsaved changes.
    dirtyTrackerRef.current = createDirtyTracker(ydoc, setIsDirty, NON_EDIT_ORIGINS)
    captureTriggersRef.current = createCaptureTriggers({
      ydoc,
      capture: appendCheckpoint,
      // The same rule as the dirty tracker above, from the same place: opening
      // a file is not an edit. This set used to be spelled out by hand without
      // LOAD, so opening a document counted as an edit and the interval timer
      // then wrote an "Авто" checkpoint for a board nobody had touched.
      ignoredOrigins: NON_EDIT_ORIGINS,
    })
    profileConfigRef.current = profileConfig
    if (!meta.has('id')) {
      ydoc.transact(() => {
        meta.set('id', legacyDocumentIdFromCurrentUrl() ?? `doc_${genId()}`)
        meta.set('createdAt', new Date().toISOString())
      }, RECOVERY_ORIGIN)
    }
    const applyProfileConfig = (_event?: unknown, transaction?: Y.Transaction) => {
      const config = profileConfig.toJSON() as ProfileConfig
      profileConfigJsonRef.current = JSON.stringify(config)
      const incoming = bpmnSimulationFromProfileConfig(config)
      setBpmnProfileActive(incoming !== null)
      if (!incoming) {
        setWorkspaceMode('board')
        setShowSimulationPanel(false)
        return
      }
      // Any non-edit origin means the config arrived with the document rather
      // than from the user: a file open (LOAD), the recovery cache replaying
      // itself, or an applied history restore. Hydrating the simulation inputs
      // from it must not echo back as a profileConfig write, or a freshly saved
      // document turns dirty again the moment these setState calls settle.
      //
      // This used to test RECOVERY_ORIGIN alone, which was complete until file
      // opens were relabelled LOAD; NON_EDIT_ORIGINS keeps the rule in one place
      // (src/collab/origins.ts) so the next origin added cannot miss this site.
      profileConfigHydratingRef.current = NON_EDIT_ORIGINS.has(transaction?.origin)
      replaceSimulation(incoming)
    }
    profileConfig.observe(applyProfileConfig)
    applyProfileConfig()
    // UndoManager
    const undoManager = new Y.UndoManager(yarray, {
      captureTimeout: 500,
      // Only this user's own intent is undoable. Remote updates arrive with
      // the provider instance as origin and stay out of the stack; loads and
      // recovery replays are excluded by NON_EDIT_ORIGINS semantics.
      // HISTORY_RESTORE_ORIGIN stays tracked so restore-as-append remains
      // reversible, which is the documented behaviour of the timeline.
      trackedOrigins: new Set<unknown>([...LOCAL_ORIGINS, HISTORY_RESTORE_ORIGIN]),
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
      const adoption = await adoptLegacyRooms(); const failedCurrentLegacyRoom = adoption.failed.find(roomId => id === `doc_${roomId}`); if (failedCurrentLegacyRoom) { showToast(`Не удалось восстановить прежнюю доску «${failedCurrentLegacyRoom}». Исходные данные не изменены.`, 'error'); return }
      if (disposed) return
      const result = await attachRecoveryCache(id, ydoc)
      if (disposed) {
        result.persistence?.destroy()
        return
      }
      persistence = result.persistence
      if (result.synced) {
        const inspection = inspectRecoverySession(meta, yarray.toJSON(), profileConfig.toJSON())
        if (inspection) { setFileSession(current => current.name ? current : { handle: null, name: inspection.session.fileName, isUntitled: false }); setRecoveryNotice(inspection.diverges ? inspection.message : null); if (inspection.diverges) { dirtyTrackerRef.current?.markDirty(); showToast(inspection.message, 'error') } }
      }
    }
    void attachPersistence()
    // Sync
    const updateElements = () => {
      const next = yarray.toArray()
      setElements(next)
      // Elements can vanish without this component asking: undo/redo, a file
      // load, a history restore and (later) a remote peer's delete. Drop stale
      // ids so panels and gestures never point at a missing element.
      const ids = new Set(next.map(element => element.id))
      setSelectedIds(current => retainExisting(current, ids))
      // The context menu is anchored to one element in world coordinates, so a
      // vanished element leaves it hovering over empty canvas with actions that
      // silently do nothing (the command layer refuses unknown ids).
      setContextMenu(current => (current && !ids.has(current.id) ? null : current))
    }
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
  }, [appendCheckpoint, replaceSimulation, showToast, ydoc])
  useEffect(() => {
    return addBeforeUnloadGuard(isDirty)
  }, [isDirty])
  // Identical to the draft by construction: SimulationSettings holds exactly the
  // SimulationDraft shape, so there is nothing left to assemble here.
  const simulationProfile = simulation.draft
  useEffect(() => {
    if (!bpmnProfileActive || !profileConfigRef.current) return
    if (profileConfigHydratingRef.current) { profileConfigHydratingRef.current = false; return }
    const config = withBpmnSimulation({}, simulationProfile)
    const encoded = JSON.stringify(config)
    if (encoded === profileConfigJsonRef.current) return
    profileConfigJsonRef.current = encoded
    ydoc.transact(() => profileConfigRef.current!.set('bpmn', config.bpmn), LOCAL_EDIT)
  }, [bpmnProfileActive, simulationProfile, ydoc])
  const activateBpmnProfile = useCallback(() => {
    if (profileConfigRef.current && !bpmnProfileActive) {
      // Learning modules populate the drafts before opening Simulation. Promote
      // those drafts into the document profile instead of replacing them with
      // defaults, so fixture arrival classes and role policies survive activation.
      const config = withBpmnSimulation({}, simulationProfile)
      profileConfigJsonRef.current = JSON.stringify(config)
      ydoc.transact(() => profileConfigRef.current!.set('bpmn', config.bpmn), LOCAL_EDIT)
    }
    setBpmnProfileActive(true)
    setWorkspaceMode('bpmn')
    setShowBpmnPalette(true)
  }, [bpmnProfileActive, simulationProfile, ydoc])
  const openSimulation = useCallback(() => { if (previewSnapshot) return void showToast('Симуляция недоступна во время просмотра истории.', 'info'); if (!bpmnProfileActive) activateBpmnProfile(); setWorkspaceMode('simulation'); setShowSimulationPanel(true) }, [activateBpmnProfile, bpmnProfileActive, previewSnapshot, showToast])
  /**
   * Writes an in-flight gesture to the document.
   *
   * A drag or resize lives in `transientFrame` until pointerup, so anything
   * that reads the document mid-gesture sees the pre-drag position. Saving is
   * the case that matters: Ctrl+S during a drag wrote the old coordinates to
   * disk while the screen showed the new ones.
   */
  const flushGesture = useCallback(() => {
    const frame = transientFrameRef.current
    if (!frame?.length || !yElements.current) return
    ydoc.transact(() => {
      for (const item of frame) commitElementUpdate(ydoc, yElements.current!, item.id, item.updates)
    }, LOCAL_GESTURE)
    transientFrameRef.current = null
    setTransientFrame(null)
  }, [ydoc])

  const saveBoard = useCallback(async (mode: 'save' | 'saveAs'): Promise<boolean> => {
    if (previewSnapshot) { showToast('Недоступно во время просмотра истории.', 'info'); return false }
    // Land any in-flight drag first, so the file matches the screen.
    flushGesture()
    const metaMap = ydoc.getMap<unknown>('meta')
    const metaId = metaMap.get('id')
    const metaTitle = metaMap.get('title')
    const metaCreatedAt = metaMap.get('createdAt')
    const now = new Date().toISOString()
    // The checkpoint is captured before serialisation, so the saved timeline's
    // newest entry is precisely the state that was written to disk.
    if (!compactHistoryOnSaveRef.current) captureTriggersRef.current?.captureNow('auto', undefined, now)
    const meta: DocMeta = {
      id: typeof metaId === 'string' ? metaId : `doc_${genId()}`,
      title: typeof metaTitle === 'string' ? metaTitle : 'Untitled board',
      createdAt: typeof metaCreatedAt === 'string' ? metaCreatedAt : now,
      updatedAt: now,
      createdWith: { version: __MIROBOARD_VERSION__, commit: __MIROBOARD_HISTORY__[0]?.commit ?? 'local' },
      profiles: [],
    }
    const untrimmedHistory: DocHistory = {
      yjsState: compactHistoryOnSaveRef.current ? null : yElements.current ? toBase64(Y.encodeStateAsUpdate(ydoc)) : null,
      snapshots: historySnapshotsRef.current,
      retention: DEFAULT_RETENTION,
    }
    const initialFile = serialise({
      elements: yElements.current?.toArray() ?? elements,
      meta,
      profileConfig: (profileConfigRef.current?.toJSON() ?? {}) as ProfileConfig,
      history: untrimmedHistory,
    })
    const currentStateBytes = new TextEncoder().encode(JSON.stringify({ nodes: initialFile.nodes, edges: initialFile.edges })).byteLength
    const history = retainForSave(untrimmedHistory, currentStateBytes, DEFAULT_RETENTION)
    historySnapshotsRef.current = history.snapshots
    setHistorySnapshots(history.snapshots)
    const file = serialise({ ...initialFile, history, elements: yElements.current?.toArray() ?? elements })
    const outcome = await saveDocument(file, fileSession, mode)
    if (outcome.kind === 'saved') {
      compactHistoryOnSaveRef.current = false
      setFileSession(outcome.session)
      ydoc.transact(() => {
        metaMap.set('title', file.meta.title)
        metaMap.set('updatedAt', now)
        setRecoverySession(metaMap, createRecoverySession(outcome.session.name ?? file.meta.title, yElements.current?.toJSON() ?? elements, profileConfigRef.current?.toJSON() ?? {}))
      }, RECOVERY_ORIGIN)
      setRecoveryNotice(null)
      dirtyTrackerRef.current?.markSaved()
      showToast('Документ сохранён', 'success')
      return true
    } else if (outcome.kind === 'cancelled') {
      showToast('Сохранение отменено', 'info')
    } else if (outcome.kind === 'failed') {
      showToast('Не удалось сохранить документ. Проверьте доступ к файлу.', 'error')
    }
    return false
  }, [elements, fileSession, flushGesture, previewSnapshot, showToast, ydoc])
  const resetDocument = useCallback(() => { if (isDirty && !window.confirm('Несохраненные изменения будут потеряны. Продолжить?')) return
    const meta = ydoc.getMap<unknown>('meta')
    const profileConfig = ydoc.getMap<unknown>('profileConfig')
    ydoc.transact(() => {
      yElements.current?.delete(0, yElements.current.length)
      meta.clear()
      meta.set('id', `doc_${genId()}`)
      meta.set('createdAt', new Date().toISOString())
      profileConfig.clear()
    }, RECOVERY_ORIGIN)
    setFileSession({ handle: null, name: null, isUntitled: true }); setRecoveryNotice(null)
    historySnapshotsRef.current = []
    setHistorySnapshots([])
    setSelectedIds(clearSelection())
    setWorkspaceMode('board')
    setBpmnProfileActive(false)
    dirtyTrackerRef.current?.markSaved()
    showToast('Создан новый документ', 'success')
  }, [isDirty, showToast, ydoc])
  const applyOpenOutcome = useCallback((outcome: Extract<OpenOutcome, { kind: 'opened' }>) => {
    const reconstructed = loadIntoDoc(outcome.file)
    const loadedElements = reconstructed.ydoc.getArray<BoardElement>('elements').toArray()
    const meta = ydoc.getMap<unknown>('meta')
    const profileConfig = ydoc.getMap<unknown>('profileConfig')
    ydoc.transact(() => {
      yElements.current?.delete(0, yElements.current.length)
      if (!reconstructed.historyLost && outcome.file.history.yjsState) Y.applyUpdate(ydoc, fromBase64(outcome.file.history.yjsState), RECOVERY_ORIGIN)
      else if (loadedElements.length) yElements.current?.push(loadedElements)
      meta.clear()
      Object.entries(outcome.file.meta).forEach(([key, value]) => meta.set(key, value))
      profileConfigJsonRef.current = JSON.stringify(outcome.file.profileConfig); profileConfig.clear()
      Object.entries(outcome.file.profileConfig).forEach(([key, value]) => profileConfig.set(key, value))
      setRecoverySession(meta, createRecoverySession(outcome.session.name ?? outcome.file.meta.title, yElements.current?.toJSON() ?? loadedElements, profileConfig.toJSON()))
      // LOAD rather than RECOVERY_ORIGIN: opening a file is not a recovery.
      // Both are non-edit origins, but the distinction is what authorship and
      // remote sync will key off later.
    }, LOAD)
    setFileSession(outcome.session); setRecoveryNotice(null)
    const snapshots = reconstructed.historyLost ? [] : outcome.file.history.snapshots
    historySnapshotsRef.current = snapshots
    setHistorySnapshots(snapshots)
    setSelectedIds(clearSelection())
    dirtyTrackerRef.current?.markSaved()
    showToast(
      outcome.migratedFrom === undefined
        ? `Открыт документ «${outcome.session.name}»`
        : `Открыт документ «${outcome.session.name}». Схема обновлена с v${outcome.migratedFrom} до v1`,
      'success',
    )
    if (reconstructed.historyLost) showToast('История документа повреждена. Текущий контент восстановлен, история потеряна.', 'error')
    reconstructed.ydoc.destroy()
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
    if (previewSnapshot) return void showToast('Недоступно во время просмотра истории.', 'info')
    await requestOpen(async () => {
      const outcome = await openDocument()
      if (outcome.kind === 'opened') applyOpenOutcome(outcome)
      else if (outcome.kind === 'failed') showOpenFailure(outcome)
    })
  }, [applyOpenOutcome, previewSnapshot, requestOpen, showOpenFailure, showToast])
  const loadDroppedBoard = useCallback(async (transfer: DataTransfer) => {
    if (previewSnapshot) return void showToast('Недоступно во время просмотра истории.', 'info')
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
  }, [applyOpenOutcome, previewSnapshot, requestOpen, showOpenFailure, showToast])
  const { isDropTarget, onDragEnter, onDragOver, onDragLeave, onCanvasDrop } = useFileDrop(loadDroppedBoard)
  // ======================== HELPERS ========================

  const screenToWorld = useCallback((sx: number, sy: number): Point => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return toWorld(transform, rect, sx, sy)
  }, [transform])
  const addElement = useCallback((el: BoardElement, origin: unknown = LOCAL_EDIT) => {
    if (previewSnapshot || !yElements.current) return
    commands.addElement(ydoc, yElements.current, el, origin)
    if ('vibrate' in navigator) navigator.vibrate(10)
  }, [previewSnapshot, ydoc])

  const updateElement = useCallback((id: string, updates: Partial<BoardElement>, origin: unknown = LOCAL_EDIT) => {
    if (previewSnapshot || !yElements.current) return
    commands.updateElement(ydoc, yElements.current, id, updates, origin)
  }, [previewSnapshot, ydoc])
  /** Selection helpers. Defined next to the mutators they drive. */
  const selectElement = useCallback((id: string) => setSelectedIds(selectOnly(id)), [])
  const clearSelectionState = useCallback(() => setSelectedIds(clearSelection()), [])
  const selectElements = useCallback((ids: string[]) => setSelectedIds(ids.length ? selectMany(ids) : clearSelection()), [])
  const removeIdFromSelection = useCallback((id: string) => {
    setSelectedIds(current => removeFromSelection(current, id))
    setAnchorId(current => (current === id ? null : current))
  }, [])
  const deleteElement = useCallback((id: string) => {
    if (previewSnapshot || !yElements.current) return
    if (!commands.deleteElement(ydoc, yElements.current, id)) return
    removeIdFromSelection(id)
    setContextMenu(null)
  }, [previewSnapshot, ydoc, removeIdFromSelection])
  const deleteSelected = useCallback(() => {
    if (previewSnapshot || !yElements.current) return
    if (!commands.deleteElements(ydoc, yElements.current, selectedIds)) return
    clearSelectionState()
    setContextMenu(null)
  }, [previewSnapshot, ydoc, selectedIds, clearSelectionState])
  /**
   * One transaction for the whole selection. This looped over updateElement,
   * which made recolouring eight elements eight undo steps and eight
   * checkpoints.
   */
  const updateSelected = useCallback((updates: Partial<BoardElement>, origin: unknown = LOCAL_EDIT) => {
    if (previewSnapshot || !yElements.current) return
    commands.updateElements(ydoc, yElements.current, selectedIds, updates, origin)
  }, [selectedIds, previewSnapshot, ydoc])

  /**
   * Restyles the selected arrow or line and remembers the choice for the next
   * one. Solid deletes the dash key; the head is the element type, so a
   * connector stays on its anchors either way.
   */
  const applyStrokeStyle = useCallback((patch: { arrowHead?: ArrowHead; dash?: LineDash; stroke?: number }) => {
    if (previewSnapshot || !yElements.current || !selectedElementId) return
    commands.setStrokeStyle(ydoc, yElements.current, [selectedElementId], patch)
    if (patch.dash) setLineDash(patch.dash)
    if (patch.arrowHead) setArrowHead(patch.arrowHead)
    if (patch.stroke !== undefined) setStrokeWidth(patch.stroke)
  }, [previewSnapshot, selectedElementId, ydoc])

  /**
   * One shared edge or center for the selection. A group is one body, a lock
   * stays and defines the edge, and a connector is not a unit. Already flush
   * is not an undo step.
   */
  const alignSelection = useCallback((axis: AlignAxis) => {
    if (previewSnapshot || !yElements.current) return
    flushGesture()
    const changed = commands.alignElements(ydoc, yElements.current, selectedIds, axis)
    if (!changed) showToast('Нечего выравнивать', 'info')
  }, [flushGesture, previewSnapshot, selectedIds, showToast, ydoc])

  /**
   * Paint order is the array, so the whole selection moves as one block.
   * Already the front or the back is not an undo step.
   */
  const restackSelection = useCallback((ids: readonly string[], edge: 'front' | 'back') => {
    if (previewSnapshot || !yElements.current) return
    const changed = commands.restackElements(ydoc, yElements.current, ids, edge)
    if (!changed) showToast(edge === 'front' ? 'Уже на переднем плане' : 'Уже на заднем плане', 'info')
  }, [previewSnapshot, showToast, ydoc])
  /**
   * Duplicates the whole selection. The offset grows with the copy index so
   * duplicating three overlapping objects does not stack them into one.
   * Returns the new ids so callers can select the copies.
   */
  const duplicateSelection = useCallback((origin?: unknown): string[] => {
    if (previewSnapshot || !yElements.current) return []
    // Read the document, not the last render: a shortcut can land mid-drag,
    // after flushGesture has written positions the React state has not seen.
    const live = yElements.current.toArray()
    return commands.duplicateElements(ydoc, yElements.current, expandIds(live, selectedIds), genId, origin ?? LOCAL_EDIT, userProfile.id)
  }, [selectedIds, previewSnapshot, ydoc, userProfile.id])

  /**
   * Nudges the whole selection in ONE transaction. Arrow keys used to commit
   * per element, which made an 8-element nudge 8 undo steps and 8 checkpoints.
   */
  const moveSelection = useCallback((delta: { x: number; y: number }) => {
    if (previewSnapshot || !yElements.current) return
    const live = yElements.current.toArray()
    commands.moveElements(ydoc, yElements.current, expandIds(live, selectedIds), delta)
  }, [selectedIds, previewSnapshot, ydoc])

  /**
   * Locks or unlocks the named elements. Unlock deletes the key, so the file
   * only grows a `locked` field while the object is actually locked.
   */
  const applyLock = useCallback((ids: readonly string[], locked: boolean) => {
    if (previewSnapshot || !yElements.current) return
    const live = yElements.current.toArray()
    const lockable = ids.filter(id => {
      const element = live.find(candidate => candidate.id === id)
      return Boolean(element && !element.bpmnFlow)
    })
    const changed = commands.setLocked(ydoc, yElements.current, lockable, locked)
    if (changed) showToast(locked ? 'Заблокировано' : 'Разблокировано', 'success')
  }, [previewSnapshot, showToast, ydoc])

  /** Ctrl+G. One transaction, one token, no container element. */
  const groupSelection = useCallback(() => {
    if (previewSnapshot || !yElements.current) return
    const plan = planGroup(elements, selectedIds, `grp_${genId()}`)
    if (plan.kind === 'too-small') {
      showToast('Для группы нужно хотя бы два объекта', 'info')
      return
    }
    if (plan.kind === 'already') {
      showToast('Уже одна группа', 'info')
      return
    }
    commands.writeGroupMembership(ydoc, yElements.current, plan.writes)
    showToast('Сгруппировано', 'success')
  }, [elements, previewSnapshot, selectedIds, showToast, ydoc])

  /** Ctrl+Shift+G. Clears every member of each group the selection touches. */
  const ungroupSelection = useCallback(() => {
    if (previewSnapshot || !yElements.current) return
    const writes = planUngroup(elements, selectedIds)
    if (!writes.length) {
      showToast('Выделение не в группе', 'info')
      return
    }
    commands.writeGroupMembership(ydoc, yElements.current, writes)
    showToast('Группа снята', 'success')
  }, [elements, previewSnapshot, selectedIds, showToast, ydoc])

  /**
   * The in-memory clipboard. A `file://` deployment — the primary way this app
   * is shipped — usually has no clipboard permission at all, so the internal
   * copy is the source of truth and the system clipboard is what makes
   * cross-tab paste work when it is available.
   */
  const internalClipboardRef = useRef<string | null>(null)

  /** Ctrl+C. Returns how many elements were copied, so the caller knows whether to take over the shortcut. */
  const copySelection = useCallback((): number => {
    const source = yElements.current?.toArray() ?? elements
    const wanted = new Set(expandIds(source, selectedIds))
    const picked = source.filter(element => wanted.has(element.id))
    if (!picked.length) return 0
    const payload = serialiseSelection(picked)
    internalClipboardRef.current = payload
    void navigator.clipboard?.writeText(payload).catch(() => undefined)
    return picked.length
  }, [elements, selectedIds])

  /** Ctrl+V: one transaction for the whole paste, labelled as a clipboard write. */
  const pasteFromClipboard = useCallback(async () => {
    if (previewSnapshot) return
    let raw = internalClipboardRef.current
    try {
      const text = await navigator.clipboard?.readText()
      // Another tab holds a newer payload than our in-memory copy.
      if (text && parseClipboard(text)) raw = text
    } catch {
      // Denied or unavailable — the internal copy still works.
    }
    const parsed = parseClipboard(raw)
    if (!parsed?.length) {
      showToast('В буфере обмена нет объектов miroboard', 'info')
      return
    }
    const created = preparePaste(parsed, {
      makeId: () => genId(),
      offset: { x: PASTE_OFFSET, y: PASTE_OFFSET },
      createdBy: userProfile.id,
    })
    ydoc.transact(() => {
      for (const element of created) yElements.current?.push([element])
    }, LOCAL_CLIPBOARD)
    setSelectedIds(selectMany(created.map(element => element.id)))
    setAnchorId(created[created.length - 1]?.id ?? null)
    showToast(`Вставлено объектов: ${created.length}`, 'success')
  }, [previewSnapshot, ydoc, userProfile.id, showToast])

  /** Ctrl+X: copy, then delete — the deletion stays a single undo step of its own. */
  const cutSelection = useCallback(() => {
    if (!copySelection()) return
    deleteSelected()
  }, [copySelection, deleteSelected])

  const handleContextMenuAction = useCallback((action: ContextMenuAction, id: string) => {
    // Right-clicking a member of a multi-selection applies to the selection,
    // which is what every canvas editor does and what users expect.
    const targets = selectedIds.has(id) ? idsOf(selectedIds) : [id]
    if (action === 'edit') {
      const element = elements.find(candidate => candidate.id === id)
      if (element) {
        setEditingText(element.id)
        setEditValue(element.text || '')
      }
    } else if (action === 'duplicate') {
      if (targets.length > 1) setSelectedIds(selectMany(duplicateSelection()))
      else duplicateSelection()
    } else if (action === 'front' || action === 'back') {
      restackSelection(targets, action)
    } else if (action === 'lock') {
      const live = yElements.current?.toArray() ?? elements
      const kind = selectionLockAction(live, new Set(targets))
      if (kind) applyLock(targets, kind === 'lock')
    } else if (targets.length > 1) {
      deleteSelected()
    } else {
      deleteElement(id)
    }
    setContextMenu(null)
  }, [elements, selectedIds, duplicateSelection, restackSelection, deleteElement, deleteSelected, applyLock])

  const { canUndo, canRedo } = undoState

  const handleUndo = useCallback(() => {
    if (previewSnapshot) return
    undoManagerRef.current?.undo()
  }, [previewSnapshot])

  const handleRedo = useCallback(() => {
    if (previewSnapshot) return
    undoManagerRef.current?.redo()
  }, [previewSnapshot])

  const applyTemplate = useCallback((name: string) => {
    if (!yElements.current) return
    // Clear existing
    ydoc.transact(() => {
      while (yElements.current!.length > 0) yElements.current!.delete(0, 1)
      const t: BoardElement[] = []
      const s = (text: string, x: number, y: number, w = 160, h = 60, fill = '#FFD93D') =>
        ({ id: genId(), type: 'sticky' as const, x, y, w, h, text, color: fill, fill, createdBy: userProfile.id })

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
        t.push({ id: genId(), type: 'arrow', x: 310, y: 70, w: 0, h: 60, color: '#000', stroke: 2, fill: 'transparent', createdBy: userProfile.id })
        t.push(s('Шаг 1', 230, 140, 160, 60, '#4D96FF'))
        t.push({ id: genId(), type: 'arrow', x: 310, y: 200, w: 0, h: 60, color: '#000', stroke: 2, fill: 'transparent', createdBy: userProfile.id })
        t.push(s('Шаг 2', 230, 270, 160, 60, '#FFD93D'))
        t.push({ id: genId(), type: 'arrow', x: 310, y: 330, w: 0, h: 60, color: '#000', stroke: 2, fill: 'transparent', createdBy: userProfile.id })
        t.push(s('Результат', 230, 400, 160, 60, '#9D65C9'))
      } else if (name === 'bpmn') {
        const startId = genId()
        const taskId = genId()
        const endId = genId()
        t.push({ id: startId, type: 'sticky', x: 80, y: 180, w: 86, h: 56, text: 'Старт', color: '#6BCB77', fill: '#6BCB77', createdBy: userProfile.id, bpmnNodeType: 'startEvent' })
        t.push({ id: taskId, type: 'sticky', x: 250, y: 170, w: 180, h: 76, text: 'Выполнить задачу', color: '#4D96FF', fill: '#4D96FF', createdBy: userProfile.id, bpmnNodeType: 'task' })
        t.push({ id: endId, type: 'sticky', x: 510, y: 180, w: 86, h: 56, text: 'Конец', color: '#FF5D5D', fill: '#FF5D5D', createdBy: userProfile.id, bpmnNodeType: 'endEvent' })
        t.push({ id: genId(), type: 'arrow', x: 166, y: 208, w: 84, h: 0, color: '#000', stroke: 2, fill: 'transparent', createdBy: userProfile.id, bpmnFlow: { sourceId: startId, targetId: taskId } })
        t.push({ id: genId(), type: 'arrow', x: 430, y: 208, w: 80, h: 0, color: '#000', stroke: 2, fill: 'transparent', createdBy: userProfile.id, bpmnFlow: { sourceId: taskId, targetId: endId } })
      }
      t.forEach(el => yElements.current!.push([el]))
    }, LOCAL_TEMPLATE)
    setShowTemplates(false)
    setTransform({ x: 0, y: 0, scale: 1 })
  }, [ydoc, userProfile.id])

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
    if (previewSnapshot) return void showToast('Симуляция недоступна во время просмотра истории.', 'info')
    try {
      const runs = Number(simulation.runs)
      if (!Number.isInteger(runs) || runs < 1 || runs > 10000) throw new Error('Количество прогонов должно быть целым числом от 1 до 10000.')
      const result = JSON.parse(simulate_bpmn_seed_string(JSON.stringify(createSimulationBpmnModel()), simulation.seed, runs)) as BpmnSimulationResult
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
  }, [createSimulationBpmnModel, previewSnapshot, simulationFingerprint, simulation.runs, simulation.seed, showToast])
  const visibleSimulationResult = !previewSnapshot && simulationResultFingerprint === simulationFingerprint ? bpmnSimulationResult : null
  const visibleSimulationSummary = !previewSnapshot && simulationResultFingerprint === simulationFingerprint ? bpmnSimulationSummary : null
  const visibleBottleneckRole = !previewSnapshot && simulationResultFingerprint === simulationFingerprint ? bottleneckRole : null
  const traceFrontier = useCallback(() => {
    if (previewSnapshot) return void showToast('Симуляция недоступна во время просмотра истории.', 'info')
    const model = createSimulationBpmnModel()
    const role = frontierRole(model, bottleneckRole)
    if (!role) {
      setFrontierTrace(null)
      showToast('Нет роли ресурса: фронтир сравнивает мощность, а не рисунок.', 'info')
      return
    }
    const requested = Number(simulation.runs)
    if (!Number.isInteger(requested) || requested < 1 || requested > 10000) {
      showToast('Количество прогонов должно быть целым числом от 1 до 10000.', 'error')
      return
    }
    const runs = frontierRuns(requested)
    try {
      const samples = sweepCapacities(roleCapacity(model, role)).map(capacity => {
        const result = JSON.parse(simulate_bpmn_seed_string(
          JSON.stringify(withRoleCapacity(model, role, capacity)),
          simulation.seed,
          runs,
        )) as BpmnSimulationResult
        return {
          capacity,
          meanDurationMs: result.meanDurationMs,
          p95DurationMs: result.p95DurationMs,
          meanCost: result.meanCost,
          onTimeRate: result.onTimeRate,
        }
      })
      const points = markFrontier(samples)
      setFrontierTrace({
        fingerprint: simulationFingerprint,
        role,
        advice: frontierAdvice(role, points, model.slaTargetMs),
        runs,
        points,
      })
    } catch (error) {
      setFrontierTrace(null)
      showToast(error instanceof Error ? error.message : 'Не удалось построить фронтир.', 'error')
    }
  }, [bottleneckRole, createSimulationBpmnModel, previewSnapshot, simulation.runs, simulation.seed, simulationFingerprint, showToast])
  const visibleFrontier = !previewSnapshot && frontierTrace?.fingerprint === simulationFingerprint ? frontierTrace : null
  const applyFrontierCapacity = useCallback((capacity: number) => {
    const role = visibleFrontier?.role
    if (!role) return
    simulation.setRolePolicies(current => ({
      ...current,
      [role]: { capacity: String(capacity), queuePolicy: current[role]?.queuePolicy ?? 'fifo' },
    }))
    showToast(`Мощность «${role}»: ${capacity}. Фронтир нужно построить заново.`, 'success')
  }, [showToast, simulation.setRolePolicies, visibleFrontier?.role])
  /**
   * The BPMN validity badge describes the live document, which is not what a
   * history preview has on screen. Hiding it there matches the simulation
   * summaries just above, which are already blanked for the same reason.
   */
  const showBpmnStatus = !previewSnapshot && elements.some(element => element.bpmnNodeType)

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
          color: colorForType(type), fill: colorForType(type), createdBy: userProfile.id, bpmnNodeType: type,
          bpmnDurationMs: type === 'task' ? 1000 : undefined,
        }]
      }))

      const replacement: BoardElement[] = [...nodeById.values()]
      for (const flow of imported.flows) {
          if (!nodeById.has(flow.sourceId) || !nodeById.has(flow.targetId)) continue
          replacement.push({
            id: flow.id, type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2,
            fill: 'transparent', createdBy: userProfile.id,
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
      }, LOCAL_TEMPLATE)
      setSelectedIds(clearSelection())
      setTransform({ x: 0, y: 0, scale: 1 })
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Не удалось импортировать BPMN-файл.', 'error')
    } finally {
      event.target.value = ''
    }
  }, [userProfile.id, ydoc, showToast])

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
          text: node.name || (type === 'task' ? 'Задача' : ''), color, fill: color, createdBy: userProfile.id, bpmnNodeType: type,
          bpmnDurationMs: node.durationMs, bpmnDurationDistribution: node.durationDistribution, bpmnDurationMinMs: node.durationMinMs, bpmnDurationModeMs: node.durationModeMs, bpmnDurationMaxMs: node.durationMaxMs,
          bpmnResourceRole: node.resourceRole, bpmnCostPerHour: node.costPerHour, bpmnResourceCapacity: node.resourceCapacity,
          bpmnPriority: node.priority,
        }])
      }
      for (const flow of example.model.flows) yElements.current!.push([{
        id: flow.id, type: 'arrow', x: 0, y: 0, w: 0, h: 0, color: '#334155', stroke: 2, fill: 'transparent', createdBy: userProfile.id,
        bpmnFlow: { sourceId: flow.sourceId, targetId: flow.targetId, flowType: flow.flowType || 'sequence', condition: flow.condition, probability: flow.probability, isDefault: flow.isDefault },
      }])
    }, LOCAL_TEMPLATE)
    // Only the two collections the example actually carries. Seed, runs and the
    // SLA target deliberately survive a module load — the original code left
    // them alone, and changing that is a behaviour decision, not a refactor.
    replaceSimulation(current => ({
      ...current,
      arrivalClasses: (example.model.arrivalClasses ?? []).map(arrivalClass => ({
        count: String(arrivalClass.count),
        intervalSec: String(arrivalClass.intervalMs / 1000),
        priority: String(arrivalClass.priority),
      })),
      rolePolicies: Object.fromEntries(
        (example.model.resourceRoles ?? []).map(role => [
          role.name,
          { capacity: String(role.capacity), queuePolicy: role.queuePolicy ?? 'fifo' },
        ]),
      ),
    }))
    setSelectedIds(clearSelection())
    setTransform({ x: 0, y: 0, scale: 1 })
    showToast(`Загружен модуль: ${example.title}. Откройте Симуляцию для проверки.`, 'success')
  }, [userProfile.id, ydoc, showToast, replaceSimulation])

  // ======================== POINTER HANDLERS ========================
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as Element
    if (target.closest('[data-ui]')) return
    e.preventDefault()
    setContextMenu(null)
    setShowTemplates(false)
    setShowMore(false)
    setShowProfile(false)

    const point = screenToWorld(e.clientX, e.clientY)
    if (previewSnapshot) {
      if (tool === 'pan' || (tool === 'select' && e.altKey) || e.button === 1) {
        setIsPanning(true)
        setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y })
      }
      return
    }
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
        w: 48, h: 48, emoji: selectedEmoji, color: 'transparent', createdBy: userProfile.id
      })
      return
    }

    if (tool === 'pan' || (tool === 'select' && e.altKey) || e.button === 1) {
      setIsPanning(true)
      setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y })
      return
    }

    if (tool === 'select') {
      // The rotate handle sits outside the element, so it must be claimed before
      // the empty-canvas branch starts a marquee.
      const rotateHandle = target.closest('[data-rotate]')
      if (rotateHandle) {
        const rotateId = rotateHandle.getAttribute('data-rotate')
        const rotating = rotateId ? elements.find(candidate => candidate.id === rotateId) : undefined
        if (rotating && !isLocked(rotating) && canRotate(rotating)) {
          rotateInfoRef.current = {
            id: rotating.id,
            cx: rotating.x + (rotating.w || 0) / 2,
            cy: rotating.y + (rotating.h || 0) / 2,
          }
          return
        }
      }
      // Check resize handle
      const resizeHandle = target.closest('[data-resize]') as HTMLElement
      if (resizeHandle && selectedElementId) {
        const el = elements.find(candidate => candidate.id === selectedElementId)
        if (el && !isLocked(el)) {
          resizeInfoRef.current = {
            id: selectedElementId, corner: resizeHandle.dataset.resize as ResizeCorner,
            startX: point.x, startY: point.y,
            elX: el.x, elY: el.y, elW: el.w || 0, elH: el.h || 0,
          }
          return
        }
      }

      const el = target.closest('[data-id]') as HTMLElement
      if (el) {
        const elId = el.dataset.id!
        const mates = clickTargets(elements, elId)
        if (e.shiftKey) {
          // Shift-click toggles the whole group, never one member of it, and
          // never starts a drag: the user is building a set, not moving it.
          setSelectedIds(current => toggleGrouped(current, elements, elId))
          setAnchorId(elId)
          return
        }
        // A grouped element selects every member. Clicking inside an existing
        // selection keeps the rest of it, so an ungrouped multi-select still
        // drags together. Clicking outside replaces the selection.
        const already = selectedIds.has(elId)
        const kept = already ? [...new Set([...idsOf(selectedIds), ...mates])] : mates
        if (!already || kept.length !== selectedIds.size) {
          setSelectedIds(selectMany(kept))
          if (!already) setAnchorId(elId)
        }
        const grabbed = elements.find(candidate => candidate.id === elId)
        // Grabbing a locked object selects it and does not drag the rest of
        // the selection. A locked mate of an unlocked grab stays where it is.
        const dragged = grabbed && isLocked(grabbed) ? [] : expandIds(elements, kept)
          .map(id => elements.find(candidate => candidate.id === id))
          .filter((candidate): candidate is BoardElement => Boolean(candidate) && !isLocked(candidate))
        if (dragged.length) {
          dragInfoRef.current = {
            startX: point.x, startY: point.y,
            items: dragged.map(item => ({ id: item.id, x: item.x, y: item.y })),
          }
        }
        const longPress = { timer: null as number | null, x: e.clientX, y: e.clientY, startedAt: performance.now() }
        longPress.timer = window.setTimeout(() => {
          if (longPressRef.current === longPress) longPressRef.current = null
          // A long press outside the current selection retargets it, so the
          // context menu never acts on a set the user cannot see.
          if (!selectedIds.has(elId)) setSelectedIds(selectMany(mates))
          setContextMenu({ x: point.x, y: point.y, id: elId })
          if ('vibrate' in navigator) navigator.vibrate(30)
        }, 500)
        longPressRef.current = longPress
      } else {
        // Empty canvas: start a marquee. Shift extends the anchored selection.
        marqueeRef.current = { from: point, shift: e.shiftKey }
        setAnchorId(current => (e.shiftKey ? current : null))
        setMarquee(normaliseRect(point, point))
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
        selectElement(targetNode.id)
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
      const flow: BoardElement = {
        id: flowId,
        type: arrowHead === 'triangle' ? 'arrow' : 'line',
        x: sourceX,
        y: sourceY,
        w: targetX - sourceX,
        h: targetY - sourceY,
        color: '#334155',
        stroke: 2,
        fill: 'transparent',
        createdBy: userProfile.id,
        bpmnFlow: { sourceId: sourceNode.id, targetId: targetNode.id, flowType: 'sequence' },
      }
      if (lineDash === 'dashed') flow.dash = 'dashed'
      addElement(flow)
      setBpmnFlowSourceId(null)
      setFlowPreviewPoint(null)
      setSelectedIds(selectOnly(flowId))
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
        createdBy: userProfile.id,
        bpmnNodeType: bpmnNode.type,
        bpmnDurationMs: bpmnNode.durationMs,
      }
      addElement(newEl)
      setSelectedIds(selectOnly(id))
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
        createdBy: userProfile.id
      }
      addElement(newEl)
      setSelectedIds(selectOnly(id))
      setEditingText(id)
      setEditValue(newEl.text || '')
      chooseTool('select')
      return
    }
    if (tool === 'rect' || tool === 'circle' || tool === 'arrow' || tool === 'line') {
      const id = genId()
      const mark: BoardElement = {
        id,
        type: tool === 'arrow' || tool === 'line' ? (arrowHead === 'triangle' ? 'arrow' : 'line') : tool,
        x: point.x, y: point.y, w: 0, h: 0,
        color, stroke: strokeWidth, fill: 'transparent', createdBy: userProfile.id,
      }
      if ((tool === 'arrow' || tool === 'line') && lineDash === 'dashed') mark.dash = 'dashed'
      addElement(mark)
      setSelectedIds(selectOnly(id))
      setIsDrawing(true)
      return
    }
    if (tool === 'pen' || tool === 'marker') {
      setIsDrawing(true)
      setCurrentPath([point])
    }
  }, [tool, screenToWorld, transform, color, strokeWidth, lineDash, arrowHead, addElement, deleteElement, userProfile.id, selectedIds, selectedElementId, selectElement, elements, selectedEmoji, bpmnFlowSourceId, setBpmnFlowSourceId, showToast, chooseTool, previewSnapshot])
  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const point = screenToWorld(e.clientX, e.clientY)
    const isLaser = tool === 'laser'
    if (isLaser) setLaserPos(point)
    if (tool === 'bpmnSequence' && bpmnFlowSourceId) setFlowPreviewPoint(point)
    // Cancel long press if moved
    if (longPressRef.current) {
      if (Math.hypot(e.clientX - longPressRef.current.x, e.clientY - longPressRef.current.y) > 8) {
        if (longPressRef.current.timer !== null) clearTimeout(longPressRef.current.timer)
        longPressRef.current = null
      }
    }
    const rotate = rotateInfoRef.current
    if (rotate) {
      const frame = [{ id: rotate.id, updates: { rotation: rotationFromPointer(rotate, point, e.shiftKey) } }]
      transientFrameRef.current = frame
      setTransientFrame(frame)
      return
    }
    if (isPanning && panStart) {
      setTransform(t => ({ ...t, x: e.clientX - panStart.x, y: e.clientY - panStart.y }))
      return
    }
    // Marquee
    if (marqueeRef.current) {
      setMarquee(normaliseRect(marqueeRef.current.from, point))
      return
    }
    // Resize
    const resize = resizeInfoRef.current
    if (resize) {
      // Same rule as a drag: a neighbour edge wins over the grid, and the
      // guide is not written into the document.
      const raw = resizeFrame(resize, point)
      const aligned = snapResizeFrames(raw, elements, resize.id, resize.corner, ALIGN_SCREEN_PX / transform.scale)
      const frame = aligned.guides.length || !snapGrid ? aligned.frames : resizeFrame(resize, point, snapVal)
      transientFrameRef.current = frame
      setTransientFrame(frame)
      setAlignGuides(aligned.guides.length || !snapGrid ? [...aligned.guides] : [])
      return
    }
    // Drag: one delta applied to every dragged element, so a multi-selection
    // moves as a group and stays internally consistent.
    const drag = dragInfoRef.current
    if (drag) {
      // Alignment wins over the grid when a neighbour is within a few screen
      // pixels: "flush with this sticky" is the intent, the lattice is the
      // fallback. The guide itself is not written anywhere — see align.ts.
      const raw = dragFrame(drag, point)
      const movingIds = new Set(drag.items.map(item => item.id))
      const aligned = snapDragFrames(raw, elements, movingIds, ALIGN_SCREEN_PX / transform.scale)
      const frame = aligned.guides.length || !snapGrid ? aligned.frames : dragFrame(drag, point, snapVal)
      transientFrameRef.current = frame
      setTransientFrame(frame)
      setAlignGuides(aligned.guides.length || !snapGrid ? [...aligned.guides] : [])
      return
    }
    if (!isDrawing) return
    if (tool === 'pen' || tool === 'marker') {
      setCurrentPath(prev => [...prev, point])
      return
    }
    if (selectedElementId && (tool === 'rect' || tool === 'circle' || tool === 'arrow' || tool === 'line')) {
      const el = elements.find(e => e.id === selectedElementId)
      if (el) {
        let w = point.x - el.x, h = point.y - el.y
        if (snapGrid) { w = snapVal(w); h = snapVal(h) }
        updateElement(selectedElementId, { w, h })
      }
    }
  }, [isPanning, panStart, isDrawing, tool, selectedElementId, elements, screenToWorld, updateElement, snapGrid, bpmnFlowSourceId, transform.scale])
  const handlePointerUp = useCallback((e?: React.PointerEvent) => {
    // Cancel long press
    if (longPressRef.current) {
      if (performance.now() - longPressRef.current.startedAt < 500) {
        if (longPressRef.current.timer !== null) clearTimeout(longPressRef.current.timer)
        longPressRef.current = null
      }
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
        createdBy: userProfile.id
      })
    }
    // Where the pointer actually is. A cancelled gesture has no meaningful
    // release point, so it keeps whatever the last move produced.
    const releasedAt = e && e.type !== 'pointercancel' ? screenToWorld(e.clientX, e.clientY) : null
    // Recompute the final frame from the release point instead of trusting the
    // last committed pointermove: the gesture has to land where the user let go,
    // whatever React has rendered by then. A drag uses the same alignment rule
    // as pointermove, or the guide the user saw would snap back on release.
    const drag = dragInfoRef.current
    const resize = resizeInfoRef.current
    const rotate = rotateInfoRef.current
    let frame = transientFrameRef.current
    if (releasedAt && rotate) {
      frame = [{ id: rotate.id, updates: { rotation: rotationFromPointer(rotate, releasedAt, Boolean(e?.shiftKey)) } }]
    } else if (releasedAt && resize) {
      const raw = resizeFrame(resize, releasedAt)
      const aligned = snapResizeFrames(raw, elements, resize.id, resize.corner, ALIGN_SCREEN_PX / transform.scale)
      frame = aligned.guides.length || !snapGrid ? aligned.frames : resizeFrame(resize, releasedAt, snapVal)
    } else if (releasedAt && drag) {
      const raw = dragFrame(drag, releasedAt)
      const movingIds = new Set(drag.items.map(item => item.id))
      const aligned = snapDragFrames(raw, elements, movingIds, ALIGN_SCREEN_PX / transform.scale)
      frame = aligned.guides.length || !snapGrid ? aligned.frames : dragFrame(drag, releasedAt, snapVal)
    }
    // One commit per gesture, labelled as such: the drag itself stays local
    // (transientFrame) so a 3-second drag is a single undo step, not 180.
    if (frame?.length) {
      const frames = frame
      ydoc.transact(() => {
        for (const item of frames) commitElementUpdate(ydoc, yElements.current!, item.id, item.updates)
      }, LOCAL_GESTURE)
    }
    transientFrameRef.current = null
    setTransientFrame(null)
    // Finish the marquee: select what the rect covers, measured to the release
    // point for the same reason as the frame above.
    const pendingMarquee = marqueeRef.current
    if (pendingMarquee) {
      const rect = releasedAt ? normaliseRect(pendingMarquee.from, releasedAt) : marquee
      if (rect) {
        const hit = selectInRect(elements, rect, 'intersect')
        const picked = expandIds(elements, hit)
        setSelectedIds(current => (pendingMarquee.shift ? unionSelection(current, picked) : selectMany(picked)))
        if (!pendingMarquee.shift) setAnchorId(hit.length ? hit[hit.length - 1] : null)
      }
    }
    marqueeRef.current = null
    setMarquee(null)
    setIsDrawing(false)
    setCurrentPath([])
    setIsPanning(false)
    setPanStart(null)
    setLastPinchDist(null)
    dragInfoRef.current = null
    resizeInfoRef.current = null
    rotateInfoRef.current = null
    setAlignGuides([])
  }, [isDrawing, tool, currentPath, color, strokeWidth, addElement, userProfile.id, marquee, elements, ydoc, screenToWorld, snapGrid, transform.scale])
  // Touch pinch
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const [t1, t2] = [e.touches[0], e.touches[1]]
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)
      const cx = (t1.clientX + t2.clientX) / 2, cy = (t1.clientY + t2.clientY) / 2
      if (lastPinchDist) {
        const factor = dist / lastPinchDist
        const world = screenToWorld(cx, cy)
        setTransform(current => zoomAround(current, factor, { x: cx, y: cy }, world))
      }
      setLastPinchDist(dist)
    }
  }, [lastPinchDist, screenToWorld])
  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const world = screenToWorld(e.clientX, e.clientY)
    const factor = wheelZoomFactor(e.deltaY)
    setTransform(current => zoomAround(current, factor, { x: e.clientX, y: e.clientY }, world))
  }, [screenToWorld])
  const fitToContent = useCallback(() => {
    setTransform(fitTransform(elementsInScope(elements, workspaceMode), {
      width: window.innerWidth,
      height: window.innerHeight,
    }))
  }, [elements, workspaceMode])
  useEffect(() => () => {
    bpmnRunTimersRef.current.forEach(window.clearTimeout)
  }, [])
  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f' && !editingText) {
        const field = e.target instanceof HTMLElement ? e.target : null
        const inField = Boolean(field?.matches('input, textarea, select, [contenteditable="true"]'))
        const inSearch = Boolean(field?.closest('[data-testid="board-search"]'))
        // Steal the browser's find-in-page only for the canvas. A property
        // panel input keeps the native shortcut; the search box itself re-focuses.
        if (!inField || inSearch) {
          e.preventDefault()
          setSearchOpen(true)
          setSearchFocusNonce(nonce => nonce + 1)
          return
        }
      }
      if (e.key === 'Escape' && searchOpen) { e.preventDefault(); setSearchOpen(false); return }
      if (e.key === 'Escape' && previewSnapshot) { e.preventDefault(); closeTimeline(); return }
      if (e.key === 'Escape') { e.preventDefault(); setSelectedIds(clearSelection()); setContextMenu(null); setShowBpmnPalette(false); setWorkspaceMode('board'); return }
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
      // Past this point every branch reads or writes the document, and a drag
      // in progress is not in the document yet. Ctrl+D mid-drag used to place
      // the copy next to where the element started, nowhere near the one on
      // screen; Ctrl+C copied the pre-drag position. One flush covers all of
      // them, rather than each shortcut having to remember.
      flushGesture()
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedIds.size) deleteSelected() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
        e.preventDefault()
        if (selectedIds.size) setSelectedIds(selectMany(duplicateSelection()))
      }
      // Clipboard. Ctrl+C is only taken over when the canvas has a selection,
      // so copying text anywhere else in the UI keeps working natively.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && !e.shiftKey) {
        if (copySelection()) e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
        if (selectedIds.size) {
          e.preventDefault()
          cutSelection()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        void pasteFromClipboard()
        return
      }
      // Ctrl+G groups; Ctrl+Shift+G ungroups. `code` as well as `key`, so a
      // Russian layout still hits the physical G key. Always preventDefault:
      // otherwise the browser treats it as find-next.
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key.toLowerCase() === 'g' || e.code === 'KeyG')) {
        e.preventDefault()
        if (!previewSnapshot) {
          if (e.shiftKey) ungroupSelection()
          else groupSelection()
        }
        return
      }
      // Ctrl+A selects the whole board; arrow keys nudge the selection.
      // `elements` is the live document, while a history preview renders
      // `previewElements`. Selecting here during a preview would hand back
      // objects that are not on screen — and Ctrl+C would then copy them.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        if (previewSnapshot) return
        selectElements(elements.map(element => element.id))
        return
      }
      if (!e.metaKey && !e.ctrlKey && selectedIds.size && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const delta = e.key === 'ArrowUp' ? { x: 0, y: -step }
          : e.key === 'ArrowDown' ? { x: 0, y: step }
            : e.key === 'ArrowLeft' ? { x: -step, y: 0 } : { x: step, y: 0 }
        moveSelection(delta)
        return
      }
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
    }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [selectedIds, deleteSelected, editingText, flushGesture, handleUndo, handleRedo, duplicateSelection, elements, moveSelection, copySelection, cutSelection, pasteFromClipboard, selectElements, groupSelection, ungroupSelection, workspaceMode, fitToContent, showSimulationPanel, chooseTool, saveBoard, openBoard, previewSnapshot, closeTimeline, searchOpen])
  // ======================== RENDER ELEMENT ========================
  const isPreview = previewSnapshot !== null
  const liveElementIds = useMemo(() => new Set(elements.map(element => element.id)), [elements])
  const baseRenderedElements = previewElements ?? elements
  const renderedElements = useMemo(() => {
    if (!transientFrame || isPreview) return baseRenderedElements
    const frames = new Map(transientFrame.map(frame => [frame.id, frame.updates]))
    return baseRenderedElements.map(element => {
      const updates = frames.get(element.id)
      return updates ? { ...element, ...updates } : element
    })
  }, [baseRenderedElements, isPreview, transientFrame])
  // Arrow rendering used to scan the whole list twice per edge. On a process
  // diagram that is O(edges × nodes) every frame; the map makes it O(1).
  const renderedById = useMemo(() => {
    const index = new Map<string, BoardElement>()
    for (const element of renderedElements) index.set(element.id, element)
    return index
  }, [renderedElements])
  const searchHits = useMemo(
    () => searchBoard(isPreview ? renderedElements : elements, searchQuery),
    [elements, isPreview, renderedElements, searchQuery],
  )
  const activeSearchIndex = searchHits.length ? Math.min(searchIndex, searchHits.length - 1) : 0
  const searchHitId = searchOpen && searchQuery.trim() && searchHits.length
    ? searchHits[activeSearchIndex]?.id ?? null
    : null
  const selectionCount = selectedIds.size
  const alignUnits = isPreview || contextMenu || showMore ? 0 : alignUnitCount(elements, selectedIds)
  const lockAction = isPreview ? null : selectionLockAction(elements, selectedIds)
  const paintElement = !isPreview && !contextMenu && selectedElementId
    ? elements.find(element => element.id === selectedElementId) ?? null
    : null
  const paint = paintElement ? paintChannels(paintElement) : []
  // A line has no fill, so the colour picker stays hidden and this bar takes its dock.
  const lineElement = paintElement && isLineElement(paintElement) ? paintElement : null
  const menuTargets = contextMenu
    ? (selectedIds.has(contextMenu.id) ? idsOf(selectedIds) : [contextMenu.id])
    : []
  const menuLock = contextMenu ? selectionLockAction(elements, new Set(menuTargets)) : null
  const menuLockLabel = menuLock === 'unlock' ? '🔓 Разблокировать' : menuLock === 'lock' ? '🔒 Заблокировать' : null
  const outlines = useMemo(
    () => groupOutlines(renderedElements, selectedIds),
    [renderedElements, selectedIds],
  )
  // Called from the search controls, not from an effect: a jump is a response
  // to a keystroke, and an effect would also re-centre during a drag.
  const jumpToSearchHit = (query: string, index: number) => {
    const hits = searchBoard(isPreview ? renderedElements : elements, query)
    const hit = hits[index]
    if (!hit) return
    const element = renderedById.get(hit.id)
    if (!element) return
    const bounds = hitBounds(element, renderedById)
    setTransform(current => centerOn(current, bounds, { width: window.innerWidth, height: window.innerHeight }))
  }
  /** Wires one element's text editing to the shared editor state. */
  const textEditorProps = (el: BoardElement) => ({
    text: el.text ?? '',
    editing: editingText === el.id,
    draft: editValue,
    readOnly: isPreview,
    onDraftChange: setEditValue,
    onBeginEdit: () => { setEditingText(el.id); setEditValue(el.text || '') },
    onCommit: () => { updateElement(el.id, { text: editValue }); setEditingText(null) },
  })

  const renderElement = (el: BoardElement) => {
    const isSelected = isIdSelected(selectedIds, el.id)
    const invS = 1 / transform.scale
    const isChangedInPreview = isPreview && !liveElementIds.has(el.id)
    const moveCursor = isPreview || isLocked(el) ? 'cursor-default' : 'cursor-move'
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
        <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}>
          {isChangedInPreview && <ChangedInPreview invScale={invS} x={-7} y={-7} width={width + 14} height={height + 14} radius={12} />}
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
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className="touch-none">
            {isChangedInPreview && <ChangedInPreview invScale={invS} x={-6} y={-6} width={(el.w || 0) + 12} height={(el.h || 0) + 12} radius={6} />}
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
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}>
            {isChangedInPreview && <ChangedInPreview invScale={invS} x={-6} y={-6} width={(el.w || 0) + 12} height={(el.h || 0) + 12} radius={14} />}
            <rect width={el.w} height={el.h} fill={el.fill} rx={10}
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.12))' }} />
            <rect width={el.w} height={el.h} fill={el.fill} rx={10} />
            <foreignObject x={8} y={8} width={(el.w || 160) - 16} height={(el.h || 160) - 16}>
              <div className="w-full h-full flex items-center justify-center p-2 text-[14px] leading-snug font-medium text-black/80 break-words text-center select-none">
                <ElementTextEditor
                  {...textEditorProps(el)}
                  className={editingText === el.id ? 'w-full h-full bg-transparent outline-none resize-none text-center text-[14px]' : undefined}
                />
              </div>
            </foreignObject>
            {isSelected && selectionCount === 1 && <>
              <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
                fill="none" stroke="#4D96FF" strokeWidth={2 * invS} rx={12} />
              {/* Resize handles: single selection only, and never on a lock. */}
              {!el.locked && <ResizeHandles invScale={invS} width={el.w || 0} height={el.h || 0} />}
            </>}
          </g>
        )
      case 'text':
        return (
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}>
            {isChangedInPreview && <ChangedInPreview invScale={invS} x={-6} y={-6} width={(el.w || 200) + 12} height={(el.h || 60) + 12} radius={6} />}
            <foreignObject width={el.w || 200} height={el.h || 60}>
              <div className="w-full h-full select-none"
                onDoubleClick={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }}>
                <ElementTextEditor
                  {...textEditorProps(el)}
                  multiline={false}
                  className={editingText === el.id
                    ? 'w-full bg-transparent outline-none text-[16px] font-semibold'
                    : 'text-[16px] font-semibold'}
                  style={{ color: el.color }}
                />
              </div>
            </foreignObject>
            {isSelected && <rect x={-4} y={-4} width={(el.w || 200) + 8} height={(el.h || 60) + 8}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )
      case 'rect':
        return (
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}
            onDoubleClick={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onDoubleClickCapture={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onMouseDown={e => { if (!isPreview && e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onMouseUp={e => { if (!isPreview && e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}>
            {isChangedInPreview && <ChangedInPreview invScale={invS} x={-6} y={-6} width={(el.w || 0) + 12} height={(el.h || 0) + 12} radius={8} />}
            <rect width={el.w} height={el.h} fill={el.fill || 'transparent'} stroke={el.color}
              strokeWidth={el.stroke} rx={4}
              onDoubleClick={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }} />
            <foreignObject x={8} y={8} width={Math.max((el.w || 0) - 16, 120)} height={Math.max((el.h || 0) - 16, 40)}>
              <div className="w-full h-full flex items-center justify-center p-2 text-[14px] leading-snug font-medium text-black/80 break-words text-center select-none">
                <ElementTextEditor
                  {...textEditorProps(el)}
                  className={editingText === el.id ? 'w-full h-full bg-transparent outline-none resize-none text-center text-[14px]' : undefined}
                />
              </div>
            </foreignObject>
            {isSelected && (
              <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
                fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={6} />
            )}
            {isSelected && selectionCount === 1 && !el.locked && ([['se', (el.w || 0), (el.h || 0)]] as [string, number, number][]).map(([c, cx, cy]) => (
              <circle key={c} data-resize={c} cx={cx} cy={cy} r={7 * invS}
                fill="white" stroke="#4D96FF" strokeWidth={2 * invS} style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))' }} />
            ))}
          </g>
        )
      case 'circle':
        return (
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}
            onDoubleClick={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onDoubleClickCapture={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onMouseDown={e => { if (!isPreview && e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}
            onMouseUp={e => { if (!isPreview && e.detail === 2) { setEditingText(el.id); setEditValue(el.text || '') } }}>
            {isChangedInPreview && <ChangedInPreview invScale={invS} x={-6} y={-6} width={(el.w || 0) + 12} height={(el.h || 0) + 12} radius={8} />}
            <ellipse cx={(el.w || 0) / 2} cy={(el.h || 0) / 2} rx={Math.abs((el.w || 0) / 2)} ry={Math.abs((el.h || 0) / 2)}
              fill={el.fill || 'transparent'} stroke={el.color} strokeWidth={el.stroke}
              onDoubleClick={() => { if (!isPreview) { setEditingText(el.id); setEditValue(el.text || '') } }} />
            <foreignObject x={8} y={8} width={Math.max((el.w || 0) - 16, 120)} height={Math.max((el.h || 0) - 16, 40)}>
              <div className="w-full h-full flex items-center justify-center p-2 text-[14px] leading-snug font-medium text-black/80 break-words text-center select-none">
                <ElementTextEditor
                  {...textEditorProps(el)}
                  className={editingText === el.id ? 'w-full h-full bg-transparent outline-none resize-none text-center text-[14px]' : undefined}
                />
              </div>
            </foreignObject>
            {isSelected && <rect x={-2} y={-2} width={(el.w || 0) + 4} height={(el.h || 0) + 4}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )
      case 'arrow':
      case 'line': {
        // A connector follows its endpoints even after the head is removed.
        // The freeform line below uses the frame, which a connector does not have.
        if (el.bpmnFlow || el.type === 'arrow') {
          const source = el.bpmnFlow ? renderedById.get(el.bpmnFlow.sourceId) : undefined
          const target = el.bpmnFlow ? renderedById.get(el.bpmnFlow.targetId) : undefined
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
            <g key={el.id} data-id={el.id} data-testid={el.bpmnFlow ? `bpmn-flow-${el.id}` : undefined} transform={`translate(${startX},${startY})`} className={`touch-none ${moveCursor}`}>
              {isChangedInPreview && <ChangedInPreview invScale={invS} x={Math.min(0, x2) - 7} y={Math.min(0, y2) - 7} width={Math.abs(x2) + 14} height={Math.abs(y2) + 14} radius={6} />}
              <line x1={0} y1={0} x2={x2} y2={y2} stroke={el.color} strokeWidth={el.stroke} strokeDasharray={strokeDasharray(el)} />
              {arrowHeadOf(el) === 'triangle' && (
                <polygon points={`${x2},${y2} ${x2 - hs * Math.cos(angle - 0.4)},${y2 - hs * Math.sin(angle - 0.4)} ${x2 - hs * Math.cos(angle + 0.4)},${y2 - hs * Math.sin(angle + 0.4)}`}
                  fill={el.color} />
              )}
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
        return (
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}>
            {isChangedInPreview && <ChangedInPreview invScale={invS} x={Math.min(0, el.w || 0) - 7} y={Math.min(0, el.h || 0) - 7} width={Math.abs(el.w || 0) + 14} height={Math.abs(el.h || 0) + 14} radius={6} />}
            <line x1={0} y1={0} x2={el.w || 0} y2={el.h || 0} stroke={el.color} strokeWidth={el.stroke} strokeLinecap="round" strokeDasharray={strokeDasharray(el)} />
            {isSelected && <rect x={Math.min(0, el.w || 0) - 4} y={Math.min(0, el.h || 0) - 4}
              width={Math.abs(el.w || 0) + 8} height={Math.abs(el.h || 0) + 8}
              fill="none" stroke="#4D96FF" strokeWidth={2 * invS} strokeDasharray={`${4 * invS}`} rx={4} />}
          </g>
        )
      }
      case 'emoji':
        return (
          <g key={el.id} data-id={el.id} transform={frameTransform(el)} className={`touch-none ${moveCursor}`}>
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
  const dk = darkMode
  // Extracted panels take the whole theme rather than five separate props.
  const theme = createTheme(darkMode)
  const textC = 'text-slate-900'
  const textSec = 'text-slate-500'
  const hoverBg = 'hover:bg-slate-100'
  return (
    <div className={`fixed inset-0 overflow-hidden select-none ${dk ? 'bg-slate-900 text-white' : 'bg-[#F7F7F5] text-black'}`}>
      <input ref={bpmnImportRef} type="file" accept=".bpmn,.xml,application/xml,text/xml" className="hidden" onChange={importFromBpmn} />
      {/* ===== HEADER ===== */}
      <BoardHeader
        theme={theme}
        documentName={fileSession.name ?? null}
        isDirty={isDirty}
        version={__MIROBOARD_VERSION__}
        workspaceMode={workspaceMode}
        isPreview={isPreview}
        canUndo={canUndo}
        canRedo={canRedo}
        showTimeline={showTimeline}
        snapGrid={snapGrid}
        tool={tool}
        bpmnFlowSourceId={bpmnFlowSourceId}
        selectionCount={selectionCount}
        lockLabel={!isPreview && lockAction === 'unlock' ? 'Разблокировать' : !isPreview && lockAction === 'lock' ? 'Заблокировать' : null}
        hasBpmnNodes={showBpmnStatus}
        bpmnIssues={bpmnIssues}
        bpmnRunSummary={bpmnRunSummary}
        simulationSummary={visibleSimulationSummary}
        userProfile={userProfile}
        showProfile={showProfile}
        recoveryNotice={recoveryNotice ? <RecoveryDivergenceNotice message={recoveryNotice} /> : null}
        onSelectMode={mode => {
          if (mode === 'simulation') openSimulation()
          else if (mode === 'bpmn' && !bpmnProfileActive) activateBpmnProfile()
          else setWorkspaceMode(mode)
        }}
        onOpenProjectHistory={() => setShowProjectHistory(true)}
        onOpenTimeline={() => setShowTimeline(true)}
        onStartTour={() => setTourStep(0)}
        onOpenLearningModules={() => setShowLearningModules(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onOpenSimulation={openSimulation}
        onToggleSnapGrid={() => setSnapGrid(!snapGrid)}
        onToggleDarkMode={() => setDarkMode(!dk)}
        onToggleMiniMap={() => setShowMiniMap(!showMiniMap)}
        onToggleProfile={() => setShowProfile(value => !value)}
        onToggleLock={() => {
          if (!lockAction) return
          applyLock(idsOf(selectedIds), lockAction === 'lock')
        }}
      />
      {showProfile && <ProfilePanel profile={userProfile} theme={theme} onChange={updateUserProfile} />}
      <BoardSearch
        theme={theme}
        open={searchOpen}
        query={searchQuery}
        matchIndex={activeSearchIndex}
        matchCount={searchHits.length}
        focusNonce={searchFocusNonce}
        onOpen={() => { setSearchOpen(true); setSearchFocusNonce(nonce => nonce + 1) }}
        onClose={() => setSearchOpen(false)}
        onQueryChange={value => { setSearchQuery(value); setSearchIndex(0); jumpToSearchHit(value, 0) }}
        onNext={() => { const next = stepIndex(searchHits.length, activeSearchIndex, 1); setSearchIndex(next); jumpToSearchHit(searchQuery, next) }}
        onPrev={() => { const next = stepIndex(searchHits.length, activeSearchIndex, -1); setSearchIndex(next); jumpToSearchHit(searchQuery, next) }}
        hits={searchHits}
        onPick={index => { setSearchIndex(index); jumpToSearchHit(searchQuery, index) }}
      />
      {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
      <HistoryPreviewBanner darkMode={dk} snapshot={previewSnapshot} onRestore={restorePreview} onClose={closeTimeline} />
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
      {tourStep >= 0 && <OnboardingTour step={tourStep} onNext={setTourStep} onFinish={finishTour} />}
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
            if (isPreview) return
            const node = (e.target as Element).closest<SVGGElement>('[data-id]')
            const id = node?.getAttribute('data-id')
            const element = id ? elements.find(candidate => candidate.id === id) : undefined
            if (element && (element.type === 'rect' || element.type === 'circle')) {
              setEditingText(element.id)
              setEditValue(element.text || '')
            }
          }}>
          <CanvasBackground dark={dk} snapGrid={snapGrid} transform={transform} />
          <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
            {renderedElements.map(renderElement)}
            <LockBadges elements={renderedElements} invScale={1 / transform.scale} />
            {searchHitId && (() => {
              const hit = renderedById.get(searchHitId)
              if (!hit) return null
              const bounds = hitBounds(hit, renderedById)
              return (
                <rect
                  data-testid="search-hit"
                  x={bounds.x - 6} y={bounds.y - 6}
                  width={bounds.w + 12} height={bounds.h + 12}
                  fill="none" stroke="#F59E0B" strokeWidth={2 / transform.scale}
                  pointerEvents="none"
                />
              )
            })()}
            {alignGuides.map(guide => (
              guide.orientation === 'vertical'
                ? <line key={`v${guide.position}`} data-testid="align-guide" x1={guide.position} y1={-20000} x2={guide.position} y2={20000} stroke="#E11D48" strokeWidth={1 / transform.scale} pointerEvents="none" />
                : <line key={`h${guide.position}`} data-testid="align-guide" x1={-20000} y1={guide.position} x2={20000} y2={guide.position} stroke="#E11D48" strokeWidth={1 / transform.scale} pointerEvents="none" />
            ))}
            {!isPreview && tool === 'select' && selectionCount === 1 && selectedElementId && (() => {
              const rotating = renderedById.get(selectedElementId)
              if (!rotating || isLocked(rotating) || !canRotate(rotating)) return null
              const width = rotating.w || 0
              const cx = rotating.x + width / 2
              const cy = rotating.y + (rotating.h || 0) / 2
              const stem = 28 / transform.scale
              return (
                <g data-testid="rotate-handle" transform={rotating.rotation ? `rotate(${rotating.rotation} ${cx} ${cy})` : undefined}>
                  <line x1={cx} y1={rotating.y} x2={cx} y2={rotating.y - stem} stroke="#7C3AED" strokeWidth={1.5 / transform.scale} pointerEvents="none" />
                  <circle data-rotate={rotating.id} cx={cx} cy={rotating.y - stem} r={7 / transform.scale} fill="white" stroke="#7C3AED" strokeWidth={2 / transform.scale} />
                </g>
              )
            })()}
            {outlines.map(outline => (
              <rect
                key={outline.groupId}
                data-testid="group-outline"
                data-group={outline.groupId}
                x={outline.x}
                y={outline.y}
                width={outline.w}
                height={outline.h}
                fill="none"
                stroke="#7C3AED"
                strokeWidth={1.5 / transform.scale}
                strokeDasharray={`${6 / transform.scale} ${4 / transform.scale}`}
                pointerEvents="none"
              />
            ))}
            {selectionCount > 1 && anchorId && (() => {
              const anchor = elements.find(element => element.id === anchorId)
              if (!anchor) return null
              return (
                <circle
                  data-testid="selection-anchor"
                  cx={anchor.x} cy={anchor.y} r={4 / transform.scale}
                  fill="#7C3AED" pointerEvents="none"
                />
              )
            })()}
            {marquee && (
              <rect
                data-testid="marquee"
                x={marquee.minX} y={marquee.minY}
                width={Math.max(0, marquee.maxX - marquee.minX)}
                height={Math.max(0, marquee.maxY - marquee.minY)}
                fill="#4D96FF" fillOpacity={0.08}
                stroke="#4D96FF" strokeWidth={1.5 / transform.scale}
                strokeDasharray={`${4 / transform.scale}`}
                pointerEvents="none"
              />
            )}
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
            <button onClick={openSimulation} disabled={isPreview} className={`mb-1 flex w-full items-center gap-2 rounded-xl bg-violet-600 py-2.5 text-left text-xs font-bold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50 ${sidebarCollapsed ? 'justify-center px-0' : 'px-3'}`} title="Симуляция">
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
        {/* Empty state. Reads what is on screen, not the live document: a
            preview of an earlier snapshot draws its own elements, and an
            emptied live board would otherwise cover them with "start creating"
            and an inviting template button. */}
        {renderedElements.length === 0 && !showTemplates && (
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
      <TimelinePanel
        darkMode={dk}
        isOpen={showTimeline}
        selectedId={previewSnapshot?.id ?? null}
        snapshots={historySnapshots}
        onClose={closeTimeline}
        onSelect={selectSnapshot}
      />
      {/* ===== MINIMAP ===== */}
      {showMiniMap && <MiniMap elements={renderedElements} transform={transform} darkMode={darkMode} setTransform={setTransform} />}
      {/* ===== BOTTOM TOOLBAR ===== */}
      <BottomToolbar
        theme={theme}
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        selectedEmoji={selectedEmoji}
        isPreview={isPreview}
        showEmoji={showEmoji}
        showBpmnPalette={showBpmnPalette}
        showColorPicker={showColorPicker}
        showMore={showMore}
        onChooseTool={chooseTool}
        onSetColor={setColor}
        onSetStrokeWidth={setStrokeWidth}
        onSetSelectedEmoji={setSelectedEmoji}
        onToggleEmoji={() => setShowEmoji(!showEmoji)}
        onToggleColorPicker={() => setShowColorPicker(!showColorPicker)}
        onToggleMore={() => { setShowMore(value => !value); setShowBpmnPalette(false) }}
        onCloseEmoji={() => setShowEmoji(false)}
        onCloseColorPicker={() => setShowColorPicker(false)}
      />
      {/* ===== MORE MENU ===== */}
      {showMore && (
        <MoreMenu
          theme={theme}
          tool={tool}
          bpmnPaletteActive={showBpmnPalette}
          hasBpmnNodes={elements.some(element => element.bpmnNodeType)}
          isPreview={isPreview}
          retentionControls={
            <HistoryRetentionControls
              elements={elements}
              snapshots={historySnapshots}
              ydoc={ydoc}
              textClassName={textSec}
              onCompact={compactHistory}
            />
          }
          onChooseTool={chooseTool}
          onActivateBpmn={() => { activateBpmnProfile(); setShowEmoji(false) }}
          onOpenTemplates={() => setShowTemplates(true)}
          onImportBpmn={() => bpmnImportRef.current?.click()}
          onRunBpmn={runBpmn}
          onOpenSimulation={openSimulation}
          onExportBpmn={exportToBpmn}
          onExportPng={exportToPNG}
          onNewDocument={resetDocument}
          onOpenDocument={() => { void openBoard() }}
          onSave={() => { void saveBoard('save') }}
          onSaveAs={() => { void saveBoard('saveAs') }}
          onMarkState={markCurrentState}
          onResetViewport={() => setTransform({ x: 0, y: 0, scale: 1 })}
          onClose={() => setShowMore(false)}
        />
      )}
      {/* ===== CONTEXT MENU ===== */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          transform={transform}
          theme={theme}
          lockLabel={menuLockLabel}
          onAction={action => handleContextMenuAction(action, contextMenu.id)}
        />
      )}
      {/* ===== SELECTION PROPERTY PANELS ===== */}
      {selectedBpmnTask && !contextMenu && (
        <BpmnTaskProperties task={selectedBpmnTask} theme={theme} onUpdate={updateElement} />
      )}
      {selectedBpmnFlow && !contextMenu && (
        <BpmnFlowProperties
          flow={selectedBpmnFlow}
          isXorBranch={selectedBpmnFlowIsXor}
          theme={theme}
          onUpdate={updateElement}
        />
      )}
      {paint.length > 0 && paintElement && (
        <ColorPicker
          theme={theme}
          channels={paint}
          fill={paintElement.fill}
          stroke={paintElement.color}
          onPick={(channel, value) => updateSelected(paintPatch(channel, value))}
        />
      )}
      {lineElement && (
        <StrokeStyleBar
          theme={theme}
          dash={dashOf(lineElement)}
          arrowHead={arrowHeadOf(lineElement)}
          stroke={lineElement.stroke}
          onChange={applyStrokeStyle}
        />
      )}
      {alignUnits >= 2 && <AlignBar theme={theme} onAlign={alignSelection} />}
      {/* ===== SIMULATION MODAL ===== */}
      {showSimulationPanel && !isPreview && (
        <SimulationModal
        arrivalClasses={simulation.arrivalClasses}
        arrivalInterval={simulation.arrivalIntervalSec}
        calendarEnd={simulation.calendarEndHour}
        calendarStart={simulation.calendarStartHour}
        detectedRoles={detectedRoles}
        dk={dk}
        hoverBg={hoverBg}
        rolePolicies={simulation.rolePolicies}
        setArrivalClasses={simulation.setArrivalClasses}
        setArrivalInterval={simulation.setArrivalIntervalSec}
        setCalendarEnd={simulation.setCalendarEndHour}
        setCalendarStart={simulation.setCalendarStartHour}
        setRolePolicies={simulation.setRolePolicies}
        setSimulationInstances={simulation.setInstances}
        setSimulationRuns={simulation.setRuns}
        setSimulationSeed={simulation.setSeed}
        setSimulationTarget={simulation.setSlaTargetSec}
        simulationInstances={simulation.instances}
        simulationRuns={simulation.runs}
        simulationSeed={simulation.seed}
        simulationTarget={simulation.slaTargetSec}
        simulateBpmn={simulateBpmn}
        textSec={textSec}
        visibleBottleneckRole={visibleBottleneckRole}
        visibleSimulationResult={visibleSimulationResult}
        frontierRole={visibleFrontier?.role ?? null}
        frontierAdvice={visibleFrontier?.advice ?? null}
        frontierPoints={visibleFrontier?.points ?? null}
        frontierRuns={visibleFrontier?.runs ?? null}
        onTraceFrontier={traceFrontier}
        onApplyFrontierCapacity={applyFrontierCapacity}
        onClose={() => setShowSimulationPanel(false)}
        />
      )}
      {showProjectHistory && (
        <ProjectHistoryModal
          theme={theme}
          repositoryUrl={GITHUB_REPOSITORY}
          history={__MIROBOARD_HISTORY__}
          onClose={() => setShowProjectHistory(false)}
        />
      )}
      {showLearningModules && (
        <LearningModulesModal
          onClose={() => setShowLearningModules(false)}
          onLoadExample={loadEducationalExample}
        />
      )}
      {showTemplates && (
        <TemplatesModal
          theme={theme}
          onClose={() => setShowTemplates(false)}
          onApplyTemplate={applyTemplate}
          onLoadExample={loadEducationalExample}
        />
      )}
      {/* ===== ZOOM CONTROLS ===== */}
      <ZoomControls
        theme={theme}
        scale={transform.scale}
        onZoomIn={() => setTransform(t => ({ ...t, scale: clamp_scale(t.scale * 1.2) }))}
        onZoomOut={() => setTransform(t => ({ ...t, scale: clamp_scale(t.scale / 1.2) }))}
        onFitToContent={fitToContent}
      />
      {/* ===== ELEMENT COUNT ===== */}
      {elements.length > 0 && <ElementCount theme={theme} count={elements.length} />}
      <style>{`
        * { -webkit-tap-highlight-color: transparent; }
        html, body { overscroll-behavior: none; position: fixed; overflow: hidden; width: 100%; height: 100%; }
        ::-webkit-scrollbar { display: none; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <HelpPanel />
    </div>
  )
}
