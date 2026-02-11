import type { MicSettings } from "@/shared/store/types";

/** Расширенный тип — latency есть в Web API, но отсутствует в TS dom lib */
type AudioConstraints = MediaTrackConstraints & { latency?: number };

/** Рекомендуемые значения по умолчанию для качества голоса */
const DEFAULT_SAMPLE_RATE = 48000;
const DEFAULT_CHANNEL_COUNT = 1;
const DEFAULT_LATENCY = 0.01;

/**
 * Преобразует MicSettings в объект constraints для getUserMedia({ audio: ... })
 */
export function buildAudioConstraints(settings: MicSettings): AudioConstraints | boolean {
  const audio: AudioConstraints = {};

  if (settings.deviceId != null && settings.deviceId.trim() !== "") {
    audio.deviceId = settings.deviceId;
  }
  if (settings.echoCancellation != null) {
    audio.echoCancellation = settings.echoCancellation;
  }
  if (settings.autoGainControl != null) {
    audio.autoGainControl = settings.autoGainControl;
  }
  if (settings.noiseSuppression != null) {
    audio.noiseSuppression = settings.noiseSuppression;
  }
  audio.sampleRate = settings.sampleRate != null && settings.sampleRate > 0 ? settings.sampleRate : DEFAULT_SAMPLE_RATE;
  if (settings.sampleSize != null && settings.sampleSize > 0) {
    audio.sampleSize = settings.sampleSize;
  }
  audio.channelCount = settings.channelCount != null && settings.channelCount > 0 ? settings.channelCount : DEFAULT_CHANNEL_COUNT;
  audio.latency = settings.latency != null && settings.latency >= 0 ? settings.latency : DEFAULT_LATENCY;

  return Object.keys(audio).length > 0 ? audio : true;
}
