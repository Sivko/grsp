import { useEffect, useRef, useState } from "react";
import { Typography, Progress, Space } from "antd";

const { Text } = Typography;

interface MicDebugProps {
  stream: MediaStream | null;
  /** Показывать панель только когда stream не null */
  showOnlyWhenActive?: boolean;
}

export function MicDebug({ stream, showOnlyWhenActive = true }: MicDebugProps) {
  const [level, setLevel] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (audioContextRef.current?.state !== "closed") {
        audioContextRef.current?.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
      return;
    }

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      const a = analyserRef.current;
      const arr = dataArrayRef.current;
      if (!a || !arr) return;
      a.getByteFrequencyData(arr);
      const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
      setLevel(Math.min(100, Math.round(avg)));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      audioContext.close();
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
      setLevel(0);
    };
  }, [stream]);

  if (showOnlyWhenActive && !stream) return null;

  const tracks = stream?.getAudioTracks() ?? [];
  const track = tracks[0];

  return (
    <Space direction="vertical" size={4} style={{ width: "100%", marginTop: 8 }}>
      <Text type="secondary" style={{ fontSize: 11 }}>
        [Debug] Микрофон
      </Text>
      {track ? (
        <>
          <Progress
            percent={level}
            size="small"
            showInfo={false}
            status={level > 0 ? "active" : "normal"}
          />
          <Text style={{ fontSize: 10 }} type="secondary">
            Уровень: {level} · {track.label || "Audio"} · {track.readyState} · enabled: {String(track.enabled)}
          </Text>
        </>
      ) : (
        <Text type="secondary" style={{ fontSize: 11 }}>
          Нет трека
        </Text>
      )}
    </Space>
  );
}
