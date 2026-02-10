import dgram from "dgram";
import { createServer } from "stun";
import { config } from "./config";

export function startStunServer(): void {
  if (!config.enableStun) {
    return;
  }

  const socket = dgram.createSocket({ type: "udp4" });
  const server = createServer({ type: "udp4", socket });

  server.on("listening", () => {
    console.log(
      `[stun] listening on udp://${config.stunAddress}:${config.stunPort}`
    );
  });

  server.on("error", (err: unknown) => {
    console.error("[stun] error:", err);
  });

  server.listen(config.stunPort, config.stunAddress);
}

