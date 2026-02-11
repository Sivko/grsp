/**
 * Эквалайзер для микрофона: подавление клавиатуры и др. нежелательных звуков.
 * Использует BiquadFilterNode для частотной коррекции.
 */

import type { EqualizerPreset } from "@/shared/store/types";

export type { EqualizerPreset };

export interface EqualizerOptions {
  preset: EqualizerPreset;
}

/**
 * Применяет эквалайзер к аудиопотоку.
 * @returns stream и context для освобождения (context.close())
 */
export function applyEqualizer(
  rawStream: MediaStream,
  options: EqualizerOptions
): { stream: MediaStream; context: AudioContext | null } {
  if (options.preset === "none") {
    return { stream: rawStream, context: null };
  }

  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(rawStream);
  const dest = ctx.createMediaStreamDestination();

  const filters: BiquadFilterNode[] = [];

  switch (options.preset) {
    case "keyboard": {
      // Подавление клавиатуры: ослабление высоких частот (2–8 кГц)
      // Клавиатура даёт щелчки в основном выше 2.5 кГц, голос — до ~3.4 кГц
      const shelf = ctx.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 2500;
      shelf.gain.value = -12; // -12 dB выше 2.5 кГц
      filters.push(shelf);
      break;
    }
    case "voice": {
      // Чёткость голоса: лёгкий подъём в области 2–3 кГц (presence)
      const shelf = ctx.createBiquadFilter();
      shelf.type = "peaking";
      shelf.frequency.value = 2500;
      shelf.Q.value = 0.7;
      shelf.gain.value = 3;
      filters.push(shelf);
      break;
    }
    case "voice-keyboard": {
      // Голос + клавиатура: presence (2–3 кГц) + ослабление щелчков (выше 4 кГц)
      // Комбинирует чёткость голоса и подавление клавиатуры
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 2500;
      presence.Q.value = 0.7;
      presence.gain.value = 2;
      filters.push(presence);

      const keyboardCut = ctx.createBiquadFilter();
      keyboardCut.type = "highshelf";
      keyboardCut.frequency.value = 4000;
      keyboardCut.gain.value = -10;
      filters.push(keyboardCut);
      break;
    }
    case "reduce-hiss": {
      // Подавление шипения и фона: срез lowshelf + легкий high cut
      const lowCut = ctx.createBiquadFilter();
      lowCut.type = "highpass";
      lowCut.frequency.value = 80;
      lowCut.Q.value = 0.7;
      filters.push(lowCut);

      const highCut = ctx.createBiquadFilter();
      highCut.type = "highshelf";
      highCut.frequency.value = 6000;
      highCut.gain.value = -8;
      filters.push(highCut);
      break;
    }
    default:
      ctx.close();
      return { stream: rawStream, context: null };
  }

  if (filters.length === 0) {
    ctx.close();
    return { stream: rawStream, context: null };
  }

  let node: AudioNode = source;
  for (const f of filters) {
    node.connect(f);
    node = f;
  }
  node.connect(dest);

  return { stream: dest.stream, context: ctx };
}
