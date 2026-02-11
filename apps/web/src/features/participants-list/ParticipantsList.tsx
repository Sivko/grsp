import { useStore } from "@/shared/store";
import { Slider, Tag } from "antd";
import styles from "./ParticipantsList.module.css";

interface ParticipantsListProps {
  setPeerVolume?: (peerId: string, volume: number) => void;
}

function getQualityLabel(quality: { rtt?: number; lossPercent?: number } | undefined): string | null {
  if (!quality) return null;
  const { rtt = 9999, lossPercent = 0 } = quality;
  if (rtt < 150 && lossPercent < 5) return "Отлично";
  if (rtt < 300 && lossPercent < 10) return "Хорошо";
  return "Плохо";
}

function getQualityColor(quality: { rtt?: number; lossPercent?: number } | undefined): string {
  if (!quality) return "default";
  const { rtt = 9999, lossPercent = 0 } = quality;
  if (rtt < 150 && lossPercent < 5) return "green";
  if (rtt < 300 && lossPercent < 10) return "gold";
  return "red";
}

export function ParticipantsList({ setPeerVolume }: ParticipantsListProps) {
  const peers = useStore((s) => s.peers);
  const myDisplayName = useStore((s) => s.myDisplayName);
  const peerQuality = useStore((s) => s.peerQuality);
  const peerVolumes = useStore((s) => s.peerVolumes);

  return (
    <ul className={styles.list}>
      <li className={styles.item}>
        <span className={styles.name}>You</span>
        <span className={styles.youLabel}>({myDisplayName || "—"})</span>
      </li>
      {peers.map((p) => {
        const quality = peerQuality[p.peerId];
        const qualityLabel = getQualityLabel(quality);
        const qualityColor = getQualityColor(quality);
        const volume = peerVolumes[p.peerId] ?? 1;
        return (
          <li key={p.peerId} className={styles.item} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={p.speaking ? styles.nameSpeaking : styles.name}>
                {p.displayName || p.peerId.slice(0, 8)}
              </span>
              <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                {qualityLabel ? (
                  <Tag color={qualityColor}>{qualityLabel}</Tag>
                ) : null}
                {p.micMuted ? (
                  <span className={styles.muted}>muted</span>
                ) : null}
              </span>
            </div>
            {setPeerVolume ? (
              <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                <Slider
                  min={0}
                  max={2}
                  step={0.1}
                  value={volume}
                  onChange={(v) => setPeerVolume(p.peerId, v ?? 1)}
                  style={{ flex: 1, margin: 0 }}
                />
                <span style={{ fontSize: 12, color: "var(--ant-color-text-secondary)", minWidth: 32 }}>
                  {Math.round(volume * 100)}%
                </span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
