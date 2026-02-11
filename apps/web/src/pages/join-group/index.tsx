import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Layout, message as antMessage } from "antd";
import { parseGroupLink, getHashFromWindow } from "@/shared/lib/group-link";
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

export function JoinGroupPage() {
  const navigate = useNavigate();
  const bootstrapUrl = useStore((s) => s.bootstrapUrl);
  const setBootstrapUrl = useStore((s) => s.setBootstrapUrl);
  const setMyDisplayName = useStore((s) => s.setMyDisplayName);
  const setGroup = useStore((s) => s.setGroup);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);

  const savedName = getDisplayNameFromStorage();
  const needsNameInput = !savedName;
  const [nameInput, setNameInput] = useState(savedName);
  const [joining, setJoining] = useState(false);
  const [linkInput, setLinkInput] = useState("");

  const hash = getHashFromWindow();
  const parsed = parseGroupLink(hash || "#");
  const hasNoHash = !hash || hash === "#";

  const handlePasteLink = () => {
    const trimmed = linkInput.trim();
    if (!trimmed) {
      antMessage.warning("Paste the room link");
      return;
    }
    let toParse = trimmed;
    if (trimmed.startsWith("http") || trimmed.startsWith("/")) {
      try {
        const url = new URL(trimmed.startsWith("/") ? window.location.origin + trimmed : trimmed);
        toParse = url.hash || url.pathname + url.search;
      } catch {
        toParse = trimmed.includes("#") ? trimmed.slice(trimmed.indexOf("#")) : "#" + trimmed;
      }
    } else if (!trimmed.startsWith("#")) {
      toParse = "#" + trimmed;
    }
    const validation = parseGroupLink(toParse);
    if (!validation) {
      antMessage.error("Invalid link. Use the link shared by the group creator.");
      return;
    }
    window.location.hash = toParse.startsWith("#") ? toParse : "#" + toParse;
  };

  useEffect(() => {
    if (savedName) {
      setMyDisplayName(savedName);
    }
  }, [savedName, setMyDisplayName]);

  const handleJoin = async () => {
    const name = savedName || nameInput.trim();
    if (!name) {
      antMessage.warning("Enter your name");
      return;
    }
    if (!parsed) {
      antMessage.warning("Invalid group link. Open the link shared with you.");
      return;
    }
    const effectiveBootstrap = (parsed.bootstrapUrl || bootstrapUrl || (!isDev ? getDefaultBootstrapUrl() : "")).trim();
    if (!effectiveBootstrap) {
      antMessage.warning("Bootstrap URL is missing. Use a link shared by the group creator.");
      return;
    }
    setJoining(true);
    try {
      setBootstrapUrl(parsed.bootstrapUrl || bootstrapUrl || (!isDev ? getDefaultBootstrapUrl() : ""));
      setMyDisplayName(name);
      saveDisplayNameToStorage(name);
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
        <Card title="Присоединиться">
          {hasNoHash ? (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8 }}>
                Вставьте ссылку комнаты
              </label>
              <Input.TextArea
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                placeholder="https://... или #g=...&k=...&b=..."
                rows={3}
                style={{ marginBottom: 8 }}
              />
              <Button type="primary" onClick={handlePasteLink}>
                Открыть комнату
              </Button>
            </div>
          ) : !parsed ? (
            <p style={{ color: "var(--ant-color-warning)" }}>
              Неверная ссылка. Используйте ссылку, которую отправил создатель группы.
            </p>
          ) : null}
          {parsed && needsNameInput ? (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 8 }}>Your name</label>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Display name"
              />
            </div>
          ) : null}
          {parsed ? (
            <Button type="primary" onClick={handleJoin} loading={joining}>
              Присоединиться
            </Button>
          ) : null}
        </Card>
      </Content>
    </Layout>
  );
}
