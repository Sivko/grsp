import type { MicSettings } from "@/shared/store/types";

/** Расширенный тип — latency есть в Web API, но отсутствует в TS dom lib */
type AudioConstraints = MediaTrackConstraints & { latency?: number };

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
  if (settings.sampleRate != null && settings.sampleRate > 0) {
    audio.sampleRate = settings.sampleRate;
  }
  if (settings.sampleSize != null && settings.sampleSize > 0) {
    audio.sampleSize = settings.sampleSize;
  }
  if (settings.channelCount != null && settings.channelCount > 0) {
    audio.channelCount = settings.channelCount;
  }
  if (settings.latency != null && settings.latency >= 0) {
    audio.latency = settings.latency;
  }

  return Object.keys(audio).length > 0 ? audio : true;
}
