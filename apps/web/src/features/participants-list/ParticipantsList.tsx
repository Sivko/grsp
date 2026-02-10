import { useStore } from "@/shared/store";
import styles from "./ParticipantsList.module.css";

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
          <span className={p.speaking ? styles.nameSpeaking : styles.name}>
            {p.displayName || p.peerId.slice(0, 8)}
          </span>
          {p.micMuted ? (
            <span className={styles.muted}>muted</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
