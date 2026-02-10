import type WebSocket from "ws";
import type { RawData } from "ws";

export type DiscoveryKey = string;

interface ChannelInfo {
  sockets: Set<WebSocket>;
}

export class ChannelRegistry {
  private readonly channels = new Map<DiscoveryKey, ChannelInfo>();
  private readonly maxPeersPerChannel: number | null;

  constructor(maxPeersPerChannel: number | null) {
    this.maxPeersPerChannel = maxPeersPerChannel;
  }

  joinChannel(key: DiscoveryKey, socket: WebSocket): { ok: true } | { ok: false; reason: "channel_full" } {
    let channel = this.channels.get(key);
    if (!channel) {
      channel = { sockets: new Set<WebSocket>() };
      this.channels.set(key, channel);
    }

    if (this.maxPeersPerChannel != null && channel.sockets.size >= this.maxPeersPerChannel) {
      return { ok: false, reason: "channel_full" };
    }

    channel.sockets.add(socket);
    return { ok: true };
  }

  leaveChannel(key: DiscoveryKey, socket: WebSocket): void {
    const channel = this.channels.get(key);
    if (!channel) return;

    channel.sockets.delete(socket);
    if (channel.sockets.size === 0) {
      this.channels.delete(key);
    }
  }

  detachSocket(socket: WebSocket): void {
    for (const [key, info] of this.channels.entries()) {
      if (info.sockets.has(socket)) {
        info.sockets.delete(socket);
        if (info.sockets.size === 0) {
          this.channels.delete(key);
        }
      }
    }
  }

  broadcastInChannel(key: DiscoveryKey, data: RawData): void {
    const channel = this.channels.get(key);
    if (!channel) return;

    for (const socket of channel.sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(data, { binary: typeof data !== "string" });
      }
    }
  }
}

