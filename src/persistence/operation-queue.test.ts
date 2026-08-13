import { describe, expect, it, vi } from 'vitest'
import { createOperationQueue } from './operation-queue'

describe('createOperationQueue', () => {
  it('runs queued operations in request order, including after a rejection', async () => {
    const queue = createOperationQueue()
    const events: string[] = []
    let releaseFirst!: () => void
    const first = queue.run(async () => {
      events.push('first-start')
      await new Promise<void>(resolve => { releaseFirst = resolve })
      events.push('first-end')
      return 'first'
    })
    const second = queue.run(async () => {
      events.push('second')
      throw new Error('expected failure')
    })
    const third = queue.run(async () => {
      events.push('third')
      return 'third'
    })

    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf('function'))
    releaseFirst()
    await expect(first).resolves.toBe('first')
    await expect(second).rejects.toThrow('expected failure')
    await expect(third).resolves.toBe('third')
    expect(events).toEqual(['first-start', 'first-end', 'second', 'third'])
  })

  it('does not start a later operation until the prior promise settles', async () => {
    const queue = createOperationQueue()
    let release!: () => void
    let started = false
    const first = queue.run(() => new Promise<void>(resolve => { release = resolve }))
    const second = queue.run(async () => { started = true })

    await Promise.resolve()
    expect(started).toBe(false)
    release()
    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(started).toBe(true)
  })
})
