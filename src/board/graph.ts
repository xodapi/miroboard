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
  event: { type: 'circle', w: 78, h: 78, text: 'Событие', color: '#059669', notation: { id: 'eepc', symbol: 'event' } },
  function: { type: 'rect', w: 168, h: 72, text: 'Функция', color: '#2563EB', notation: { id: 'eepc', symbol: 'function' } },
  xor: { type: 'rect', w: 72, h: 72, text: 'X', color: '#D97706', notation: { id: 'eepc', symbol: 'xor' } },
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
    fill: spec.type === 'text' ? undefined : spec.color,
    notation: { ...spec.notation },
  }
}

/**
 * Joins two marks of one notation. A mind-map join is a parent, not a second
 * edge on top of parentId. Different notations do not join.
 */
export function notationJoin(
  source: BoardElement,
  target: BoardElement,
  id: string,
): { kind: 'edge'; element: BoardElement } | { kind: 'parent'; id: string; parentId: string } | null {
  if (!source.notation || !target.notation || source.notation.id !== target.notation.id) return null
  if (source.notation.relation || target.notation.relation || source.id === target.id) return null
  if (source.notation.id === 'mindmap') return { kind: 'parent', id: target.id, parentId: source.id }
  const relation = source.notation.id === 'vacd'
    ? 'sequence'
    : (source.notation.symbol === 'org' || target.notation.symbol === 'org' ? 'orgAssignment' : 'controlFlow')
  return {
    kind: 'edge',
    element: {
      id,
      type: 'arrow',
      x: source.x,
      y: source.y,
      w: target.x - source.x,
      h: target.y - source.y,
      color: '#334155',
      stroke: 2,
      link: { sourceId: source.id, targetId: target.id },
      notation: { id: source.notation.id, symbol: relation, relation },
    },
  }
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
    if (mark.relation && sourceId && targetId) {
      edges.push({ id: element.id, notation: mark.id, sourceId, targetId, relation: mark.relation })
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

/** Classifies a dropped file. AML is refused; it is not a graph. */
export function classifyNotationSource(text: string): 'mboard' | 'aris-aml' | 'unknown' {
  if (/<\s*AML[\s>]/i.test(text)) return 'aris-aml'
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return 'unknown'
  try {
    const parsed = JSON.parse(trimmed) as { format?: unknown }
    return parsed.format === 'mboard' ? 'mboard' : 'unknown'
  } catch {
    return 'unknown'
  }
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
