#!/usr/bin/env node
/**
 * Prints a compact pass/fail list from an HTML Playwright report.
 *
 * CI logs are not always reachable (for example from a sandbox without access to
 * the Actions blob storage), but the job summary page is. This script turns the
 * self-contained `playwright-report/index.html` into plain text so the summary
 * can answer the only question that matters after a red run: *which* tests
 * failed. Used by the "Summarize end-to-end results" step in `.github/workflows/ci.yml`.
 *
 * Usage: node scripts/summarize-playwright-report.mjs [reportDir]
 * Exit code is always 0 — summarising must not change the job conclusion.
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const reportDir = process.argv[2] ?? "playwright-report";
const index = join(reportDir, "index.html");

function fail(message) {
  console.log(`could not summarise: ${message}`);
}

if (!existsSync(index)) {
  fail(`no ${index}`);
  process.exit(0);
}

const html = readFileSync(index, "utf8");
const match =
  /window\.playwrightReportBase64 = 'data:application\/zip;base64,([^']+)'/.exec(
    html,
  );
if (!match) {
  fail("report has no embedded zip (older or non-self-contained report)");
  process.exit(0);
}

const workdir = mkdtempSync(join(tmpdir(), "pw-report-"));
const zip = join(workdir, "report.zip");
writeFileSync(zip, Buffer.from(match[1], "base64"));
try {
  execFileSync("unzip", ["-o", "-q", zip, "-d", workdir]);
} catch (error) {
  fail(`unzip failed: ${error.message}`);
  process.exit(0);
}

const rows = [];
function walkSuites(suites, fileTitle, parentTitles) {
  for (const suite of suites ?? []) {
    const title = suite.title || fileTitle;
    const trail = suite.title ? [...parentTitles, suite.title] : parentTitles;
    for (const spec of suite.specs ?? []) {
      const results = spec.tests?.flatMap((test) => test.results ?? []) ?? [];
      const statuses = results.map((result) => result.status);
      const failed =
        spec.ok === false ||
        statuses.some((status) => status !== "passed" && status !== "skipped");
      const duration = results.reduce(
        (total, result) => total + (result.duration ?? 0),
        0,
      );
      rows.push({
        file: fileTitle,
        title: [...trail, spec.title].join(" > "),
        failed,
        duration,
        error:
          results
            .find((result) => result.error?.message)
            ?.error?.message?.split("\n")[0] ?? "",
      });
    }
    walkSuites(suite.suites, fileTitle, trail);
  }
}

for (const entry of readdirSync(workdir)) {
  if (!entry.endsWith(".json")) continue;
  let report;
  try {
    report = JSON.parse(readFileSync(join(workdir, entry), "utf8"));
  } catch {
    continue;
  }
  for (const file of report.files ?? []) {
    walkSuites(file.suites, file.fileName, []);
    for (const spec of file.tests ?? []) {
      const results = spec.results ?? [];
      rows.push({
        file: file.fileName,
        title: spec.path?.join(" > ") ?? spec.title ?? "(untitled)",
        failed: results.some(
          (result) => result.status !== "passed" && result.status !== "skipped",
        ),
        duration: results.reduce(
          (total, result) => total + (result.duration ?? 0),
          0,
        ),
        error:
          results
            .find((result) => result.error?.message)
            ?.error?.message?.split("\n")[0] ?? "",
      });
    }
  }
}

if (!rows.length) {
  fail("report contained no test entries");
  process.exit(0);
}

const failed = rows.filter((row) => row.failed);
console.log(`total: ${rows.length}, failed: ${failed.length}`);
for (const row of failed) {
  console.log(`FAIL  [${row.file}] ${row.title}`);
  if (row.error) console.log(`        ${row.error.slice(0, 300)}`);
}
if (!failed.length) console.log("no failures");
