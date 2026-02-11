import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Card, Tag, Button } from "antd";
import { useRoomConnection } from "./use-room-connection";
import { MicToggle } from "@/features/mic-toggle";
import { ParticipantsList } from "@/features/participants-list";
import { ChatPanel } from "@/features/chat";
import { AudioConstraintsPanel, DEFAULT_CONSTRAINTS, getSupportedConstraints } from "@/features/audio-constraints";
import { useStore } from "@/shared/store";
import { MAX_PEERS } from "@/shared/lib/discovery";
import type { AudioConstraintsState } from "@/features/audio-constraints";

const { Content, Header, Footer } = Layout;

export function RoomPage() {
  const navigate = useNavigate();
  const groupId = useStore((s) => s.groupId);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const peers = useStore((s) => s.peers);
  const pingMs = useStore((s) => s.pingMs);
  const leaveGroup = useStore((s) => s.leaveGroup);
  const resetSession = useStore((s) => s.resetSession);

  const { sendMessage, setLocalStream, setPeerVolume } = useRoomConnection();

  const [localStream, setLocalStreamState] = useState<MediaStream | null>(null);
  const [audioConstraints, setAudioConstraints] = useState<AudioConstraintsState>(DEFAULT_CONSTRAINTS);

  const handleStreamChange = (stream: MediaStream | null) => {
    setLocalStreamState(stream);
    setLocalStream(stream);
  };

  const hasAudioConstraintsSupport = useMemo(() => {
    const s = getSupportedConstraints();
    return !!(s.echoCancellation || s.noiseSuppression || s.autoGainControl);
  }, []);

  useEffect(() => {
    if (!groupId) navigate("/", { replace: true });
  }, [groupId, navigate]);

  const handleLeave = () => {
    leaveGroup();
    resetSession();
    navigate("/");
  };

  if (!groupId) return null;

  const statusColor =
    connectionStatus === "connected"
      ? "green"
      : connectionStatus === "connecting"
        ? "orange"
        : "default";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 24px",
          background: "transparent",
        }}
      >
        {pingMs != null ? (
          <span style={{ fontSize: 14, color: "var(--ant-color-text-secondary)" }}>
            Ping: {pingMs} ms
          </span>
        ) : null}
      </Header>
      <Content style={{ display: "flex", padding: 16, gap: 16 }}>
        <Card
          title="Participants"
          extra={
            <>
              <Tag color={statusColor}>{connectionStatus}</Tag>
              <span style={{ marginLeft: 8, fontSize: 12 }}>
                {peers.length}/{MAX_PEERS}
              </span>
            </>
          }
          style={{ width: 280, flexShrink: 0 }}
        >
          <ParticipantsList setPeerVolume={setPeerVolume} />
          <div style={{ marginTop: 16 }}>
            <MicToggle onStreamChange={handleStreamChange} audioConstraints={audioConstraints} />
          </div>
          <Button type="link" danger onClick={handleLeave} style={{ marginTop: 12 }}>
            Leave group
          </Button>
        </Card>
        <Card title="Chat" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 400 }}>
            <ChatPanel onSend={sendMessage} />
          </div>
        </Card>
      </Content>
      {hasAudioConstraintsSupport && (
        <Footer style={{ padding: "12px 24px", textAlign: "left" }}>
          <AudioConstraintsPanel
            constraints={audioConstraints}
            onConstraintsChange={setAudioConstraints}
            stream={localStream}
          />
        </Footer>
      )}
    </Layout>
  );
}
