import { useEffect, useRef, useState, useCallback } from "react";
import { Modal, Select, InputNumber, Space, Typography, Divider, Button, Progress, Segmented, Slider, Switch } from "antd";
import { SettingOutlined, SoundOutlined, StopOutlined } from "@ant-design/icons";
import { useStore } from "@/shared/store";
import type { MicSettings } from "@/shared/store/types";
import { buildAudioConstraints } from "./build-constraints";
import { applyEqualizer } from "./apply-equalizer";
import type { EqualizerPreset } from "@/shared/store/types";

const SAMPLE_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000, 96000];
const SAMPLE_SIZES = [8, 16, 24, 32];
const CHANNEL_COUNTS = [1, 2];

interface MicSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface AudioDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export function MicSettingsModal({ open, onClose }: MicSettingsModalProps) {
  const micSettings = useStore((s) => s.micSettings);
  const setMicSettings = useStore((s) => s.setMicSettings);

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [supportedConstraints, setSupportedConstraints] = useState<Record<string, boolean>>({});
  const [testStream, setTestStream] = useState<MediaStream | null>(null);
  const [testLevel, setTestLevel] = useState(0);
  const [testError, setTestError] = useState<string | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const equalizerContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = list
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
          kind: d.kind,
        }));
      setDevices(audioInputs);
    } catch (e) {
      console.error("[MicSettings] enumerateDevices failed", e);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDevices();
      setSupportedConstraints(navigator.mediaDevices.getSupportedConstraints() as Record<string, boolean>);
    }
  }, [open, loadDevices]);

  const startTest = useCallback(async () => {
    setTestError(null);
    const constraints = buildAudioConstraints(micSettings);
    const audioConstraints = constraints === true ? { audio: true } : { audio: constraints };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(audioConstraints);
      testStreamRef.current = stream;
      setTestStream(stream);

      const eqPreset = (micSettings.equalizerPreset ?? "keyboard") as EqualizerPreset;
      const eq = applyEqualizer(stream, { preset: eqPreset });
      equalizerContextRef.current = eq.context;
      const streamToPlay = eq.stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(streamToPlay);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      // Локальное воспроизведение для теста голоса (с эквалайзером)
      const gainNode = audioContext.createGain();
      const gain = micSettings.testGain ?? 0.5;
      gainNode.gain.value = gain;
      source.connect(gainNode);
      gainNode.connect(audioContext.destination);

      gainNodeRef.current = gainNode;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        const a = analyserRef.current;
        const arr = dataArrayRef.current;
        if (!a || !arr) return;
        a.getByteFrequencyData(arr);
        const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
        setTestLevel(Math.min(100, Math.round(avg)));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const err = e as DOMException;
      setTestError(err.message || "Ошибка доступа к микрофону");
    }
  }, [micSettings]);

  const stopTest = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioContextRef.current?.close();
    audioContextRef.current = null;
    equalizerContextRef.current?.close();
    equalizerContextRef.current = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
    dataArrayRef.current = null;
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    setTestStream(null);
    setTestLevel(0);
  }, []);

  useEffect(() => {
    if (!open) stopTest();
  }, [open, stopTest]);

  const updateSetting = useCallback(
    <K extends keyof MicSettings>(key: K, value: MicSettings[K]) => {
      setMicSettings({ [key]: value });
    },
    [setMicSettings]
  );

  const renderBoolOption = (
    key: "echoCancellation" | "autoGainControl" | "noiseSuppression",
    label: string,
    supported: boolean
  ) => {
    if (!supported) return null;
    const val = micSettings[key];
    return (
      <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Typography.Text style={{ width: 180 }}>{label}</Typography.Text>
        <Segmented
          size="small"
          value={val === null ? "auto" : val ? "on" : "off"}
          options={[
            { label: "Авто", value: "auto" },
            { label: "Вкл", value: "on" },
            { label: "Выкл", value: "off" },
          ]}
          onChange={(v) => updateSetting(key, v === "auto" ? null : v === "on")}
        />
      </div>
    );
  };

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          Настройки микрофона
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={520}
      destroyOnClose
    >
      <Space direction="vertical" style={{ width: "100%" }} size="middle">
        {/* Устройство */}
        <div>
          <Typography.Text strong>Устройство ввода</Typography.Text>
          <Select
            style={{ width: "100%", marginTop: 4 }}
            placeholder="Устройство по умолчанию"
            allowClear
            value={micSettings.deviceId || undefined}
            onChange={(v) => updateSetting("deviceId", v ?? null)}
            options={[
              { value: undefined, label: "По умолчанию" },
              ...devices.map((d) => ({ value: d.deviceId, label: d.label })),
            ]}
          />
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Boolean параметры */}
        <div>
          <Typography.Text strong>Обработка аудио</Typography.Text>
          <div style={{ marginTop: 8 }}>
            {renderBoolOption("echoCancellation", "Эхоподавление", !!supportedConstraints.echoCancellation)}
            {renderBoolOption("autoGainControl", "Автоусиление", !!supportedConstraints.autoGainControl)}
            {renderBoolOption("noiseSuppression", "Подавление шума", !!supportedConstraints.noiseSuppression)}
          </div>
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Числовые параметры */}
        <div>
          <Typography.Text strong>Параметры потока</Typography.Text>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 16 }}>
            {supportedConstraints.sampleRate && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Sample rate (Гц)
                </Typography.Text>
                <Select
                  size="small"
                  placeholder="auto"
                  allowClear
                  value={micSettings.sampleRate ?? undefined}
                  onChange={(v) => updateSetting("sampleRate", v ?? null)}
                  style={{ width: 110, marginLeft: 4 }}
                  options={[
                    { value: undefined, label: "auto" },
                    ...SAMPLE_RATES.map((n) => ({ value: n, label: String(n) })),
                  ]}
                />
              </div>
            )}
            {supportedConstraints.sampleSize && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Sample size (бит)
                </Typography.Text>
                <Select
                  size="small"
                  placeholder="auto"
                  allowClear
                  value={micSettings.sampleSize ?? undefined}
                  onChange={(v) => updateSetting("sampleSize", v ?? null)}
                  style={{ width: 90, marginLeft: 4 }}
                  options={SAMPLE_SIZES.map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
            )}
            {supportedConstraints.channelCount && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Каналы
                </Typography.Text>
                <Select
                  size="small"
                  placeholder="auto"
                  allowClear
                  value={micSettings.channelCount ?? undefined}
                  onChange={(v) => updateSetting("channelCount", v ?? null)}
                  style={{ width: 80, marginLeft: 4 }}
                  options={CHANNEL_COUNTS.map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
            )}
            {supportedConstraints.latency && (
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Latency (сек)
                </Typography.Text>
                <InputNumber
                  size="small"
                  placeholder="auto"
                  min={0}
                  step={0.01}
                  value={micSettings.latency ?? undefined}
                  onChange={(v) => updateSetting("latency", v ?? null)}
                  style={{ width: 90, marginLeft: 4 }}
                />
              </div>
            )}
          </div>
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Громкость микрофона при передаче */}
        <div>
          <Typography.Text strong>Громкость микрофона</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
            Усиление/ослабление микрофона при передаче собеседникам. 100% — без изменений.
          </Typography.Text>
          <Slider
            min={10}
            max={300}
            value={Math.round((micSettings.micGain ?? 1) * 100)}
            onChange={(v) => updateSetting("micGain", (v ?? 100) / 100)}
            style={{ width: "100%", maxWidth: 280 }}
            marks={{ 100: "100%" }}
          />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {Math.round((micSettings.micGain ?? 1) * 100)}%
          </Typography.Text>
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* RNNnoise */}
        <div>
          <Typography.Text strong>RNNnoise</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
            Подавление шума через нейросеть (как в Яндекс Телемост). Рекомендуется включить.
          </Typography.Text>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Switch
              checked={micSettings.rnnoiseEnabled ?? true}
              onChange={(v) => updateSetting("rnnoiseEnabled", v)}
            />
            <Typography.Text>Включить</Typography.Text>
          </div>
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Шлюз тишины (noise gate) */}
        <div>
          <Typography.Text strong>Шлюз тишины</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
            Передавать звук только выше порога. Обрезает тихие звуки (клавиатура, фоновый шум).
          </Typography.Text>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
            <Switch
              checked={micSettings.noiseGateEnabled ?? true}
              onChange={(v) => updateSetting("noiseGateEnabled", v)}
            />
            <Typography.Text>Включить</Typography.Text>
          </div>
          {micSettings.noiseGateEnabled && (
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Порог: {micSettings.noiseGateThreshold ?? 25} (чем выше — тем тише обрезается)
              </Typography.Text>
              <Slider
                min={5}
                max={80}
                value={micSettings.noiseGateThreshold ?? 25}
                onChange={(v) => updateSetting("noiseGateThreshold", v ?? 25)}
                style={{ marginTop: 4, maxWidth: 280 }}
              />
            </div>
          )}
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Эквалайзер */}
        <div>
          <Typography.Text strong>Эквалайзер</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
            Подавление клавиатуры и других нежелательных звуков в микрофоне.
          </Typography.Text>
          <Select
            style={{ width: "100%", maxWidth: 320 }}
            value={(micSettings.equalizerPreset ?? "keyboard") as EqualizerPreset}
            onChange={(v) => updateSetting("equalizerPreset", v)}
            options={[
              { value: "none", label: "Без эквалайзера" },
              { value: "keyboard", label: "Подавление клавиатуры" },
              { value: "voice", label: "Чёткость голоса" },
              { value: "voice-keyboard", label: "Голос + клавиатура (рекомендуется)" },
              { value: "reduce-hiss", label: "Подавление шипения и фона" },
            ]}
          />
        </div>

        <Divider style={{ margin: "8px 0" }} />

        {/* Режим тестирования */}
        <div>
          <Typography.Text strong>Тестирование голоса</Typography.Text>
          <Typography.Text type="secondary" style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
            Включите микрофон и проверьте уровень звука. Ваш голос будет воспроизводиться локально.
          </Typography.Text>
          {!testStream ? (
            <Button type="primary" icon={<SoundOutlined />} onClick={startTest}>
              Начать тест
            </Button>
          ) : (
            <Space direction="vertical" style={{ width: "100%" }}>
              <Space>
                <Button danger icon={<StopOutlined />} onClick={stopTest}>
                  Остановить тест
                </Button>
                <Typography.Text type="success">Говорите в микрофон</Typography.Text>
              </Space>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Громкость воспроизведения: {Math.round((micSettings.testGain ?? 0.5) * 100)}%
                </Typography.Text>
                <Slider
                  min={0}
                  max={3}
                  step={0.01}
                  value={micSettings.testGain ?? 0.5}
                  onChange={(v) => {
                    updateSetting("testGain", v);
                    gainNodeRef.current && (gainNodeRef.current.gain.value = v);
                  }}
                  style={{ marginTop: 4 }}
                />
              </div>
              <Progress
                percent={testLevel}
                size="small"
                status={testLevel > 0 ? "active" : "normal"}
                showInfo
              />
            </Space>
          )}
          {testError && (
            <Typography.Text type="danger" style={{ display: "block", marginTop: 8 }}>
              {testError}
            </Typography.Text>
          )}
        </div>
      </Space>
    </Modal>
  );
}
