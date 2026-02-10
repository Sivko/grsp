import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout, Card, Tag, Button } from "antd";
import { useRoomConnection } from "./use-room-connection";
import { MicToggle } from "@/features/mic-toggle";
import { ParticipantsList } from "@/features/participants-list";
import { ChatPanel } from "@/features/chat";
import { useStore } from "@/shared/store";
import { MAX_PEERS } from "@/shared/lib/discovery";

const { Content } = Layout;

export function RoomPage() {
  const navigate = useNavigate();
  const groupId = useStore((s) => s.groupId);
  const connectionStatus = useStore((s) => s.connectionStatus);
  const peers = useStore((s) => s.peers);
  const leaveGroup = useStore((s) => s.leaveGroup);
  const resetSession = useStore((s) => s.resetSession);

  const { sendMessage, setLocalStream } = useRoomConnection();

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
          <ParticipantsList />
          <div style={{ marginTop: 16 }}>
            <MicToggle onStreamChange={setLocalStream} />
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
    </Layout>
  );
}
