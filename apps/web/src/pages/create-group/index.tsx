import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Layout, message as antMessage } from "antd";
import { createGroupLink } from "@/shared/lib/group-link";
import { useStore, keyPairToBase64 } from "@/shared/store";
import { generateKeyPair } from "@/shared/lib/crypto";

const { Content } = Layout;

export function CreateGroupPage() {
  const navigate = useNavigate();
  const bootstrapUrl = useStore((s) => s.bootstrapUrl);
  const setBootstrapUrl = useStore((s) => s.setBootstrapUrl);
  const setGroup = useStore((s) => s.setGroup);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);

  const [bootstrapInput, setBootstrapInput] = useState(bootstrapUrl);
  const [groupUrl, setGroupUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const handleSaveBootstrap = () => {
    setBootstrapUrl(bootstrapInput.trim());
    antMessage.success("Bootstrap URL saved");
  };

  const handleCreateGroup = async () => {
    if (!bootstrapInput.trim()) {
      antMessage.warning("Enter bootstrap server URL first");
      return;
    }
    setCreating(true);
    try {
      setBootstrapUrl(bootstrapInput.trim());
      const keyPair = await generateKeyPair();
      setMyKeyPair(keyPairToBase64(keyPair.publicKey, keyPair.privateKey));
      const origin = window.location.origin;
      const { url, groupId, keyBase64 } = createGroupLink(origin, bootstrapInput.trim());
      setGroup(groupId, keyBase64);
      setGroupUrl(url);
      antMessage.success("Group created");
    } catch (e) {
      antMessage.error("Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!groupUrl) return;
    await navigator.clipboard.writeText(groupUrl);
    antMessage.success("Link copied");
  };

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Content style={{ maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <Card title="Create group">
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8 }}>
              Bootstrap server URL
            </label>
            <Input
              value={bootstrapInput}
              onChange={(e) => setBootstrapInput(e.target.value)}
              placeholder="https://your-bootstrap.example.com"
              onBlur={handleSaveBootstrap}
            />
          </div>
          {!groupUrl ? (
            <Button
              type="primary"
              onClick={handleCreateGroup}
              loading={creating}
            >
              Create group
            </Button>
          ) : (
            <div>
              <label style={{ display: "block", marginBottom: 8 }}>
                Group link (share with others)
              </label>
              <Input readOnly value={groupUrl} style={{ marginBottom: 12 }} />
              <Button
                type="primary"
                onClick={handleCopy}
                style={{ marginRight: 8 }}
              >
                Copy link
              </Button>
              <Button onClick={() => navigate("/room")}>Go to room</Button>
            </div>
          )}
        </Card>
      </Content>
    </Layout>
  );
}
