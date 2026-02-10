import type { PeerDescriptor, RTCSignalingPayload } from "./types";

const HEARTBEAT_INTERVAL_MS = 4000;
export const MAX_PEERS = 6;

export interface DiscoveryCallbacks {
  onPeersUpdated: (peers: PeerDescriptor[]) => void;
  onSignalingMessage?: (fromPeerId: string, payload: RTCSignalingPayload) => void;
  onConnected?: () => void;
  onDisconnected?: (event?: CloseEvent) => void;
  onError?: (err: Event | Error) => void;
}

export class Discovery {
  private ws: WebSocket | null = null;
  private channelKey: string = "";
  private ourDescriptor: PeerDescriptor | null = null;
  private peers = new Map<string, PeerDescriptor>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private callbacks: DiscoveryCallbacks;
  private wsUrl: string = "";

  constructor(callbacks: DiscoveryCallbacks) {
    this.callbacks = callbacks;
  }

  connect(
    wsUrl: string,
    discoveryKey: string,
    ourDescriptor: PeerDescriptor
  ): void {
    this.disconnect();
    this.wsUrl = wsUrl.replace(/^http/, "ws").replace(/\/?$/, "");
    this.channelKey = discoveryKey;
    this.ourDescriptor = ourDescriptor;
    this.peers.clear();

    const url = `${this.wsUrl}/ws`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      this.send({ type: "join", channel: this.channelKey });
      this.sendDescriptor();
      this.heartbeatTimer = setInterval(() => this.sendDescriptor(), HEARTBEAT_INTERVAL_MS);
      this.callbacks.onConnected?.();
    };

    this.ws.onmessage = (e: MessageEvent) => {
      try {
        const raw =
          typeof e.data === "string"
            ? e.data
            : new TextDecoder().decode(e.data as ArrayBuffer);
        const data = JSON.parse(raw) as {
          type: string;
          descriptor?: PeerDescriptor;
          from?: string;
          to?: string;
          payload?: RTCSignalingPayload;
        };
        if (data.type === "descriptor" && data.descriptor) {
          this.addPeer(data.descriptor);
        } else if (
          data.type === "webrtc" &&
          data.from &&
          data.to === this.ourDescriptor?.peerId &&
          data.payload &&
          this.callbacks.onSignalingMessage
        ) {
          this.callbacks.onSignalingMessage(data.from, data.payload);
        }
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.cleanup();
      this.callbacks.onPeersUpdated([]);
      this.callbacks.onDisconnected?.(event);
    };

    this.ws.onerror = (err) => {
      this.callbacks.onError?.(err);
    };
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendDescriptor(): void {
    if (this.ourDescriptor) {
      this.send({ type: "descriptor", descriptor: this.ourDescriptor });
    }
  }

  private addPeer(descriptor: PeerDescriptor): void {
    if (this.peers.size >= MAX_PEERS && !this.peers.has(descriptor.peerId)) return;
    if (descriptor.peerId === this.ourDescriptor?.peerId) return;
    this.peers.set(descriptor.peerId, { ...descriptor });
    this.callbacks.onPeersUpdated(Array.from(this.peers.values()));
  }

  updateOurDescriptor(descriptor: Partial<PeerDescriptor>): void {
    if (this.ourDescriptor) {
      this.ourDescriptor = { ...this.ourDescriptor, ...descriptor };
    }
  }

  sendSignaling(toPeerId: string, payload: RTCSignalingPayload): void {
    if (!this.ourDescriptor) return;
    this.send({ type: "webrtc", from: this.ourDescriptor.peerId, to: toPeerId, payload });
  }

  getPeers(): PeerDescriptor[] {
    return Array.from(this.peers.values());
  }

  disconnect(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.peers.clear();
  }
}
