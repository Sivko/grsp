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
    const trackCount = stream?.getAudioTracks().length ?? 0;
    console.log("[Mesh] setLocalStream", {
      hasStream: !!stream,
      trackCount,
      connectionsCount: this.connections.size,
      peerIds: Array.from(this.connections.keys()).map((id) => id.slice(0, 8)),
    });
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
        const hasAudioInOffer = offer.sdp?.includes("m=audio") ?? false;
        console.log("[Mesh] setLocalStream renegotiate", {
          peerId: peerId.slice(0, 8),
          hasAudioInSdp: hasAudioInOffer,
        });
        await pc.setLocalDescription(offer);
        this.callbacks.onSignalingSend(peerId, { type: "offer", sdp: offer });
      } catch (err) {
        console.error("[Mesh] setLocalStream renegotiate failed", { peerId: peerId.slice(0, 8), err });
      }
    }
  }

  async addPeer(peerId: string): Promise<void> {
    const weOffer = this.ourPeerId < peerId;
    if (this.connections.has(peerId)) return;

    const hasLocalStream = !!this.localStream;
    const trackCount = this.localStream?.getAudioTracks().length ?? 0;
    console.log("[Mesh] addPeer", {
      peerId: peerId.slice(0, 8),
      weOffer,
      hasLocalStream,
      trackCount,
      ourPeerId: this.ourPeerId.slice(0, 8),
      connectionsCount: this.connections.size,
    });

    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.connections.set(peerId, pc);
    this.pendingCandidates.set(peerId, []);

    pc.ontrack = (e: RTCTrackEvent) => {
      const stream = e.streams[0];
      const track = e.track;
      console.log("[Mesh] ontrack", {
        peerId: peerId.slice(0, 8),
        transceiverMid: e.transceiver?.mid,
        trackKind: track?.kind,
        trackId: track?.id,
        trackEnabled: track?.enabled,
        trackReadyState: track?.readyState,
        hasStream: !!stream,
        streamId: stream?.id,
        streamTracksCount: stream?.getTracks().length ?? 0,
      });
      if (stream) this.callbacks.onRemoteStream?.(peerId, stream);
    };

    pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
      if (e.candidate && this.callbacks.onSignalingSend) {
        this.callbacks.onSignalingSend(peerId, { type: "ice", candidate: e.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log("[Mesh] connectionstatechange", {
        peerId: peerId.slice(0, 8),
        state: pc.connectionState,
      });
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected" || pc.connectionState === "closed") {
        this.removePeer(peerId);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[Mesh] iceconnectionstatechange", {
        peerId: peerId.slice(0, 8),
        state: pc.iceConnectionState,
      });
    };

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => pc.addTrack(track, this.localStream!));
    }

    if (weOffer) {
      const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
      this.setupDataChannel(peerId, dc);
      try {
        const offer = await pc.createOffer();
        const hasAudioInOffer = offer.sdp?.includes("m=audio") ?? false;
        console.log("[Mesh] createOffer (weOffer)", {
          peerId: peerId.slice(0, 8),
          hasAudioInSdp: hasAudioInOffer,
          sendersCount: pc.getSenders().length,
        });
        await pc.setLocalDescription(offer);
        if (this.callbacks.onSignalingSend) {
          this.callbacks.onSignalingSend(peerId, { type: "offer", sdp: offer });
        }
      } catch (err) {
        console.error("[Mesh] createOffer failed", { peerId: peerId.slice(0, 8), err });
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
      const hasAudioInOffer = payload.sdp?.sdp?.includes("m=audio") ?? false;
      console.log("[Mesh] handleSignaling offer", {
        fromPeerId: fromPeerId.slice(0, 8),
        isNewConnection,
        hasLocalStream: !!this.localStream,
        hasAudioInSdp: hasAudioInOffer,
      });
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: this.iceServers });
      this.connections.set(fromPeerId, pc);
      this.pendingCandidates.set(fromPeerId, []);

      pc.ontrack = (e: RTCTrackEvent) => {
        const stream = e.streams[0];
        const track = e.track;
        console.log("[Mesh] ontrack (from offer)", {
          peerId: fromPeerId.slice(0, 8),
          trackKind: track?.kind,
          trackId: track?.id,
          trackReadyState: track?.readyState,
          hasStream: !!stream,
        });
        if (stream) this.callbacks.onRemoteStream?.(fromPeerId, stream);
      };
      pc.onicecandidate = (e: RTCPeerConnectionIceEvent) => {
        if (e.candidate && this.callbacks.onSignalingSend) {
          this.callbacks.onSignalingSend(fromPeerId, { type: "ice", candidate: e.candidate.toJSON() });
        }
      };
      pc.onconnectionstatechange = () => {
        console.log("[Mesh] connectionstatechange (from offer)", {
          peerId: fromPeerId.slice(0, 8),
          state: pc!.connectionState,
        });
        if (pc!.connectionState === "failed" || pc!.connectionState === "disconnected" || pc!.connectionState === "closed") {
          this.removePeer(fromPeerId);
        }
      };
      pc.oniceconnectionstatechange = () => {
        console.log("[Mesh] iceconnectionstatechange (from offer)", {
          peerId: fromPeerId.slice(0, 8),
          state: pc!.iceConnectionState,
        });
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

      if (this.localStream && pc!.getSenders().length === 0) {
        this.localStream.getTracks().forEach((track) => pc!.addTrack(track, this.localStream!));
        console.log("[Mesh] handleSignaling: добавлен localStream к существующему pc", {
          fromPeerId: fromPeerId.slice(0, 8),
        });
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
