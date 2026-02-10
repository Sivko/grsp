import {
  GROUP_ID_BYTES,
  GROUP_KEY_BYTES,
  HASH_PARAM_GROUP,
  HASH_PARAM_KEY,
  HASH_PARAM_BOOTSTRAP,
} from "./constants";

function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface CreatedGroupLink {
  url: string;
  groupId: string;
  keyBytes: Uint8Array;
  keyBase64: string;
}

export function createGroupLink(origin: string, bootstrapUrl: string): CreatedGroupLink {
  const groupIdBytes = randomBytes(GROUP_ID_BYTES);
  const keyBytes = randomBytes(GROUP_KEY_BYTES);
  const groupId = toBase64Url(groupIdBytes);
  const keyBase64 = toBase64Url(keyBytes);
  const base = origin.replace(/\/$/, "");
  const hashParams = [
    `${HASH_PARAM_GROUP}=${encodeURIComponent(groupId)}`,
    `${HASH_PARAM_KEY}=${encodeURIComponent(keyBase64)}`,
    `${HASH_PARAM_BOOTSTRAP}=${encodeURIComponent(bootstrapUrl.trim())}`,
  ].join("&");
  const url = `${base}/join#${hashParams}`;
  return { url, groupId, keyBytes, keyBase64 };
}
