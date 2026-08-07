/* tslint:disable */
/* eslint-disable */

/**
 * Keeps the viewport scale inside the supported zoom range.
 */
export function clamp_scale(value: number): number;

/**
 * Exports a validated BPMN graph as portable BPMN 2.0 XML. This preserves the
 * executable process graph; BPMN-DI coordinates will follow in a later phase.
 */
export function export_bpmn_xml(model_json: string): string;

/**
 * Rounds a world-coordinate to the nearest grid intersection.
 */
export function snap_to_grid(value: number, grid_size: number): number;

/**
 * Validates a compact BPMN graph. The input and output are JSON strings to
 * keep the browser/WASM boundary stable and easy to persist in a CRDT.
 */
export function validate_bpmn(model_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly export_bpmn_xml: (a: number, b: number) => [number, number, number, number];
    readonly snap_to_grid: (a: number, b: number) => number;
    readonly validate_bpmn: (a: number, b: number) => [number, number];
    readonly clamp_scale: (a: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
