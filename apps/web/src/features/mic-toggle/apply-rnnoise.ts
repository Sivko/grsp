/**
 * RNNnoise — подавление шума через нейросеть (Mozilla/Xiph).
 * Использует @jitsi/rnnoise-wasm, работает с кадрами по 480 сэмплов (48 kHz).
 */

const RNNNOISE_FRAME_SIZE = 480;

type RNNoiseModule = {
  _malloc: (bytes: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
  _rnnoise_create: () => number;
  _rnnoise_destroy: (state: number) => void;
  _rnnoise_process_frame: (state: number, output: number, input: number) => void;
};

let modulePromise: Promise<RNNoiseModule> | null = null;

async function getRNNoiseModule(): Promise<RNNoiseModule> {
  if (modulePromise) return modulePromise;
  const { createRNNWasmModule } = await import("@jitsi/rnnoise-wasm");
  const wasmUrl = (await import("@jitsi/rnnoise-wasm/dist/rnnoise.wasm?url")).default;
  modulePromise = createRNNWasmModule({
    locateFile: (path: string) => (path.endsWith(".wasm") ? wasmUrl : path),
  });
  return modulePromise;
}

/**
 * Применяет RNNnoise к аудиопотоку.
 * Использует ScriptProcessorNode (deprecated, но работает везде).
 * @returns stream и stop для освобождения ресурсов
 */
export async function applyRNNoise(
  rawStream: MediaStream,
  _options?: Record<string, never>
): Promise<{ stream: MediaStream; context: AudioContext; stop: () => void }> {
  const Mod = await getRNNoiseModule();
  const state = Mod._rnnoise_create();
  const inputPtr = Mod._malloc(RNNNOISE_FRAME_SIZE * 4);
  const outputPtr = Mod._malloc(RNNNOISE_FRAME_SIZE * 4);

  const ctx = new AudioContext({ sampleRate: 48000 });
  const source = ctx.createMediaStreamSource(rawStream);

  const inputQueue: number[] = [];
  const outputQueue: number[] = [];

  const processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);

    for (let i = 0; i < input.length; i++) {
      inputQueue.push(input[i]!);
    }

    while (inputQueue.length >= RNNNOISE_FRAME_SIZE) {
      const frame = new Float32Array(inputQueue.splice(0, RNNNOISE_FRAME_SIZE));
      Mod.HEAPF32.set(frame, inputPtr >> 2);
      Mod._rnnoise_process_frame(state, outputPtr, inputPtr);
      const out = Mod.HEAPF32.slice(outputPtr >> 2, (outputPtr >> 2) + RNNNOISE_FRAME_SIZE);
      for (let i = 0; i < out.length; i++) outputQueue.push(out[i]!);
    }

    for (let i = 0; i < output.length; i++) {
      output[i] = outputQueue.length > 0 ? outputQueue.shift()! : 0;
    }
  };

  source.connect(processor);
  const dest = ctx.createMediaStreamDestination();
  processor.connect(dest);

  const stop = () => {
    processor.disconnect();
    source.disconnect();
    processor.onaudioprocess = null;
    Mod._rnnoise_destroy(state);
    Mod._free(inputPtr);
    Mod._free(outputPtr);
    ctx.close();
  };

  return { stream: dest.stream, context: ctx, stop };
}
