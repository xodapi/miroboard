import { test, expect, type Browser, type Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const examples = [
  'basic-fixed.json',
  'parallel-queue.json',
  'sla-calendar.json',
  'batch-workload.json',
  'priority-queue.json',
  'fifo-vs-priority.json',
]
const expressions = {
  createBpmnModel: 'window.__MIROBOARD_DEBUG__.createBpmnModel()',
  validateBpmn: 'window.__MIROBOARD_DEBUG__.validateBpmn()',
  runBpmn: 'window.__MIROBOARD_DEBUG__.runBpmn()',
  simulateBpmn: 'window.__MIROBOARD_DEBUG__.simulateBpmn(42, 500)',
}

type SessionKind = 'first-load' | 'same-session-reload' | 'post-browser-restart'

async function prepare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__MIROBOARD_DISABLE_COLLABORATION__ = true
    localStorage.setItem('miro-onboarding-seen', 'true')
  })
}

async function capture(page: Page, fixture: ReturnType<typeof readFixture>, kind: SessionKind, id: string, captureId: string, navigate = true) {
  if (navigate) await page.goto('/')
  await page.getByRole('button', { name: 'Примеры' }).click()
  const modal = page.getByRole('heading', { name: 'Учебные BPMN-модули' }).locator('xpath=ancestor::section')
  await modal.getByRole('button', { name: new RegExp(fixture.title) }).click()
  const toast = page.getByText(`Загружен модуль: ${fixture.title}`, { exact: false })
  await expect(toast).toBeVisible()
  const groups = page.locator('svg g[data-id]')
  await expect(groups).toHaveCount(fixture.elementCount)
  const payload = await page.evaluate((calls) => {
    const hook = window.__MIROBOARD_DEBUG__
    if (!hook) throw new Error('debug hook is unavailable')
    return {
      createBpmnModel: hook.createBpmnModel(),
      validateBpmn: hook.validateBpmn(),
      runBpmn: hook.runBpmn(),
      simulateBpmn: hook.simulateBpmn(42, 500),
    }
  }, expressions)
  const simulation = payload.simulateBpmn as { completedRuns?: number } | null
  const model = payload.createBpmnModel as { nodes?: unknown[] } | null
  const run = payload.runBpmn as { tokenPath?: unknown[] } | null
  expect(model?.nodes?.length, 'model must contain nodes').toBeGreaterThan(0)
  expect(run?.tokenPath?.length, 'run must contain a token trace').toBeGreaterThan(0)
  expect(simulation?.completedRuns).toBe(500)
  const capturedAt = new Date().toISOString()
  const artifact = {
    provenance: {
      captureId, capturedAt, url: page.url(), sessionKind: kind,
      browserSessionId: id, buildMode: 'test-build-with-debug-hook',
      captureScript: 'tests/baseline-capture.spec.ts',
      loadGate: {
        toastSeen: `Загружен модуль: ${fixture.title}`,
        expectedGDataIdCount: fixture.elementCount,
        observedGDataIdCount: await groups.count(),
      },
      invocations: Object.entries(expressions).map(([target, expression]) => ({
        target, howInvoked: 'page.evaluate via window.__MIROBOARD_DEBUG__', expression,
        ...(target === 'simulateBpmn' ? { seed: 42, runs: 500 } : {}),
      })),
    },
    payload,
  }
  return artifact
}

function readFixture(name: string) {
  const fixture = JSON.parse(readFileSync(join(root, 'examples', name), 'utf8')) as {
    title: string; model: { nodes: unknown[]; flows: unknown[] }
  }
  return { ...fixture, elementCount: fixture.model.nodes.length + fixture.model.flows.length }
}

function hashPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

test('capture immutable BPMN simulation baseline', async ({ browser }) => {
  test.setTimeout(10 * 60_000)
  rmSync(join(root, 'baseline'), { recursive: true, force: true })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  for (const name of examples) {
    const fixture = readFixture(name)
    const moduleName = name.replace(/\.json$/, '')
    const dir = join(root, 'baseline', moduleName)
    mkdirSync(dir, { recursive: true })
    const contexts: { context: Awaited<ReturnType<Browser['newContext']>>; id: string }[] = []
    const first = await browser.newContext()
    const firstId = `${moduleName}-context-1`
    contexts.push({ context: first, id: firstId })
    await prepare(await first.newPage())
    const page1 = first.pages()[0]
    const artifact1 = await capture(page1, fixture, 'first-load', firstId, 'capture1')
    writeArtifact(dir, 'capture1', artifact1)
    await page1.reload()
    const artifact2 = await capture(page1, fixture, 'same-session-reload', firstId, 'capture2', false)
    writeArtifact(dir, 'capture2', artifact2)
    await first.close()
    const third = await browser.newContext()
    const thirdId = `${moduleName}-context-3`
    const page3 = await third.newPage()
    await prepare(page3)
    const artifact3 = await capture(page3, fixture, 'post-browser-restart', thirdId, 'capture3')
    writeArtifact(dir, 'capture3', artifact3)
    await third.close()
    const artifacts = [artifact1, artifact2, artifact3]
    const hashes = artifacts.map(item => hashPayload(item.payload))
    expect(new Set(hashes).size, `${name} payloads must be byte-identical`).toBe(1)
    const canonical = { payload: artifact1.payload, sha256: hashes[0], provenanceSummary: artifacts.map(item => item.provenance) }
    writeFileSync(join(dir, 'baseline.json'), `${JSON.stringify(canonical, null, 2)}\n`)
    writeFileSync(join(dir, 'README.md'), `# ${fixture.title}\n\nSource: \`examples/${name}\`\n\n- Captured at: ${artifact1.provenance.capturedAt}\n- Commit: \`${commit}\`\n- Seed: 42\n- Runs: 500\n- Expected SVG element count: ${fixture.elementCount}\n- Result payload SHA256: \`${hashes[0]}\`\n\nThis baseline is NEVER regenerated to make a test pass.\n`)
  }
  writeFileSync(join(root, 'baseline', 'README.md'), `# BPMN Simulation Baseline (M0)\n\nCaptured at commit \`${commit}\`, before \`src/format/\` exists, via the test build and \`tests/baseline-capture.spec.ts\` driving the real UI through \`window.__MIROBOARD_DEBUG__\`.\n\n## Purpose\n\nThis baseline is the immutable oracle for BPMN regression tests and migration invariance.\n\n## Immutability Rule\n\n**These artifacts are NEVER edited or regenerated to make a test pass.** A mismatch is a regression to investigate, not a reason to update this baseline.\n\n## Expected Element Counts\n\n| Module | Nodes+Flows |\n| --- | ---: |\n${examples.map(name => { const f = readFixture(name); return `| ${name} | ${f.elementCount} |` }).join('\n')}\n\n## Capture Method\n\nEach module has independent first-load, same-session-reload, and post-browser-restart captures. Result payloads are SHA256-verified byte-identical, with seed=42 and runs=500; each module README records its shared hash.\n`)
})

function writeArtifact(dir: string, captureId: string, artifact: unknown) {
  const target = join(dir, captureId)
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`)
}
