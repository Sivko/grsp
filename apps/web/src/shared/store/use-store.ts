import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "./idb-storage";
import type { KeyPairBase64, PeerState, ChatMessage } from "./types";

const PERSIST_NAME = "meet-p2p-persist";

interface PersistedSlice {
  bootstrapUrl: string;
  groupId: string | null;
  groupKeyBase64: string | null;
  myKeyPairBase64: KeyPairBase64 | null;
  myDisplayName: string;
  setBootstrapUrl: (url: string) => void;
  setGroup: (groupId: string | null, groupKeyBase64: string | null) => void;
  setMyKeyPair: (pair: KeyPairBase64 | null) => void;
  setMyDisplayName: (name: string) => void;
  leaveGroup: () => void;
}

interface SessionSlice {
  myPeerId: string;
  peers: PeerState[];
  messages: ChatMessage[];
  connectionStatus: "disconnected" | "connecting" | "connected";
  setMyPeerId: (id: string) => void;
  setPeers: (peers: PeerState[]) => void;
  setPeerSpeaking: (peerId: string, speaking: boolean) => void;
  setPeerMicMuted: (peerId: string, muted: boolean) => void;
  addMessage: (msg: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  setConnectionStatus: (status: "disconnected" | "connecting" | "connected") => void;
  resetSession: () => void;
}

function base64ToBytes(b64: string): Uint8Array {
  let normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const useStore = create<PersistedSlice & SessionSlice>()(
  persist(
    (set) => ({
      bootstrapUrl: "",
      groupId: null,
      groupKeyBase64: null,
      myKeyPairBase64: null,
      myDisplayName: "",
      setBootstrapUrl: (url) => set({ bootstrapUrl: url }),
      setGroup: (groupId, groupKeyBase64) => set({ groupId, groupKeyBase64 }),
      setMyKeyPair: (pair) => set({ myKeyPairBase64: pair }),
      setMyDisplayName: (name) => set({ myDisplayName: name }),
      leaveGroup: () =>
        set({ groupId: null, groupKeyBase64: null, myKeyPairBase64: null }),

      myPeerId: "",
      peers: [],
      messages: [],
      connectionStatus: "disconnected",
      setMyPeerId: (id) => set({ myPeerId: id }),
      setPeers: (peers) => set({ peers }),
      setPeerSpeaking: (peerId, speaking) =>
        set((s) => ({
          peers: s.peers.map((p) => (p.peerId === peerId ? { ...p, speaking } : p)),
        })),
      setPeerMicMuted: (peerId, muted) =>
        set((s) => ({
          peers: s.peers.map((p) => (p.peerId === peerId ? { ...p, micMuted: muted } : p)),
        })),
      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
      setMessages: (messages) => set({ messages }),
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      resetSession: () =>
        set({
          myPeerId: "",
          peers: [],
          messages: [],
          connectionStatus: "disconnected",
        }),
    }),
    {
      name: PERSIST_NAME,
      storage: createJSONStorage(() => ({
        getItem: async (name) => idbStorage.getItem(name),
        setItem: async (name, value) => idbStorage.setItem(name, value),
        removeItem: async (name) => idbStorage.removeItem(name),
      })),
      partialize: (s) => ({
        bootstrapUrl: s.bootstrapUrl,
        groupId: s.groupId,
        groupKeyBase64: s.groupKeyBase64,
        myKeyPairBase64: s.myKeyPairBase64,
        myDisplayName: s.myDisplayName,
      }),
    }
  )
);

export function getGroupKeyBytes(): Uint8Array | null {
  const b64 = useStore.getState().groupKeyBase64;
  return b64 ? base64ToBytes(b64) : null;
}

export function getMyKeyPairBytes(): { publicKey: Uint8Array; privateKey: Uint8Array } | null {
  const pair = useStore.getState().myKeyPairBase64;
  if (!pair) return null;
  return {
    publicKey: base64ToBytes(pair.publicKey),
    privateKey: base64ToBytes(pair.privateKey),
  };
}

export function keyPairToBase64(publicKey: Uint8Array, privateKey: Uint8Array): KeyPairBase64 {
  return {
    publicKey: bytesToBase64(publicKey),
    privateKey: bytesToBase64(privateKey),
  };
}
