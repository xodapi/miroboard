# BPMN Simulation Baseline (M0)

Captured at commit 2a8030971c9934727898c4e3a116efd9f0dcadce (v0.15.0) BEFORE src/format/ exists.

## Purpose

This baseline is the immutable oracle for all BPMN regression tests and the M2 migration invariance gate.

## Immutability Rule

**These artifacts are NEVER edited or regenerated to make a test pass.**

If a test fails against this baseline, the failure indicates a regression in BPMN simulation logic, a breaking change in the format adapter, or a change in Yjs snapshot behavior. Investigate and fix the regression, do not update the baseline.

Each module includes three capture copies (same-session capture, reload capture, browser-restart capture) plus canonical baseline.json.

## Modules

- basic-fixed/ — basic-fixed.json, seed=42, runs=500, 3021 bytes
- batch-workload/ — batch-workload.json, seed=42, runs=500, 2587 bytes
- fifo-vs-priority/ — fifo-vs-priority.json, seed=42, runs=500, 3234 bytes
- parallel-queue/ — parallel-queue.json, seed=42, runs=500, 3648 bytes
- priority-queue/ — priority-queue.json, seed=42, runs=500, 3596 bytes
- sla-calendar/ — sla-calendar.json, seed=42, runs=500, 2581 bytes
