import dotenv from "dotenv";

dotenv.config();

export interface AppConfig {
  httpPort: number;
  wsPath: string;
  maxPeersPerChannel: number | null;
  enableStun: boolean;
  stunPort: number;
  stunAddress: string;
  connectionLimitPerMinute: number | null;
  messageLimitPerSecond: number | null;
}

function readNumberEnv(name: string, defaultValue: number | null): number | null {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultValue;
  }
  return parsed;
}

export const config: AppConfig = {
  httpPort: readNumberEnv("PORT", 3000) ?? 3000,
  wsPath: process.env.WS_PATH || "/ws",
  maxPeersPerChannel: readNumberEnv("MAX_PEERS_PER_CHANNEL", 6),
  enableStun: process.env.ENABLE_STUN === "true",
  stunPort: readNumberEnv("STUN_PORT", 3478) ?? 3478,
  stunAddress: process.env.STUN_ADDRESS || "0.0.0.0",
  connectionLimitPerMinute: readNumberEnv("WS_CONN_PER_MIN", null),
  messageLimitPerSecond: readNumberEnv("WS_MSG_PER_SEC", null),
};

