declare module "stun" {
  import { Socket } from "dgram";
  import { EventEmitter } from "events";

  export interface StunServerOptions {
    type?: "udp4" | "udp6";
    socket?: Socket;
  }

  export class StunServer extends EventEmitter {
    constructor(socket: Socket);
    listen(port: number, address?: string, callback?: () => void): void;
    close(): void;
  }

  export function createServer(options: { socket?: Socket; type?: "udp4" | "udp6" }): StunServer;
}

