export interface KeyPairBase64 {
  publicKey: string;
  privateKey: string;
}

export interface PersistedGroup {
  groupId: string;
  groupKeyBase64: string;
}

export interface PeerState {
  peerId: string;
  displayName: string;
  micMuted: boolean;
  speaking: boolean;
}

export interface ChatMessage {
  id: string;
  peerId: string;
  publicKeyBase64: string;
  text: string;
  timestamp: number;
  signatureValid: boolean;
}

/** Настройки микрофона для getUserMedia audio constraints */
export interface MicSettings {
  deviceId: string | null;
  echoCancellation: boolean | null;
  autoGainControl: boolean | null;
  noiseSuppression: boolean | null;
  sampleRate: number | null;
  sampleSize: number | null;
  channelCount: number | null;
  latency: number | null;
}
