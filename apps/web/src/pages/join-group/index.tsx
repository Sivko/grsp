import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Layout, message as antMessage } from "antd";
import { parseGroupLink, getHashFromWindow } from "@/shared/lib/group-link";
import { useStore, keyPairToBase64 } from "@/shared/store";
import { generateKeyPair } from "@/shared/lib/crypto";

const { Content } = Layout;

export function JoinGroupPage() {
  const navigate = useNavigate();
  const bootstrapUrl = useStore((s) => s.bootstrapUrl);
  const setBootstrapUrl = useStore((s) => s.setBootstrapUrl);
  const setMyDisplayName = useStore((s) => s.setMyDisplayName);
  const setGroup = useStore((s) => s.setGroup);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);
  const myDisplayName = useStore((s) => s.myDisplayName);

  const [nameInput, setNameInput] = useState(myDisplayName);
  const [joining, setJoining] = useState(false);

  const hash = getHashFromWindow();
  const parsed = parseGroupLink(hash || "#");

  useEffect(() => {
    if (myDisplayName) setNameInput(myDisplayName);
  }, [myDisplayName]);

  const handleJoin = async () => {
    const name = nameInput.trim();
    if (!name) {
      antMessage.warning("Enter your name");
      return;
    }
    if (!parsed) {
      antMessage.warning("Invalid group link. Open the link shared with you.");
      return;
    }
    const effectiveBootstrap = (parsed.bootstrapUrl || bootstrapUrl).trim();
    if (!effectiveBootstrap) {
      antMessage.warning("Bootstrap URL is missing. Use a link shared by the group creator.");
      return;
    }
    setJoining(true);
    try {
      if (parsed.bootstrapUrl) setBootstrapUrl(parsed.bootstrapUrl);
      setMyDisplayName(name);
      const keyPair = await generateKeyPair();
      setMyKeyPair(keyPairToBase64(keyPair.publicKey, keyPair.privateKey));
      setGroup(parsed.groupId, parsed.keyBase64);
      navigate("/room");
    } catch (e) {
      antMessage.error("Failed to join");
    } finally {
      setJoining(false);
    }
  };

  return (
    <Layout style={{ minHeight: "100vh", padding: 24 }}>
      <Content style={{ maxWidth: 560, margin: "0 auto", width: "100%" }}>
        <Card title="Join group">
          {!parsed ? (
            <p style={{ color: "var(--ant-color-warning)" }}>
              No group link in URL. Open the link shared by the group creator.
            </p>
          ) : null}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8 }}>Your name</label>
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Display name"
            />
          </div>
          <Button type="primary" onClick={handleJoin} loading={joining} disabled={!parsed}>
            Join
          </Button>
        </Card>
      </Content>
    </Layout>
  );
}
