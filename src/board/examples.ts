import basicFixedExample from '../../examples/basic-fixed.json'
import parallelQueueExample from '../../examples/parallel-queue.json'
import slaCalendarExample from '../../examples/sla-calendar.json'
import batchWorkloadExample from '../../examples/batch-workload.json'
import priorityQueueExample from '../../examples/priority-queue.json'
import fifoPriorityExample from '../../examples/fifo-vs-priority.json'
import type { EducationalExample } from './types'

/**
 * The teaching set behind the «Примеры» menu. Bundled at build time, so opening
 * one works with no network — which matters because the app is offline-first
 * (tests/offline.spec.ts asserts zero non-file/data/blob requests).
 */
export const EDUCATIONAL_EXAMPLES = [
  basicFixedExample, parallelQueueExample, slaCalendarExample,
  batchWorkloadExample, priorityQueueExample, fifoPriorityExample,
] as unknown as EducationalExample[]
