import { useStore } from "@/shared/store";
import styles from "./ParticipantsList.module.css";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function PeerStats({ peerId }: { peerId: string }) {
  const stats = useStore((s) => s.peerStats[peerId]);
  if (!stats) return null;

  const hasOut = stats.outbound && (stats.outbound.bytes > 0 || stats.outbound.packets > 0);
  const hasIn = stats.inbound && (stats.inbound.bytes > 0 || stats.inbound.packets > 0);
  const hasRtt = stats.roundTripTimeMs != null && stats.roundTripTimeMs > 0;

  if (!hasOut && !hasIn && !hasRtt) return null;

  return (
    <div className={styles.stats}>
      {hasOut && (
        <span title="Исходящий трафик">
          ↑ {formatBytes(stats.outbound!.bytes)} / {stats.outbound!.packets} pkt
          {stats.outbound!.packetsLost ? ` (−${stats.outbound!.packetsLost})` : ""}
        </span>
      )}
      {hasIn && (
        <span title="Входящий трафик">
          ↓ {formatBytes(stats.inbound!.bytes)} / {stats.inbound!.packets} pkt
          {stats.inbound!.packetsLost ? ` (−${stats.inbound!.packetsLost})` : ""}
        </span>
      )}
      {hasRtt && (
        <span title="Задержка (RTT)">
          RTT {Math.round(stats.roundTripTimeMs!)} ms
        </span>
      )}
      {stats.connectionState && (
        <span className={styles.connectionState} title="Состояние соединения">
          {stats.connectionState}
        </span>
      )}
    </div>
  );
}

export function ParticipantsList() {
  const peers = useStore((s) => s.peers);
  const myDisplayName = useStore((s) => s.myDisplayName);

  return (
    <ul className={styles.list}>
      <li className={styles.item}>
        <span className={styles.name}>You</span>
        <span className={styles.youLabel}>({myDisplayName || "—"})</span>
      </li>
      {peers.map((p) => (
        <li key={p.peerId} className={styles.item}>
          <div className={styles.peerMain}>
            <span className={p.speaking ? styles.nameSpeaking : styles.name}>
              {p.displayName || p.peerId.slice(0, 8)}
            </span>
            {p.micMuted ? (
              <span className={styles.muted}>muted</span>
            ) : null}
          </div>
          <PeerStats peerId={p.peerId} />
        </li>
      ))}
    </ul>
  );
}
