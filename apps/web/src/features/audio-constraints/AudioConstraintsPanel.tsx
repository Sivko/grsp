import { useMemo } from "react";
import { Checkbox } from "antd";

export interface AudioConstraintsState {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

const DEFAULT_CONSTRAINTS: AudioConstraintsState = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function getSupportedConstraints(): Partial<Record<keyof AudioConstraintsState, boolean>> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getSupportedConstraints) {
    return {};
  }
  const supported = navigator.mediaDevices.getSupportedConstraints();
  return {
    echoCancellation: supported.echoCancellation ?? false,
    noiseSuppression: supported.noiseSuppression ?? false,
    autoGainControl: supported.autoGainControl ?? false,
  };
}

interface AudioConstraintsPanelProps {
  constraints: AudioConstraintsState;
  onConstraintsChange: (constraints: AudioConstraintsState) => void;
  stream: MediaStream | null;
}

export function AudioConstraintsPanel({ constraints, onConstraintsChange, stream }: AudioConstraintsPanelProps) {
  const supported = useMemo(getSupportedConstraints, []);

  const handleChange = async (key: keyof AudioConstraintsState, checked: boolean) => {
    const next = { ...constraints, [key]: checked };
    onConstraintsChange(next);

    const track = stream?.getAudioTracks()[0];
    if (track) {
      try {
        await track.applyConstraints({ [key]: checked });
      } catch (e) {
        console.warn("[AudioConstraints] applyConstraints failed", { key, checked, err: e });
      }
    }
  };

  const hasAny = supported.echoCancellation || supported.noiseSuppression || supported.autoGainControl;
  if (!hasAny) return null;

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      <span style={{ marginRight: 8, color: "var(--ant-color-text-secondary)", fontSize: 13 }}>Audio:</span>
      {supported.echoCancellation && (
        <Checkbox
          checked={constraints.echoCancellation}
          onChange={(e) => handleChange("echoCancellation", e.target.checked)}
        >
          Echo cancellation
        </Checkbox>
      )}
      {supported.noiseSuppression && (
        <Checkbox
          checked={constraints.noiseSuppression}
          onChange={(e) => handleChange("noiseSuppression", e.target.checked)}
        >
          Noise suppression
        </Checkbox>
      )}
      {supported.autoGainControl && (
        <Checkbox
          checked={constraints.autoGainControl}
          onChange={(e) => handleChange("autoGainControl", e.target.checked)}
        >
          Auto gain
        </Checkbox>
      )}
    </div>
  );
}

export { DEFAULT_CONSTRAINTS };
