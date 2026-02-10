import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "antd";
import { AudioMutedOutlined, AudioOutlined } from "@ant-design/icons";
import { MicDebug } from "./MicDebug";

interface MicToggleProps {
  onStreamChange: (stream: MediaStream | null) => void;
  /** Показывать отладочную панель микрофона (уровень, трек) */
  debug?: boolean;
}

export function MicToggle({ onStreamChange, debug = true }: MicToggleProps) {
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(false);
  const streamForDebugRef = useRef<MediaStream | null>(null);
  const [streamForDebug, setStreamForDebug] = useState<MediaStream | null>(null);

  const enableMic = useCallback(async () => {
    setLoading(true);
    const constraints = { audio: true };
    if (debug) {
      console.log("[Mic] Запрос доступа к микрофону", { constraints });
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getAudioTracks()[0];
      if (debug && track) {
        const settings = track.getSettings();
        console.log("[Mic] Доступ получен", {
          streamId: stream.id,
          trackId: track.id,
          label: track.label,
          readyState: track.readyState,
          enabled: track.enabled,
          settings: {
            sampleRate: settings.sampleRate,
            channelCount: settings.channelCount,
            echoCancellation: settings.echoCancellation,
            autoGainControl: settings.autoGainControl,
            noiseSuppression: settings.noiseSuppression,
          },
        });
      }
      streamForDebugRef.current = stream;
      setStreamForDebug(stream);
      onStreamChange(stream);
      setMuted(false);
    } catch (e) {
      const err = e as DOMException & { constraint?: string };
      console.error("[Mic] Ошибка доступа к микрофону", {
        name: err.name,
        message: err.message,
        ...(err.constraint != null && { constraint: err.constraint }),
      });
    } finally {
      setLoading(false);
    }
  }, [onStreamChange, debug]);

  const disableMic = useCallback(() => {
    if (debug) console.log("[Mic] Микрофон выключен");
    streamForDebugRef.current = null;
    setStreamForDebug(null);
    onStreamChange(null);
    setMuted(true);
  }, [onStreamChange, debug]);

  useEffect(() => {
    return () => {
      onStreamChange(null);
    };
  }, [onStreamChange]);

  const toggle = () => {
    if (muted) enableMic();
    else disableMic();
  };

  return (
    <>
      <Button
        type={muted ? "default" : "primary"}
        danger={!muted}
        icon={muted ? <AudioMutedOutlined /> : <AudioOutlined />}
        onClick={toggle}
        loading={loading}
      >
        {muted ? "Turn on microphone" : "Turn off microphone"}
      </Button>
      {debug && <MicDebug stream={streamForDebug} showOnlyWhenActive />}
    </>
  );
}
