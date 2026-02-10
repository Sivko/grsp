# Meet P2P Backend (Bootstrap)

Минимальный бекенд-сервис (`apps/node-p2p`) для P2P‑приложения:

- WebSocket‑relay по каналу `discovery_key` без хранения состояния (in‑memory `Map<discovery_key, Set<WebSocket>>`).
- Опциональный лимит пиров на канал.
- Опциональный STUN‑сервер для WebRTC.
- Опциональный базовый rate limiting по IP/каналу.

## Быстрый старт (только backend)

```bash
cd apps/node-p2p
npm install
npm run build
npm start
```

По умолчанию:

- HTTP: `http://localhost:3000`
- WebSocket‑endpoint: `ws://localhost:3000/ws`
- Health‑check: `GET /healthz`

## Протокол WebSocket

1. Клиент открывает WebSocket‑подключение к `ws://host:port/ws`.
2. **Первый текстовый фрейм** обязан быть JSON:

```json
{ "type": "join", "channel": "<discovery_key>" }
```

3. Если join успешен, сервер отвечает:

```json
{ "type": "joined", "channel": "<discovery_key>" }
```

4. Все последующие сообщения (text/binary) пересылаются **всем участникам этого канала**, включая отправителя.

## Конфигурация через ENV

- `PORT` — HTTP‑порт (по умолчанию `3000`).
- `WS_PATH` — путь WebSocket (`/ws` по умолчанию).
- `MAX_PEERS_PER_CHANNEL` — максимальное число пиров в канале (по умолчанию `6`, `<=0` или пусто — без лимита).
- `ENABLE_STUN` — `"true"` для запуска STUN‑сервера.
- `STUN_PORT` — порт STUN (по умолчанию `3478`).
- `STUN_ADDRESS` — адрес для STUN (`0.0.0.0` по умолчанию).
- `WS_CONN_PER_MIN` — лимит подключений в минуту на IP (пусто — выключено).
- `WS_MSG_PER_SEC` — лимит сообщений в секунду на ключ `ip:channel` (пусто — выключено).

## STUN

При `ENABLE_STUN=true` поднимается STUN‑сервер (UDP) на `STUN_ADDRESS:STUN_PORT`.  
Клиенты WebRTC могут использовать его как обычный STUN‑endpoint, например:

```text
stun:your-host:3478
```

