import { HASH_PARAM_GROUP, HASH_PARAM_KEY, HASH_PARAM_BOOTSTRAP } from "./constants";

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  const stripped = hash.replace(/^#/, "");
  for (const part of stripped.split("&")) {
    const [key, value] = part.split("=");
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
  }
  return params;
}

export interface ParsedGroupLink {
  groupId: string;
  keyBase64: string;
  keyBytes: Uint8Array;
  /** Bootstrap server URL, if present in the link */
  bootstrapUrl?: string;
}

export function parseGroupLink(urlOrHash: string): ParsedGroupLink | null {
  const hash = urlOrHash.includes("#") ? urlOrHash.slice(urlOrHash.indexOf("#")) : urlOrHash;
  const params = parseHashParams(hash);
  const groupId = params[HASH_PARAM_GROUP];
  const keyBase64 = params[HASH_PARAM_KEY];
  const bootstrapUrl = params[HASH_PARAM_BOOTSTRAP];
  if (!groupId || !keyBase64) return null;
  try {
    const binary = atob(keyBase64.replace(/-/g, "+").replace(/_/g, "/"));
    const keyBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) keyBytes[i] = binary.charCodeAt(i);
    return { groupId, keyBase64, keyBytes, bootstrapUrl: bootstrapUrl || undefined };
  } catch {
    return null;
  }
}

export function getHashFromWindow(): string {
  return typeof window !== "undefined" ? window.location.hash : "";
}
