/**
 * Serializes asynchronous persistence-bound operations. Promise chaining is
 * kept private so one failure cannot prevent later operations from running.
 */
export interface OperationQueue {
  run<T>(operation: () => Promise<T>): Promise<T>
}

export function createOperationQueue(): OperationQueue {
  let tail: Promise<void> = Promise.resolve()

  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(() => operation())
      tail = result.then(() => undefined, () => undefined)
      return result
    },
  }
}
