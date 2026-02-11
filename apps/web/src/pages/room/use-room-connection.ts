import { useEffect, useRef, useCallback } from "react";
import { discoveryKey } from "@/shared/lib/group-link";
import { Discovery } from "@/shared/lib/discovery";
import { Mesh } from "@/shared/lib/mesh";
import { packMessage, unpackMessage } from "@/shared/lib/crypto";
import { useStore, getGroupKeyBytes, getMyKeyPairBytes } from "@/shared/store";
import type { PeerQuality } from "@/shared/store/types";
import { MAX_PEERS } from "@/shared/lib/discovery";

const STUN_PORT = 3478;

function randomPeerId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function iceServersFromBootstrapUrl(bootstrapUrl: string): RTCIceServer[] {
  const trimmed = bootstrapUrl.trim();
  if (!trimmed) return [{ urls: "stun:stun.l.google.com:19302" }];
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `http://${trimmed}`);
    const host = url.hostname;
    return [
      { urls: `stun:${host}:${STUN_PORT}` },
      { urls: "stun:stun.l.google.com:19302" },
    ];
  } catch {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
}

const MIC_STATS_LOG_INTERVAL_MS = 3000;
const PING_STATS_INTERVAL_MS = 2000;

async function logMicTransportStats(mesh: Mesh | null): Promise<void> {
  if (!mesh) return;
  const peerIds = mesh.getPeerIds();
  if (peerIds.length === 0) {
    console.log("[Mic/Stream] Передача по микрофону", { пиров: 0, исходящий: { bytes: 0, packets: 0 }, входящий: { bytes: 0, packets: 0 } });
    return;
  }

  let totalOutBytes = 0;
  let totalOutPackets = 0;
  let totalInBytes = 0;
  let totalInPackets = 0;
  const perPeer: Array<{ peerId: string; out: { bytes: number; packets: number }; in: { bytes: number; packets: number } }> = [];

  for (const peerId of peerIds) {
    const pc = mesh.getConnection(peerId);
    if (!pc) continue;
    try {
      const report = await pc.getStats();
      let outBytes = 0;
      let outPackets = 0;
      let inBytes = 0;
      let inPackets = 0;
      report.forEach((s) => {
        if (s.type === "outbound-rtp" && (s as RTCOutboundRtpStreamStats).kind === "audio") {
          outBytes += (s as RTCOutboundRtpStreamStats).bytesSent ?? 0;
          outPackets += (s as RTCOutboundRtpStreamStats).packetsSent ?? 0;
        }
        if (s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "audio") {
          inBytes += (s as RTCInboundRtpStreamStats).bytesReceived ?? 0;
          inPackets += (s as RTCInboundRtpStreamStats).packetsReceived ?? 0;
        }
      });
      totalOutBytes += outBytes;
      totalOutPackets += outPackets;
      totalInBytes += inBytes;
      totalInPackets += inPackets;
      perPeer.push({
        peerId: peerId.slice(0, 8),
        out: { bytes: outBytes, packets: outPackets },
        in: { bytes: inBytes, packets: inPackets },
      });
    } catch (_) {
      // ignore single peer failure
    }
  }

  console.log("[Mic/Stream] Передача по микрофону", {
    исходящий: { bytes: totalOutBytes, packets: totalOutPackets },
    входящий: { bytes: totalInBytes, packets: totalInPackets },
    пиров: peerIds.length,
    по_пирам: perPeer,
  });
}

interface PeerStats {
  rttMs: number | null;
  packetsLost: number;
  packetsReceived: number;
}

async function collectPeerStats(mesh: Mesh | null): Promise<{ pingMs: number | null; peerQuality: Record<string, PeerQuality> }> {
  const result: { pingMs: number | null; peerQuality: Record<string, PeerQuality> } = {
    pingMs: null,
    peerQuality: {},
  };
  if (!mesh) return result;

  const peerIds = mesh.getPeerIds();
  const statsPerPeer = new Map<string, PeerStats>();

  for (const peerId of peerIds) {
    const pc = mesh.getConnection(peerId);
    if (!pc) continue;
    try {
      const report = await pc.getStats();
      let rttMs: number | null = null;
      let packetsLost = 0;
      let packetsReceived = 0;

      report.forEach((s) => {
        const r = s as { roundTripTime?: number; packetsLost?: number; packetsReceived?: number; currentRoundTripTime?: number };
        if (s.type === "remote-inbound-rtp") {
          if (r.roundTripTime != null && r.roundTripTime > 0) {
            rttMs = r.roundTripTime * 1000;
          }
          packetsLost += r.packetsLost ?? 0;
          packetsReceived += r.packetsReceived ?? 0;
        }
        if (s.type === "candidate-pair" && rttMs == null) {
          if (r.currentRoundTripTime != null && r.currentRoundTripTime > 0) {
            rttMs = r.currentRoundTripTime * 1000;
          }
        }
      });

      statsPerPeer.set(peerId, { rttMs, packetsLost, packetsReceived });

      const lossPercent =
        packetsReceived + packetsLost > 0
          ? (packetsLost / (packetsReceived + packetsLost)) * 100
          : undefined;
      result.peerQuality[peerId] = { rtt: rttMs ?? undefined, lossPercent };
    } catch {
      // ignore
    }
  }

  const rttValues = Array.from(statsPerPeer.values())
    .map((s) => s.rttMs)
    .filter((v): v is number => v != null && v > 0);
  if (rttValues.length > 0) {
    result.pingMs = Math.round(Math.min(...rttValues));
  }

  return result;
}

export function useRoomConnection() {
  const groupId = useStore((s) => s.groupId);
  const bootstrapUrl = useStore((s) => s.bootstrapUrl);
  const myDisplayName = useStore((s) => s.myDisplayName);
  const setMyPeerId = useStore((s) => s.setMyPeerId);
  const setPeers = useStore((s) => s.setPeers);
  const setPeerSpeaking = useStore((s) => s.setPeerSpeaking);
  const setPeerMicMuted = useStore((s) => s.setPeerMicMuted);
  const addMessage = useStore((s) => s.addMessage);
  const setConnectionStatus = useStore((s) => s.setConnectionStatus);
  const setPingMs = useStore((s) => s.setPingMs);
  const setPeerQuality = useStore((s) => s.setPeerQuality);
  const setPeerVolume = useStore((s) => s.setPeerVolume);

  const discoveryRef = useRef<Discovery | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const analysersRef = useRef<
    Map<
      string,
      {
        analyser: AnalyserNode;
        gainNode: GainNode;
        rafId: number;
        audioContext: AudioContext;
        audioEl?: HTMLAudioElement;
      }
    >
  >(new Map());
  const micStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pingStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getKeyPair = useCallback(() => getMyKeyPairBytes(), []);
  const getGroupKey = useCallback(() => getGroupKeyBytes(), []);

  useEffect(() => {
    if (!groupId || !bootstrapUrl.trim()) return;

    const myPeerId = randomPeerId();
    setMyPeerId(myPeerId);
    setConnectionStatus("connecting");

    const key = getGroupKey();
    const keyPair = getKeyPair();
    if (!key || !keyPair) return;

    (async () => {
      const dkey = await discoveryKey(groupId);
      const discovery = new Discovery({
        onPeersUpdated: (descriptors) => {
          const limited = descriptors.slice(0, MAX_PEERS);
          console.log("[Discovery] onPeersUpdated", {
            count: limited.length,
            peerIds: limited.map((d) => d.peerId.slice(0, 8)),
            myPeerId: myPeerId.slice(0, 8),
          });
          setPeers(
            limited.map((d) => ({
              peerId: d.peerId,
              displayName: d.displayName,
              micMuted: false,
              speaking: false,
            }))
          );
          const mesh = meshRef.current;
          if (mesh) {
            limited.forEach((d, idx) => {
              if (d.peerId !== myPeerId) {
                console.log("[Discovery] addPeer to mesh", { index: idx, peerId: d.peerId.slice(0, 8) });
                mesh.addPeer(d.peerId);
              }
            });
          }
        },
        onSignalingMessage: (fromPeerId, payload) => {
          meshRef.current?.handleSignaling(fromPeerId, payload);
        },
        onConnected: () => setConnectionStatus("connected"),
        onDisconnected: () => setConnectionStatus("disconnected"),
      });

      const mesh = new Mesh(
        myPeerId,
        {
          onPeerJoined: (peerId, dc) => {
            dataChannelsRef.current.set(peerId, dc);
            dc.onmessage = (e: MessageEvent) => {
              const buf = e.data as ArrayBuffer;
              const key = getGroupKey();
              if (!key) return;
              unpackMessage(key, new Uint8Array(buf)).then((result) => {
                if (!result) return;
                const text = new TextDecoder().decode(result.plaintext);
                const pub = result.publicKey;
                const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(pub))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                addMessage({
                  id: crypto.randomUUID?.() ?? `${Date.now()}-${peerId}`,
                  peerId,
                  publicKeyBase64: publicKeyB64,
                  text,
                  timestamp: Date.now(),
                  signatureValid: result.signatureValid,
                });
              });
            };
          },
          onPeerLeft: (peerId) => {
            console.log("[Mesh] onPeerLeft", { peerId: peerId.slice(0, 8) });
            dataChannelsRef.current.delete(peerId);
            const a = analysersRef.current.get(peerId);
            if (a) {
              cancelAnimationFrame(a.rafId);
              a.audioContext.close();
              if (a.audioEl) {
                a.audioEl.srcObject = null;
                a.audioEl.remove();
              }
              analysersRef.current.delete(peerId);
            }
            setPeerSpeaking(peerId, false);
          },
          onRemoteStream: (peerId, stream) => {
            const track = stream.getAudioTracks()[0];
            const allTracks = stream.getTracks();
            const existingCount = analysersRef.current.size;
            console.log("[Mic/Stream] Входящий аудиопоток получен", {
              peerId: peerId.slice(0, 8),
              peerIndex: existingCount,
              streamId: stream.id,
              trackId: track?.id,
              trackLabel: track?.label,
              trackEnabled: track?.enabled,
              trackReadyState: track?.readyState,
              tracksCount: allTracks.length,
              streamActive: stream.active,
            });
            const audioEl = document.createElement("audio");
            audioEl.autoplay = true;
            audioEl.srcObject = stream;
            const playPromise = audioEl.play();
            playPromise
              .then(() => {
                console.log("[Mic/Stream] audio.play() OK", { peerId: peerId.slice(0, 8) });
              })
              .catch((e) => {
                console.warn("[Mic/Stream] audio.play() FAILED", { peerId: peerId.slice(0, 8), err: e });
              });

            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            const gainNode = audioContext.createGain();
            const savedVolume = useStore.getState().peerVolumes[peerId];
            gainNode.gain.value = savedVolume ?? 1;
            source.connect(analyser);
            analyser.connect(gainNode);
            gainNode.connect(audioContext.destination);
            console.log("[Mic/Stream] AudioContext создан", {
              peerId: peerId.slice(0, 8),
              contextState: audioContext.state,
              gainValue: gainNode.gain.value,
            });
            if (audioContext.state === "suspended") {
              audioContext.resume().then(() => {
                console.log("[Mic/Stream] AudioContext resumed", { peerId: peerId.slice(0, 8), state: audioContext.state });
              }).catch((e) => {
                console.warn("[Mic/Stream] AudioContext resume failed", { peerId: peerId.slice(0, 8), err: e });
              });
            }
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const SPEAKING_THRESHOLD = 30;

            const tick = () => {
              analyser.getByteFrequencyData(dataArray);
              const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
              setPeerSpeaking(peerId, avg > SPEAKING_THRESHOLD);
              const rafId = requestAnimationFrame(tick);
              const prev = analysersRef.current.get(peerId);
              if (prev) prev.rafId = rafId;
            };
            const rafId = requestAnimationFrame(tick);
            analysersRef.current.set(peerId, { analyser, gainNode, rafId, audioContext, audioEl });
          },
          onSignalingSend: (toPeerId, payload) => {
            discoveryRef.current?.sendSignaling(toPeerId, payload);
          },
        },
        { iceServers: iceServersFromBootstrapUrl(bootstrapUrl) }
      );

      discoveryRef.current = discovery;
      meshRef.current = mesh;

      micStatsIntervalRef.current = setInterval(() => {
        logMicTransportStats(meshRef.current);
      }, MIC_STATS_LOG_INTERVAL_MS);

      pingStatsIntervalRef.current = setInterval(async () => {
        const { pingMs, peerQuality } = await collectPeerStats(meshRef.current);
        setPingMs(pingMs);
        setPeerQuality(peerQuality);
      }, PING_STATS_INTERVAL_MS);

      discovery.connect(bootstrapUrl.trim(), dkey, {
        peerId: myPeerId,
        displayName: myDisplayName || "Guest",
      });
    })();

    return () => {
      if (micStatsIntervalRef.current) {
        clearInterval(micStatsIntervalRef.current);
        micStatsIntervalRef.current = null;
      }
      if (pingStatsIntervalRef.current) {
        clearInterval(pingStatsIntervalRef.current);
        pingStatsIntervalRef.current = null;
      }
      setPingMs(null);
      setPeerQuality({});
      discoveryRef.current?.disconnect();
      meshRef.current?.disconnect();
      discoveryRef.current = null;
      meshRef.current = null;
      dataChannelsRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      analysersRef.current.forEach((a) => cancelAnimationFrame(a.rafId));
      analysersRef.current.clear();
      setConnectionStatus("disconnected");
      setPeers([]);
    };
  }, [groupId, bootstrapUrl, myDisplayName, setMyPeerId, setPeers, setPeerSpeaking, addMessage, setConnectionStatus, setPeerMicMuted, setPingMs, setPeerQuality, getKeyPair, getGroupKey]);

  const sendMessage = useCallback(
    async (text: string) => {
      const key = getGroupKey();
      const keyPair = getKeyPair();
      if (!key || !keyPair) return;
      const plaintext = new TextEncoder().encode(text);
      const packed = await packMessage(key, { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey }, plaintext);
      const payload = new Uint8Array(packed);
      dataChannelsRef.current.forEach((dc) => {
        if (dc.readyState === "open") dc.send(payload as unknown as ArrayBuffer);
      });
      const myPeerId = useStore.getState().myPeerId;
      const myKeyPairBase64 = useStore.getState().myKeyPairBase64;
      addMessage({
        id: crypto.randomUUID?.() ?? `me-${Date.now()}`,
        peerId: myPeerId,
        publicKeyBase64: myKeyPairBase64?.publicKey ?? "",
        text,
        timestamp: Date.now(),
        signatureValid: true,
      });
    },
    [getGroupKey, getKeyPair, addMessage]
  );

  const setLocalStream = useCallback((stream: MediaStream | null) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = stream;
    if (stream) {
      const track = stream.getAudioTracks()[0];
      console.log("[Mic/Stream] Исходящий аудиопоток установлен", {
        streamId: stream.id,
        trackId: track?.id,
        trackLabel: track?.label,
      });
    } else {
      console.log("[Mic/Stream] Исходящий аудиопоток отключён");
    }
    meshRef.current?.setLocalStream(stream);
  }, []);

  const updatePeerVolume = useCallback(
    (peerId: string, volume: number) => {
      setPeerVolume(peerId, volume);
      const entry = analysersRef.current.get(peerId);
      if (entry?.gainNode) {
        entry.gainNode.gain.setValueAtTime(volume, entry.audioContext.currentTime);
      }
    },
    [setPeerVolume]
  );

  return { sendMessage, setLocalStream, setPeerVolume: updatePeerVolume };
}
