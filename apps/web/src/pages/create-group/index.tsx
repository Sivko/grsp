import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Layout, message as antMessage } from "antd";
import { createGroupLink } from "@/shared/lib/group-link";
import { useStore, keyPairToBase64 } from "@/shared/store";
import { generateKeyPair } from "@/shared/lib/crypto";

const DISPLAY_NAME_KEY = "grsp-display-name";

function getDisplayNameFromStorage(): string {
  try {
    return localStorage.getItem(DISPLAY_NAME_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

function saveDisplayNameToStorage(name: string): void {
  try {
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  } catch {
    // ignore
  }
}

const { Content } = Layout;

const isDev = import.meta.env.DEV;

function getDefaultBootstrapUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function CreateGroupPage() {
  const navigate = useNavigate();
  const bootstrapUrl = useStore((s) => s.bootstrapUrl);
  const setBootstrapUrl = useStore((s) => s.setBootstrapUrl);
  const setGroup = useStore((s) => s.setGroup);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);
  const setMyDisplayName = useStore((s) => s.setMyDisplayName);

  const savedName = getDisplayNameFromStorage();
  const [bootstrapInput, setBootstrapInput] = useState(bootstrapUrl || (isDev ? "" : getDefaultBootstrapUrl()));
  const [groupUrl, setGroupUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [nameInput, setNameInput] = useState("");

  const needsNameInput = !savedName;

  useEffect(() => {
    if (savedName) {
      setMyDisplayName(savedName);
    }
  }, [savedName, setMyDisplayName]);

  const handleSaveBootstrap = () => {
    setBootstrapUrl(bootstrapInput.trim());
    antMessage.success("Bootstrap URL saved");
  };

  const handleCreateGroup = async () => {
    const bootstrap = isDev ? bootstrapInput.trim() : getDefaultBootstrapUrl();
    if (!bootstrap) {
      antMessage.warning(isDev ? "Enter bootstrap server URL first" : "Bootstrap URL is not available");
      return;
    }
    const name = savedName || nameInput.trim();
    if (!name) {
      antMessage.warning("Enter your name");
      return;
    }
    setCreating(true);
    try {
      setBootstrapUrl(bootstrap);
      setMyDisplayName(name);
      saveDisplayNameToStorage(name);
      const keyPair = await generateKeyPair();
      setMyKeyPair(keyPairToBase64(keyPair.publicKey, keyPair.privateKey));
      const origin = window.location.origin;
      const { url, groupId, keyBase64 } = createGroupLink(origin, bootstrap);
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
          {isDev ? (
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
          ) : null}
          {needsNameInput ? (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Your name</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display name"
              />
            </div>
          ) : null}
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
