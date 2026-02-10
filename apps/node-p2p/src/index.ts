import http from "http";
import type { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import type { WebSocket, RawData } from "ws";
import { config } from "./config";
import { ChannelRegistry } from "./channels";
import { FixedWindowRateLimiter } from "./rateLimiter";
import { startStunServer } from "./stunServer";

interface JoinMessage {
  type: "join";
  channel: string;
}

type ControlMessage = JoinMessage;

const channelRegistry = new ChannelRegistry(config.maxPeersPerChannel);

const connectionLimiter = new FixedWindowRateLimiter(
  config.connectionLimitPerMinute,
  60_000,
);

const messageLimiter = new FixedWindowRateLimiter(
  config.messageLimitPerSecond,
  1_000,
);

function getClientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string") {
    return xff.split(",")[0]!.trim();
  }
  const socket = req.socket;
  return socket.remoteAddress || "unknown";
}

function parseJoinMessage(raw: string): JoinMessage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<JoinMessage>;
    if (
      parsed.type === "join" &&
      typeof parsed.channel === "string" &&
      parsed.channel.length > 0
    ) {
      return { type: "join", channel: parsed.channel };
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

function sendJson(ws: WebSocket, data: unknown): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

const server = http.createServer((req, res) => {
  if (!req.url) {
    res.statusCode = 400;
    res.end("Bad Request");
    return;
  }

  if (req.url.startsWith("/healthz")) {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  res.statusCode = 404;
  res.end("Not Found");
});

const wss = new WebSocketServer({ server, path: config.wsPath });

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const ip = getClientIp(req);

  if (!connectionLimiter.allow(ip)) {
    sendJson(ws, {
      type: "error",
      code: "RATE_LIMIT_CONNECTION",
      message: "Too many connections, please try again later.",
    });
    ws.close(4001, "rate limit connection");
    return;
  }

  let joinedChannel: string | null = null;
  let joined = false;

  function rawToString(data: RawData): string {
    if (typeof data === "string") return data;
    if (Buffer.isBuffer(data)) return data.toString("utf8");
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
    if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
    return new TextDecoder().decode(new Uint8Array(data as ArrayBuffer));
  }

  ws.on("message", (data: RawData) => {
    if (!joined) {
      const raw = rawToString(data);
      const join = parseJoinMessage(raw);
      if (!join) {
        sendJson(ws, {
          type: "error",
          code: "INVALID_JOIN",
          message: "Invalid join message.",
        });
        ws.close(4000, "invalid join");
        return;
      }

      const result = channelRegistry.joinChannel(join.channel, ws);
      if (!result.ok) {
        if (result.reason === "channel_full") {
          sendJson(ws, {
            type: "error",
            code: "CHANNEL_FULL",
            message: "Channel peer limit reached.",
          });
          ws.close(4002, "channel full");
          return;
        }
      }

      joined = true;
      joinedChannel = join.channel;

      sendJson(ws, {
        type: "joined",
        channel: join.channel,
      });
      return;
    }

    if (!joinedChannel) {
      return;
    }

    const messageKey = `${ip}:${joinedChannel}`;
    if (!messageLimiter.allow(messageKey)) {
      sendJson(ws, {
        type: "error",
        code: "RATE_LIMIT_MESSAGE",
        message: "Too many messages, please slow down.",
      });
      return;
    }

    channelRegistry.broadcastInChannel(joinedChannel, data);
  });

  const cleanUp = () => {
    if (joinedChannel) {
      channelRegistry.leaveChannel(joinedChannel, ws);
      joinedChannel = null;
    } else {
      channelRegistry.detachSocket(ws);
    }
  };

  ws.on("close", cleanUp);
  ws.on("error", () => cleanUp());
});

server.listen(config.httpPort, () => {
  console.log(
    `[http] listening on http://0.0.0.0:${config.httpPort}, ws path: ${config.wsPath}`,
  );
});

startStunServer();
