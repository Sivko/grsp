import type { RTCSignalingPayload } from "@/shared/lib/discovery";
import type { MeshCallbacks } from "./types";

const DATA_CHANNEL_LABEL = "chat";
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export interface MeshOptions {
  iceServers?: RTCIceServer[];
}

export class Mesh {
  private connections = new Map<string, RTCPeerConnection>();
  private callbacks: MeshCallbacks;
  private localStream: MediaStream | null = null;
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();
  private ourPeerId: string;
  private iceServers: RTCIceServer[];

  constructor(ourPeerId: string, callbacks: MeshCallbacks, options: MeshOptions = {}) {
    this.ourPeerId = ourPeerId;
    this.callbacks = callbacks;
    this.iceServers = options.iceServers?.length ? options.iceServers : DEFAULT_ICE_SERVERS;
  }

  async setLocalStream(stream: MediaStream | null): Promise<void> {
    this.localStream = stream;
    const peersToRenegotiate: string[] = [];
    this.connections.forEach((pc, peerId) => {
      const senders = pc.getSenders();
      senders.forEach((s) => {
        if (s.track && stream) {
          s.replaceTrack(stream.getAudioTracks()[0] ?? null);
        }
      });
      if (stream && senders.length === 0) {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        if (pc.signalingState === "stable") {
          peersToRenegotiate.push(peerId);
        }
      }
    });
    for (const peerId of peersToRenegotiate) {
      const pc = this.connections.get(peerId);
      if (!pc || !this.callbacks.onSignalingSend) continue;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.callbacks.onSignalingSend(peerId, { type: "offer", sdp: offer });
      } catch (_) {
        // ignore renegotiation errors
      }
    }
  }

  async addPeer(peerId: string): Promise<void> {
    const weOffer = this.ourPeerId < peerId;
    if (this.connections.has(peerId)) return;

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.connections.set(peerId, pc);
    this.pendingCandidates.set(peerId, []);

    pc.ontrack = (e: RTCTrackEvent) => {
      if (e.streams[0]) this.callbacks.onRemoteStream?.(peerId, e.streams[0]);
    };

    pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate && this.callbacks.onSignalingSend) {
        this.callbacks.onSignalingSend(peerId, { type: "ice", candidate: e.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        this.removePeer(peerId);
      }
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
    }

    if (weOffer) {
      const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
      this.setupDataChannel(peerId, dc);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (this.callbacks.onSignalingSend) {
          this.callbacks.onSignalingSend(peerId, { type: "offer", sdp: offer });
        }
      } catch (err) {
        this.removePeer(peerId);
      }
    } else {
      pc.ondatachannel = (e: RTCDataChannelEvent) => {
        if (e.channel.label === DATA_CHANNEL_LABEL) {
          this.setupDataChannel(peerId, e.channel);
        }
      };
    }
  }

  private setupDataChannel(peerId: string, dc: RTCDataChannel): void {
    dc.binaryType = "arraybuffer";
    if (dc.readyState === "open") {
      this.callbacks.onPeerJoined(peerId, dc);
    } else {
      dc.onopen = () => this.callbacks.onPeerJoined(peerId, dc);
    }
    dc.onclose = () => {
      this.callbacks.onPeerLeft(peerId);
    };
  }

  async handleSignaling(fromPeerId: string, payload: RTCSignalingPayload): Promise<void> {
    let pc = this.connections.get(fromPeerId);
    if (payload.type === "offer") {
      const isNewConnection = !pc;
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.connections.set(fromPeerId, pc);
      this.pendingCandidates.set(fromPeerId, []);

      pc.ontrack = (e: RTCTrackEvent) => {
        if (e.streams[0]) this.callbacks.onRemoteStream?.(fromPeerId, e.streams[0]);
      };
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate && this.callbacks.onSignalingSend) {
          this.callbacks.onSignalingSend(fromPeerId, { type: "ice", candidate: e.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc!.connectionState === "failed" || pc!.connectionState === "disconnected" || pc!.connectionState === "closed") {
          this.removePeer(fromPeerId);
        }
      };
      pc.ondatachannel = (e: RTCDataChannelEvent) => {
        if (e.channel.label === DATA_CHANNEL_LABEL) {
          this.setupDataChannel(fromPeerId, e.channel);
        }
      };
      if (isNewConnection && this.localStream) {
        this.localStream.getTracks().forEach((track) => pc!.addTrack(track, this.localStream!));
      }
      }

      await pc!.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (this.callbacks.onSignalingSend) {
        this.callbacks.onSignalingSend(fromPeerId, { type: "answer", sdp: answer });
      }
      const pending = this.pendingCandidates.get(fromPeerId) ?? [];
      for (const c of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      this.pendingCandidates.delete(fromPeerId);
    } else if (payload.type === "answer" && pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      const pending = this.pendingCandidates.get(fromPeerId) ?? [];
      for (const c of pending) {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      }
      this.pendingCandidates.delete(fromPeerId);
    } else if (payload.type === "ice" && pc) {
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } else {
        this.pendingCandidates.get(fromPeerId)?.push(payload.candidate);
      }
    }
  }

  private removePeer(peerId: string): void {
    const pc = this.connections.get(peerId);
    if (pc) {
      pc.close();
      this.connections.delete(peerId);
      this.pendingCandidates.delete(peerId);
      this.callbacks.onPeerLeft(peerId);
    }
  }

  disconnect(): void {
    this.connections.forEach((pc) => pc.close());
    this.connections.clear();
    this.pendingCandidates.clear();
  }

  getConnection(peerId: string): RTCPeerConnection | undefined {
    return this.connections.get(peerId);
  }

  getPeerIds(): string[] {
    return Array.from(this.connections.keys());
  }
}
