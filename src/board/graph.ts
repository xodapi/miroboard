/**
 * One graph for every notation.
 *
 * BPMN, eEPC, VACD and a mind-map are profiles on the same nodes and edges.
 * The graph has no coordinates: a frame stays on the element, and moving a
 * shape does not invent a second place for the same mark. ARIS AML is a
 * proprietary export and is refused, not parsed.
 */
import type { BoardElement, NotationId, NotationMark, Point } from './types'

export type NotationTool = 'event' | 'function' | 'xor' | 'org' | 'step' | 'topic' | 'link'

const NOTATION_SPECS: Record<Exclude<NotationTool, 'link'>, {
  type: BoardElement['type']
  w: number
  h: number
  text: string
  color: string
  notation: NotationMark
}> = {
  event: { type: 'circle', w: 140, h: 80, text: 'Событие', color: '#059669', notation: { id: 'eepc', symbol: 'event' } },
  function: { type: 'rect', w: 168, h: 72, text: 'Функция', color: '#2563EB', notation: { id: 'eepc', symbol: 'function' } },
  xor: { type: 'rect', w: 136, h: 72, text: 'X', color: '#D97706', notation: { id: 'eepc', symbol: 'xor' } },
  org: { type: 'rect', w: 148, h: 56, text: 'Роль', color: '#7C3AED', notation: { id: 'eepc', symbol: 'org' } },
  step: { type: 'rect', w: 168, h: 64, text: 'Шаг', color: '#0F766E', notation: { id: 'vacd', symbol: 'step' } },
  topic: { type: 'text', w: 148, h: 48, text: 'Тема', color: '#111827', notation: { id: 'mindmap', symbol: 'topic' } },
}

/** A new mark, centred on the click. The frame is the only coordinate system. */
export function notationElement(kind: Exclude<NotationTool, 'link'>, at: Point, id: string): BoardElement {
  const spec = NOTATION_SPECS[kind]
  return {
    id,
    type: spec.type,
    x: at.x - spec.w / 2,
    y: at.y - spec.h / 2,
    w: spec.w,
    h: spec.h,
    text: spec.text,
    color: spec.color,
    stroke: 2,
    // White fill: the label is black, and a saturated fill hides it on both themes.
    fill: spec.type === 'text' ? undefined : '#ffffff',
    notation: { ...spec.notation },
  }
}

/**
 * Joins two marks of one notation. A mind-map join is a parent, not a second
 * edge on top of parentId. Different notations do not join.
 */
export type NotationJoin =
  | { kind: 'edge'; element: BoardElement }
  | { kind: 'parent'; id: string; parentId: string }
  | { kind: 'refused'; message: string }

function refused(message: string): NotationJoin {
  return { kind: 'refused', message }
}

function wouldCycle(sourceId: string, targetId: string, board: readonly BoardElement[]): boolean {
  const parentOf = new Map(board.map(element => [element.id, element.notation?.parentId]))
  const seen = new Set<string>()
  let current: string | undefined = sourceId
  while (current) {
    if (current === targetId || seen.has(current)) return true
    seen.add(current)
    current = parentOf.get(current)
  }
  return false
}

function alreadyJoined(source: BoardElement, target: BoardElement, board: readonly BoardElement[]): boolean {
  return board.some(element =>
    Boolean(element.notation?.relation)
    && element.notation?.id === source.notation?.id
    && element.link?.sourceId === source.id
    && element.link?.targetId === target.id)
}

function acceptJoin(
  join: Exclude<NotationJoin, { kind: 'refused' }>,
  board: readonly BoardElement[] | undefined,
  target: BoardElement,
): NotationJoin {
  if (!board) return join
  const before = new Set(validateGraph(board).map(issue => `${issue.code}:${issue.id ?? ''}`))
  const next = join.kind === 'edge'
    ? [...board, join.element]
    : board.map(element => element.id === target.id
      ? { ...target, notation: { ...target.notation!, parentId: join.parentId } }
      : element)
  const fresh = validateGraph(next).find(issue => !before.has(`${issue.code}:${issue.id ?? ''}`))
  return fresh ? refused(fresh.message) : join
}

export function notationJoin(
  source: BoardElement,
  target: BoardElement,
  id: string,
  board?: readonly BoardElement[],
): NotationJoin | null {
  if (!source.notation || !target.notation || source.notation.id !== target.notation.id) return null
  if (source.notation.relation || target.notation.relation || source.id === target.id) return null
  if (source.notation.id === 'mindmap') {
    if (source.notation.symbol !== 'topic' || target.notation.symbol !== 'topic') return refused('Связь карты соединяет только темы.')
    const current = board?.find(element => element.id === target.id) ?? target
    if (current.notation?.parentId) return refused('У темы уже есть родитель.')
    if (board && wouldCycle(source.id, target.id, board)) return refused('Такая связь замыкает карту в цикл.')
    return acceptJoin({ kind: 'parent', id: target.id, parentId: source.id }, board, target)
  }
  if (source.notation.id === 'vacd') {
    if (source.notation.symbol !== 'step' || target.notation.symbol !== 'step') return refused('Цепочка соединяет только шаги.')
  } else {
    const symbols = [source.notation.symbol, target.notation.symbol]
    const annotation = symbols.filter(symbol => symbol === 'org' || symbol === 'info').length
    if (annotation && (!symbols.includes('function') || annotation !== 1)) {
      return refused('Роль в eEPC назначается функции, не событию и не другой роли.')
    }
  }
  if (board && alreadyJoined(source, target, board)) return refused('Такая связь уже есть.')
  const relation = source.notation.id === 'vacd'
    ? 'sequence'
    : (source.notation.symbol === 'org' || target.notation.symbol === 'org' || source.notation.symbol === 'info' || target.notation.symbol === 'info'
      ? 'orgAssignment'
      : 'controlFlow')
  return acceptJoin({
    kind: 'edge',
    element: {
      id,
      type: 'arrow',
      x: source.x,
      y: source.y,
      w: target.x - source.x,
      h: target.y - source.y,
      // Mid slate stays visible on the light canvas and on the dark one.
      color: '#64748b',
      stroke: 2,
      link: { sourceId: source.id, targetId: target.id },
      notation: { id: source.notation.id, symbol: relation, relation },
    },
  }, board, target)
}

export interface GraphNode {
  id: string
  notation: 'bpmn' | NotationId
  symbol: string
  text?: string
  role?: string
  refines?: string
}

export interface GraphEdge {
  id: string
  notation: 'bpmn' | NotationId
  sourceId: string
  targetId: string
  relation: string
}

export interface GraphIssue {
  code: string
  message: string
  id?: string
}

const PROCESS = new Set(['event', 'function'])
const CONNECTORS = new Set(['and', 'or', 'xor'])
const ANNOTATIONS = new Set(['org', 'info'])

function issue(code: string, message: string, id?: string): GraphIssue {
  return id === undefined ? { code, message } : { code, message, id }
}

function mixed(element: BoardElement): boolean {
  return Boolean(element.notation && (element.bpmnNodeType || element.bpmnFlow))
}

function nodeOf(element: BoardElement, notation: GraphNode['notation'], symbol: string): GraphNode {
  const node: GraphNode = { id: element.id, notation, symbol }
  if (element.text) node.text = element.text
  if (element.notation?.role) node.role = element.notation.role
  if (element.notation?.refines) node.refines = element.notation.refines
  return node
}

/** Projects marks into nodes and edges. A free shape is not part of the graph. */
export function projectGraph(elements: readonly BoardElement[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  for (const element of elements) {
    if (mixed(element)) continue
    if (element.bpmnFlow) {
      edges.push({
        id: element.id,
        notation: 'bpmn',
        sourceId: element.bpmnFlow.sourceId,
        targetId: element.bpmnFlow.targetId,
        relation: element.bpmnFlow.flowType ?? 'sequence',
      })
      continue
    }
    if (element.bpmnNodeType) {
      nodes.push(nodeOf(element, 'bpmn', element.bpmnNodeType))
      continue
    }
    const mark = element.notation
    if (!mark) continue
    const sourceId = element.link?.sourceId
    const targetId = element.link?.targetId
    // A relation is an edge. A missing end must not become a fake node.
    if (mark.relation) {
      if (sourceId && targetId) edges.push({ id: element.id, notation: mark.id, sourceId, targetId, relation: mark.relation })
      continue
    }
    nodes.push(nodeOf(element, mark.id, mark.symbol))
    if (mark.id === 'mindmap' && mark.parentId) {
      edges.push({
        id: `${element.id}→${mark.parentId}`,
        notation: 'mindmap',
        sourceId: mark.parentId,
        targetId: element.id,
        relation: 'branch',
      })
    }
  }
  return { nodes, edges }
}

function nextProcess(
  start: string,
  outgoing: ReadonlyMap<string, readonly string[]>,
  symbols: ReadonlyMap<string, string>,
): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const queue = [...(outgoing.get(start) ?? [])]
  while (queue.length) {
    const id = queue.shift()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const symbol = symbols.get(id)
    if (symbol && PROCESS.has(symbol)) found.push(id)
    else if (symbol && CONNECTORS.has(symbol)) queue.push(...(outgoing.get(id) ?? []))
  }
  return found
}

function eepcIssues(elements: readonly BoardElement[]): GraphIssue[] {
  const symbols = new Map<string, string>()
  for (const element of elements) {
    if (element.notation?.id === 'eepc' && element.notation.symbol) symbols.set(element.id, element.notation.symbol)
  }
  const outgoing = new Map<string, string[]>()
  const issues: GraphIssue[] = []
  for (const element of elements) {
    if (element.notation?.id !== 'eepc' || element.notation.relation !== 'controlFlow') continue
    const sourceId = element.link?.sourceId
    const targetId = element.link?.targetId
    if (!sourceId || !targetId) continue
    const source = symbols.get(sourceId)
    const target = symbols.get(targetId)
    if ((source && ANNOTATIONS.has(source)) || (target && ANNOTATIONS.has(target))) {
      issues.push(issue('eepc-annotation', 'Управляющий поток eEPC не садится на подразделение или носитель информации.', element.id))
      continue
    }
    outgoing.set(sourceId, [...(outgoing.get(sourceId) ?? []), targetId])
  }
  const reported = new Set<string>()
  for (const [id, symbol] of symbols) {
    if (!PROCESS.has(symbol)) continue
    for (const reached of nextProcess(id, outgoing, symbols)) {
      if (symbols.get(reached) !== symbol || reported.has(`${id}>${reached}`)) continue
      reported.add(`${id}>${reached}`)
      issues.push(issue('eepc-alternation', 'В eEPC событие и функция чередуются.', id))
    }
  }
  for (const element of elements) {
    if (element.notation?.id !== 'eepc' || element.notation.relation !== 'orgAssignment') continue
    const sourceId = element.link?.sourceId
    const targetId = element.link?.targetId
    if (!sourceId || !targetId) continue
    const ends = [symbols.get(sourceId), symbols.get(targetId)]
    const annotation = ends.filter(symbol => symbol === 'org' || symbol === 'info').length
    if (!ends.includes('function') || annotation !== 1) {
      issues.push(issue('eepc-assignment', 'Роль в eEPC назначается функции, не событию и не другой роли.', element.id))
    }
  }
  return issues
}

function mindmapIssues(elements: readonly BoardElement[]): GraphIssue[] {
  const topics = elements.filter(element => element.notation?.id === 'mindmap' && element.notation.symbol === 'topic' && !element.notation.relation)
  if (!topics.length) return []
  const byId = new Map(topics.map(topic => [topic.id, topic]))
  const issues: GraphIssue[] = []
  if (topics.filter(topic => !topic.notation?.parentId).length !== 1) {
    issues.push(issue('mindmap-roots', 'У ментальной карты должен быть один корень.'))
  }
  for (const topic of topics) {
    const parentId = topic.notation?.parentId
    if (parentId && !byId.has(parentId)) issues.push(issue('mindmap-parent', 'Ветка ссылается на тему, которой нет на доске.', topic.id))
  }
  let cycle = false
  for (const topic of topics) {
    const path = new Set<string>()
    let current: BoardElement | undefined = topic
    while (current?.notation?.parentId) {
      if (path.has(current.id)) {
        cycle = true
        break
      }
      path.add(current.id)
      current = byId.get(current.notation.parentId)
    }
    if (cycle) break
  }
  if (cycle) issues.push(issue('mindmap-cycle', 'В ментальной карте не может быть цикла.'))
  return issues
}

function vacdIssues(elements: readonly BoardElement[]): GraphIssue[] {
  const byId = new Map(elements.map(element => [element.id, element]))
  const steps = elements.filter(element => element.notation?.id === 'vacd' && element.notation.symbol === 'step')
  const outgoing = new Map<string, string[]>()
  const issues: GraphIssue[] = []
  for (const element of elements) {
    if (element.notation?.id !== 'vacd' || element.notation.relation !== 'sequence') continue
    const sourceId = element.link?.sourceId
    const targetId = element.link?.targetId
    if (!sourceId || !targetId || !byId.has(sourceId) || !byId.has(targetId)) {
      issues.push(issue('vacd-dangling', 'Звено цепочки указывает на отсутствующий шаг.', element.id))
      continue
    }
    outgoing.set(sourceId, [...(outgoing.get(sourceId) ?? []), targetId])
  }
  for (const [id, targets] of outgoing) {
    if (targets.length > 1) issues.push(issue('vacd-branch', 'Цепочка добавленной стоимости — одна последовательность, не развилка.', id))
  }
  const seen = new Set<string>()
  const stack = new Set<string>()
  const cyclic = (id: string): boolean => {
    if (stack.has(id)) return true
    if (seen.has(id)) return false
    seen.add(id)
    stack.add(id)
    for (const next of outgoing.get(id) ?? []) {
      if (cyclic(next)) return true
    }
    stack.delete(id)
    return false
  }
  if (steps.some(step => cyclic(step.id))) issues.push(issue('vacd-cycle', 'В цепочке добавленной стоимости не может быть цикла.'))
  for (const step of steps) {
    const refines = step.notation?.refines
    if (refines && !byId.has(refines)) issues.push(issue('vacd-refinement', 'Уточнение шага указывает на элемент, которого нет на доске.', step.id))
  }
  return issues
}

/** Structural rules of each profile. A free shape has nothing to violate. */
export function validateGraph(elements: readonly BoardElement[]): GraphIssue[] {
  const issues: GraphIssue[] = []
  const usable: BoardElement[] = []
  for (const element of elements) {
    if (mixed(element)) issues.push(issue('notation-mixed', 'Один элемент не может быть сразу BPMN и другой нотацией.', element.id))
    else usable.push(element)
  }
  return [...issues, ...eepcIssues(usable), ...mindmapIssues(usable), ...vacdIssues(usable)]
}

/**
 * Nearest mind-map parent that is not being deleted, or none if the chain ends.
 * A deleted middle topic hands its children to that parent instead of dangling.
 */
export function notationPatchesForRemoval(
  elements: readonly BoardElement[],
  removing: ReadonlySet<string>,
): { id: string; updates: Partial<BoardElement> }[] {
  const byId = new Map(elements.map(element => [element.id, element]))
  const patches: { id: string; updates: Partial<BoardElement> }[] = []
  for (const element of elements) {
    if (removing.has(element.id) || !element.notation) continue
    const notation = { ...element.notation }
    let changed = false
    if (notation.parentId && removing.has(notation.parentId)) {
      const parentId = survivingParent(notation.parentId, byId, removing)
      if (parentId) notation.parentId = parentId
      else delete notation.parentId
      changed = true
    }
    if (notation.refines && removing.has(notation.refines)) {
      delete notation.refines
      changed = true
    }
    if (changed) patches.push({ id: element.id, updates: { notation } })
  }
  return patches
}

function survivingParent(
  startId: string,
  byId: ReadonlyMap<string, BoardElement>,
  removing: ReadonlySet<string>,
): string | undefined {
  let current: string | undefined = startId
  const seen = new Set<string>()
  while (current && removing.has(current)) {
    if (seen.has(current)) return undefined
    seen.add(current)
    current = byId.get(current)?.notation?.parentId
  }
  return current
}

/** Classifies a dropped file. AML is refused; it is not a graph. */
export function classifyNotationSource(text: string): 'mboard' | 'aris-aml' | 'unknown' {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { format?: unknown }
      return parsed.format === 'mboard' ? 'mboard' : 'unknown'
    } catch {
      return 'unknown'
    }
  }
  if (/<\s*AML[\s>]/i.test(trimmed)) return 'aris-aml'
  return 'unknown'
}

const NOTATION_IDS: readonly NotationId[] = ['eepc', 'vacd', 'mindmap']

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Reads one notation namespace. Unknown namespaces stay untouched. */
export function readNotation(profileData: Record<string, unknown> | undefined): NotationMark | undefined {
  if (!profileData) return undefined
  for (const id of NOTATION_IDS) {
    const raw = profileData[id]
    if (typeof raw !== 'object' || raw === null) continue
    const data = raw as Record<string, unknown>
    const symbol = stringField(data.symbol)
    if (!symbol) continue
    const mark: NotationMark = { id, symbol }
    const role = stringField(data.role)
    const parentId = stringField(data.parent)
    const refines = stringField(data.refines)
    const relation = stringField(data.relation)
    if (role) mark.role = role
    if (parentId) mark.parentId = parentId
    if (data.collapsed === true) mark.collapsed = true
    if (refines) mark.refines = refines
    if (relation) mark.relation = relation
    return mark
  }
  return undefined
}

/** The profileData entry for a mark. Empty when the element is a free shape. */
export function notationProfile(mark: NotationMark | undefined): Record<string, Record<string, unknown>> {
  if (!mark) return {}
  const data: Record<string, unknown> = { symbol: mark.symbol }
  if (mark.role) data.role = mark.role
  if (mark.parentId) data.parent = mark.parentId
  if (mark.collapsed) data.collapsed = true
  if (mark.refines) data.refines = mark.refines
  if (mark.relation) data.relation = mark.relation
  return { [mark.id]: data }
}
