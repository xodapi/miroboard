#!/usr/bin/env node
/**
 * Prints a compact pass/fail summary of an HTML Playwright report.
 *
 * CI job logs live in blob storage that is not always reachable (for example
 * from a sandbox), but the job *summary* page is. This script unpacks the
 * self-contained `playwright-report/index.html` and prints which tests failed
 * and why, so the summary answers the only question that matters after a red
 * run. Used by the 'Summarize end-to-end results' step in
 * `.github/workflows/ci.yml`.
 *
 * Usage: node scripts/summarize-playwright-report.mjs [reportDir] [--annotations]
 *
 * With --annotations it prints GitHub workflow commands (`::error::`) instead of
 * prose. That is not a convenience: annotations are the only CI channel this
 * repo can actually read back, because both job logs and run artifacts are
 * served from blob storage that is unreachable from a sandbox, while
 * annotations come from the ordinary REST API.
 *
 * Always exits 0 — summarising must never change the job conclusion.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const args = process.argv.slice(2)
const annotationsOnly = args.includes('--annotations')
// GitHub keeps at most 10 annotations of a level per step, so CI runs this
// script once per page from a step of its own.
const pageArg = args.find(arg => arg.startsWith('--page='))
const annotationPage = Math.max(1, Number(pageArg?.slice('--page='.length) ?? 1))
const reportDir = args.find(arg => !arg.startsWith('--')) ?? 'playwright-report'
const indexPath = join(reportDir, 'index.html')

function giveUp(reason) {
  console.log(`could not summarise: ${reason}`)
  process.exit(0)
}

if (!existsSync(indexPath)) giveUp(`no ${indexPath} (is the html reporter enabled?)`)

const html = readFileSync(indexPath, 'utf8')
// Playwright embeds the report as a zip inside <template id="playwrightReportBase64">;
// older builds assigned the same data URI to window.playwrightReportBase64. Accept both.
const embedded =
  /<template id="playwrightReportBase64">data:application\/zip;base64,([^<]+)<\/template>/.exec(html) ??
  /window\.playwrightReportBase64\s*=\s*'data:application\/zip;base64,([^']+)'/.exec(html)
if (!embedded) giveUp('report is not self-contained (no embedded zip)')

const zipBuffer = Buffer.from(embedded[1], 'base64')

/** Minimal stored/deflated zip reader, so the summary does not depend on `unzip` being installed. */
function readZipDirectory(buffer) {
  const directory = new Map()
  let endOfDirectory = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65_557); i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06_05_4b_50) {
      endOfDirectory = i
      break
    }
  }
  if (endOfDirectory < 0) throw new Error('not a zip file (no end-of-central-directory record)')
  const entryCount = buffer.readUInt16LE(endOfDirectory + 10)
  let cursor = buffer.readUInt32LE(endOfDirectory + 16)
  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02_01_4b_50) break
    const method = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength)
    directory.set(name, { method, compressedSize, localHeaderOffset })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return directory
}

function readZipEntry(buffer, entry) {
  const local = entry.localHeaderOffset
  const nameLength = buffer.readUInt16LE(local + 26)
  const extraLength = buffer.readUInt16LE(local + 28)
  const start = local + 30 + nameLength + extraLength
  const payload = buffer.subarray(start, start + entry.compressedSize)
  if (entry.method === 0) return payload
  if (entry.method === 8) return inflateRawSync(payload)
  throw new Error(`unsupported compression method ${entry.method}`)
}

function readJson(buffer, directory, name) {
  const entry = directory.get(name)
  if (!entry) return undefined
  return JSON.parse(readZipEntry(buffer, entry).toString('utf8'))
}

let directory
try {
  directory = readZipDirectory(zipBuffer)
} catch (error) {
  giveUp(error.message)
}

const index = readJson(zipBuffer, directory, 'report.json')
if (!index) giveUp('report.json missing from the embedded zip')

// Playwright colours error messages for a terminal; the summary is plain text.
// The escape character is built with fromCharCode because a literal control
// character in this source file would not survive every editor and pipeline.
const ANSI_SEQUENCE = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')
const stripAnsi = value => value.replaceAll(ANSI_SEQUENCE, '')

function firstErrorOf(test, detailedTests) {
  const detailed = detailedTests.find(candidate => candidate.testId === test.testId)
  for (const result of detailed?.results ?? []) {
    for (const error of result.errors ?? []) {
      const message = stripAnsi(error.message ?? '')
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.length > 0)
      if (message.length) return message.slice(0, 4).join(' | ')
    }
  }
  return ''
}

const failures = []
let passed = 0
let skipped = 0
let flaky = 0

for (const file of index.files ?? []) {
  // `report.json` carries one line per test; the per-file payload carries the
  // error messages. Look the latter up lazily so a green run stays cheap.
  let detailedTests = []
  const loadDetails = () => {
    if (!detailedTests.length) {
      detailedTests = readJson(zipBuffer, directory, `${file.fileId}.json`)?.tests ?? []
    }
    return detailedTests
  }
  for (const test of file.tests ?? []) {
    const label = `[${file.fileName}:${test.location?.line ?? '?'}] ${test.title}`
    if (test.outcome === 'skipped') {
      skipped += 1
      continue
    }
    if (test.outcome === 'flaky') flaky += 1
    if (test.ok) {
      passed += 1
      continue
    }
    failures.push({ label, error: firstErrorOf(test, loadDetails()), outcome: test.outcome })
  }
}

const stats = index.stats ?? {}

/**
 * Workflow-command escaping. A property also cannot contain ':' or ',', and a
 * message cannot contain a newline, so both are percent-encoded.
 */
function escapeProperty(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A').replaceAll(':', '%3A').replaceAll(',', '%2C')
}

function escapeMessage(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
}

const ANNOTATION_LIMIT = 10

if (annotationsOnly) {
  if (!failures.length) {
    if (annotationPage === 1) console.log(`::notice title=Playwright::all ${passed} end-to-end tests passed`)
    process.exit(0)
  }
  const from = (annotationPage - 1) * ANNOTATION_LIMIT
  if (from >= failures.length) process.exit(0) // this page is empty
  for (const failure of failures.slice(from, from + ANNOTATION_LIMIT)) {
    const title = escapeProperty(`e2e ${failure.label}`.slice(0, 140))
    const message = escapeMessage(failure.error || `test failed (${failure.outcome})`)
    console.log(`::error title=${title}::${message.slice(0, 400)}`)
  }
  if (annotationPage === 1) {
    const hidden = Math.max(0, failures.length - ANNOTATION_LIMIT)
    console.log(
      hidden > 0
        ? `::notice title=Playwright::${failures.length} e2e tests failed, ${hidden} more annotated by the next step`
        : `::notice title=Playwright::${failures.length} of ${stats.total ?? '?'} e2e tests failed`,
    )
  }
  process.exit(0)
}

console.log(
  `total: ${stats.total ?? passed + skipped + failures.length}, ` +
    `passed: ${passed}, failed: ${failures.length}, flaky: ${flaky}, skipped: ${skipped}`,
)

if (!failures.length) {
  console.log('no failures')
  process.exit(0)
}

console.log('')
console.log('failed tests:')
for (const failure of failures) {
  console.log(`FAIL  ${failure.label}${failure.outcome === 'flaky' ? ' (flaky)' : ''}`)
  if (failure.error) console.log(`      ${failure.error}`)
}
