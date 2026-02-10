export interface Message {
  id: string;
  peerId: string;
  publicKeyBase64: string;
  text: string;
  timestamp: number;
  signatureValid: boolean;
}
