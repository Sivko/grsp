import { useEffect, useRef, useCallback } from "react";
import { discoveryKey } from "@/shared/lib/group-link";
import { Discovery } from "@/shared/lib/discovery";
import { Mesh } from "@/shared/lib/mesh";
import { packMessage, unpackMessage } from "@/shared/lib/crypto";
import { useStore, getGroupKeyBytes, getMyKeyPairBytes } from "@/shared/store";
import type { PeerRtcStats } from "@/shared/store/types";
import { MAX_PEERS } from "@/shared/lib/discovery";
import { applyNoiseGate } from "@/features/mic-toggle/apply-noise-gate";

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

const RTC_STATS_INTERVAL_MS = 2000;

async function collectPeerStats(mesh: Mesh | null): Promise<Record<string, PeerRtcStats>> {
  const stats: Record<string, PeerRtcStats> = {};
  if (!mesh) return stats;

  for (const peerId of mesh.getPeerIds()) {
    const pc = mesh.getConnection(peerId);
    if (!pc) continue;
    try {
      const report = await pc.getStats();
      let outBytes = 0;
      let outPackets = 0;
      let inBytes = 0;
      let inPackets = 0;
      let inPacketsLost = 0;
      let roundTripTimeMs: number | undefined;

      report.forEach((s) => {
        if (s.type === "outbound-rtp" && (s as RTCOutboundRtpStreamStats).kind === "audio") {
          const o = s as RTCOutboundRtpStreamStats;
          outBytes += o.bytesSent ?? 0;
          outPackets += o.packetsSent ?? 0;
        }
        if (s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "audio") {
          const i = s as RTCInboundRtpStreamStats;
          inBytes += i.bytesReceived ?? 0;
          inPackets += i.packetsReceived ?? 0;
          inPacketsLost += i.packetsLost ?? 0;
        }
        if (s.type === "candidate-pair" && (s as RTCIceCandidatePairStats).state === "succeeded") {
          const rtt = (s as RTCIceCandidatePairStats).currentRoundTripTime;
          if (rtt != null && rtt > 0) roundTripTimeMs = rtt * 1000;
        }
      });

      stats[peerId] = {
        peerId,
        outbound: { bytes: outBytes, packets: outPackets },
        inbound: { bytes: inBytes, packets: inPackets, packetsLost: inPacketsLost },
        roundTripTimeMs,
        connectionState: pc.connectionState,
      };
    } catch (_) {
      // ignore single peer failure
    }
  }
  return stats;
}

function applyMicGain(
  rawStream: MediaStream,
  gain: number
): { stream: MediaStream; context: AudioContext } | { stream: MediaStream; context: null } {
  const g = Math.max(0.1, Math.min(3, gain));
  if (Math.abs(g - 1) < 0.01) return { stream: rawStream, context: null };
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(rawStream);
  const gainNode = ctx.createGain();
  gainNode.gain.value = g;
  const dest = ctx.createMediaStreamDestination();
  source.connect(gainNode);
  gainNode.connect(dest);
  return { stream: dest.stream, context: ctx };
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
  const setPeerStats = useStore((s) => s.setPeerStats);

  const discoveryRef = useRef<Discovery | null>(null);
  const meshRef = useRef<Mesh | null>(null);
  const dataChannelsRef = useRef<Map<string, RTCDataChannel>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const gainContextRef = useRef<AudioContext | null>(null);
  const noiseGateStopRef = useRef<(() => void) | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; rafId: number; audioContext: AudioContext; audioEl?: HTMLAudioElement }>>(new Map());
  const rtcStatsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const micGain = useStore((s) => s.micSettings.micGain ?? 1);
  const noiseGateEnabled = useStore((s) => s.micSettings.noiseGateEnabled ?? true);
  const noiseGateThreshold = useStore((s) => s.micSettings.noiseGateThreshold ?? 25);

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
            limited.forEach((d) => {
              if (d.peerId !== myPeerId) mesh.addPeer(d.peerId);
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
            console.log("[Mic/Stream] Входящий аудиопоток получен", {
              peerId: peerId.slice(0, 8),
              streamId: stream.id,
              trackId: track?.id,
              trackLabel: track?.label,
            });
            const audioEl = document.createElement("audio");
            audioEl.autoplay = true;
            audioEl.srcObject = stream;
            audioEl.play().catch((e) => console.warn("[Mic/Stream] audio.play()", e));

            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;
            source.connect(analyser);
            if (audioContext.state === "suspended") {
              audioContext.resume().then(() => {
                source.connect(audioContext.destination);
              }).catch(() => {});
            } else {
              source.connect(audioContext.destination);
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
            analysersRef.current.set(peerId, { analyser, rafId, audioContext, audioEl });
          },
          onSignalingSend: (toPeerId, payload) => {
            discoveryRef.current?.sendSignaling(toPeerId, payload);
          },
        },
        { iceServers: iceServersFromBootstrapUrl(bootstrapUrl) }
      );

      discoveryRef.current = discovery;
      meshRef.current = mesh;

      rtcStatsIntervalRef.current = setInterval(async () => {
        const stats = await collectPeerStats(meshRef.current);
        setPeerStats(stats);
      }, RTC_STATS_INTERVAL_MS);

      discovery.connect(bootstrapUrl.trim(), dkey, {
        peerId: myPeerId,
        displayName: myDisplayName || "Guest",
      });
    })();

    return () => {
      if (rtcStatsIntervalRef.current) {
        clearInterval(rtcStatsIntervalRef.current);
        rtcStatsIntervalRef.current = null;
      }
      discoveryRef.current?.disconnect();
      meshRef.current?.disconnect();
      discoveryRef.current = null;
      meshRef.current = null;
      dataChannelsRef.current.clear();
      noiseGateStopRef.current?.();
      noiseGateStopRef.current = null;
      gainContextRef.current?.close();
      gainContextRef.current = null;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
      analysersRef.current.forEach((a) => cancelAnimationFrame(a.rafId));
      analysersRef.current.clear();
      setConnectionStatus("disconnected");
      setPeers([]);
      setPeerStats({});
    };
  }, [groupId, bootstrapUrl, myDisplayName, setMyPeerId, setPeers, setPeerSpeaking, setPeerStats, addMessage, setConnectionStatus, setPeerMicMuted, getKeyPair, getGroupKey]);

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
    noiseGateStopRef.current?.();
    noiseGateStopRef.current = null;
    gainContextRef.current?.close();
    gainContextRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = stream;
    if (stream) {
      const gain = useStore.getState().micSettings.micGain ?? 1;
      const ngEnabled = useStore.getState().micSettings.noiseGateEnabled ?? true;
      const ngThreshold = useStore.getState().micSettings.noiseGateThreshold ?? 25;

      let inputStream: MediaStream = stream;
      if (ngEnabled) {
        const ng = applyNoiseGate(stream, { threshold: ngThreshold });
        noiseGateStopRef.current = ng.stop;
        inputStream = ng.stream;
      }

      const result = applyMicGain(inputStream, gain);
      gainContextRef.current = result.context;
      const track = result.stream.getAudioTracks()[0];
      console.log("[Mic/Stream] Исходящий аудиопоток установлен", {
        streamId: result.stream.id,
        trackId: track?.id,
        trackLabel: track?.label,
        micGain: gain,
        noiseGate: ngEnabled,
      });
      meshRef.current?.setLocalStream(result.stream);
    } else {
      console.log("[Mic/Stream] Исходящий аудиопоток отключён");
      meshRef.current?.setLocalStream(null);
    }
  }, []);

  useEffect(() => {
    const raw = localStreamRef.current;
    const mesh = meshRef.current;
    if (!raw || !mesh) return;
    const gain = useStore.getState().micSettings.micGain ?? 1;
    const ngEnabled = useStore.getState().micSettings.noiseGateEnabled ?? true;
    const ngThreshold = useStore.getState().micSettings.noiseGateThreshold ?? 25;

    noiseGateStopRef.current?.();
    noiseGateStopRef.current = null;
    gainContextRef.current?.close();
    gainContextRef.current = null;

    let inputStream: MediaStream = raw;
    if (ngEnabled) {
      const ng = applyNoiseGate(raw, { threshold: ngThreshold });
      noiseGateStopRef.current = ng.stop;
      inputStream = ng.stream;
    }

    const result = applyMicGain(inputStream, gain);
    gainContextRef.current = result.context;
    mesh.setLocalStream(result.stream);
  }, [micGain, noiseGateEnabled, noiseGateThreshold]);

  return { sendMessage, setLocalStream };
}
