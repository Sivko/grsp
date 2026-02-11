/// <reference types="vite/client" />

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module "@jitsi/rnnoise-wasm" {
  export function createRNNWasmModule(moduleOverrides?: Record<string, unknown>): Promise<{
    _malloc: (bytes: number) => number;
    _free: (ptr: number) => void;
    HEAPF32: Float32Array;
    _rnnoise_create: () => number;
    _rnnoise_destroy: (state: number) => void;
    _rnnoise_process_frame: (state: number, output: number, input: number) => void;
  }>;
  export function createRNNWasmModuleSync(moduleOverrides?: Record<string, unknown>): unknown;
}
