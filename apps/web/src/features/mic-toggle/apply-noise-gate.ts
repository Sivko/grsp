export interface NoiseGateOptions {
  /** Порог уровня (0–255). Ниже — тишина. Обычно 10–50. */
  threshold: number;
  /** Время открытия в мс при появлении звука. */
  attackMs?: number;
  /** Время закрытия в мс при затухании звука. */
  releaseMs?: number;
}

const DEFAULT_ATTACK_MS = 10;
const DEFAULT_RELEASE_MS = 150;

/**
 * Шлюз тишины (noise gate): передаёт звук только при уровне выше порога.
 * Обрезает тихие звуки (клавиатура, фоновый шум).
 *
 * @returns stream и context для освобождения (context.close(), отмена raf)
 */
export function applyNoiseGate(
  rawStream: MediaStream,
  options: NoiseGateOptions
): { stream: MediaStream; context: AudioContext; stop: () => void } {
  const threshold = Math.max(0, Math.min(255, options.threshold));
  const attackMs = options.attackMs ?? DEFAULT_ATTACK_MS;
  const releaseMs = options.releaseMs ?? DEFAULT_RELEASE_MS;

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(rawStream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;

  const gainNode = ctx.createGain();
  gainNode.gain.value = 0;

  source.connect(analyser);
  source.connect(gainNode);

  const dest = ctx.createMediaStreamDestination();
  gainNode.connect(dest);

  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  let currentGain = 0;
  let rafId = 0;

  const tick = () => {
    analyser.getByteFrequencyData(dataArray);
    const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
    const targetGain = avg > threshold ? 1 : 0;

    const isOpening = targetGain > currentGain;
    const coeff = isOpening
      ? 1 - Math.exp(-1 / ((attackMs / 1000) * 60))
      : 1 - Math.exp(-1 / ((releaseMs / 1000) * 60));

    currentGain += (targetGain - currentGain) * coeff;
    if (currentGain < 0.001) currentGain = 0;
    if (currentGain > 0.999) currentGain = 1;

    gainNode.gain.value = currentGain;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const stop = () => {
    cancelAnimationFrame(rafId);
    ctx.close();
  };

  return { stream: dest.stream, context: ctx, stop };
}
