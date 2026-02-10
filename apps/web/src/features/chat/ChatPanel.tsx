import { useState } from "react";
import { Button, Input, List } from "antd";
import { useStore } from "@/shared/store";

interface ChatPanelProps {
  onSend: (text: string) => void;
}

export function ChatPanel({ onSend }: ChatPanelProps) {
  const messages = useStore((s) => s.messages);
  const myPeerId = useStore((s) => s.myPeerId);
  const peers = useStore((s) => s.peers);
  const [input, setInput] = useState("");

  const getDisplayName = (peerId: string) => {
    if (peerId === myPeerId) return "You";
    return peers.find((p) => p.peerId === peerId)?.displayName ?? peerId.slice(0, 8);
  };

  const handleSend = () => {
    const t = input.trim();
    if (!t) return;
    onSend(t);
    setInput("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <List
        dataSource={messages}
        style={{ flex: 1, overflow: "auto", padding: 8 }}
        renderItem={(m) => (
          <List.Item key={m.id}>
            <div>
              <strong>{getDisplayName(m.peerId)}</strong>
              {!m.signatureValid ? " (invalid signature)" : null}
              <div style={{ color: "var(--ant-color-text-secondary)" }}>{m.text}</div>
            </div>
          </List.Item>
        )}
      />
      <Input.TextArea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        placeholder="Type a message..."
        autoSize={{ minRows: 1, maxRows: 4 }}
        style={{ marginTop: 8 }}
      />
      <Button type="primary" onClick={handleSend} style={{ marginTop: 4, alignSelf: "flex-end" }}>
        Send
      </Button>
    </div>
  );
}
