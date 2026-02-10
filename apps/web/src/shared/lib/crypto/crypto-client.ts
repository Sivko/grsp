export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

type WorkerRequest =
  | { type: "encrypt"; keyBytes: number[]; plaintext: number[] }
  | { type: "decrypt"; keyBytes: number[]; iv: number[]; ciphertext: number[] }
  | { type: "sign"; privateKeyBytes: number[]; data: number[] }
  | { type: "verify"; publicKeyBytes: number[]; data: number[]; signature: number[] }
  | { type: "generateKeyPair" };

let workerInstance: Worker | null = null;

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new Worker(new URL("./crypto-worker.ts", import.meta.url), { type: "module" });
  }
  return workerInstance;
}

function post<T>(req: WorkerRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const handler = (e: MessageEvent) => {
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errHandler);
      const data = e.data as { type: string } & Record<string, unknown>;
      if (data.type === "error") reject(new Error(String(data.message)));
      else resolve(data as T);
    };
    const errHandler = () => {
      w.removeEventListener("message", handler);
      w.removeEventListener("error", errHandler);
      reject(new Error("Worker error"));
    };
    w.addEventListener("message", handler);
    w.addEventListener("error", errHandler);
    w.postMessage(req);
  });
}

export async function generateKeyPair(): Promise<KeyPair> {
  const res = await post<{ type: string; publicKey: number[]; privateKey: number[] }>({
    type: "generateKeyPair",
  });
  return {
    publicKey: new Uint8Array(res.publicKey),
    privateKey: new Uint8Array(res.privateKey),
  };
}

export async function encrypt(keyBytes: Uint8Array, plaintext: Uint8Array): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const res = await post<{ iv: number[]; ciphertext: number[] }>({
    type: "encrypt",
    keyBytes: Array.from(keyBytes),
    plaintext: Array.from(plaintext),
  });
  return { iv: new Uint8Array(res.iv), ciphertext: new Uint8Array(res.ciphertext) };
}

export async function decrypt(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  const res = await post<{ plaintext: number[] }>({
    type: "decrypt",
    keyBytes: Array.from(keyBytes),
    iv: Array.from(iv),
    ciphertext: Array.from(ciphertext),
  });
  return new Uint8Array(res.plaintext);
}

export async function sign(privateKeyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const res = await post<{ signature: number[] }>({
    type: "sign",
    privateKeyBytes: Array.from(privateKeyBytes),
    data: Array.from(data),
  });
  return new Uint8Array(res.signature);
}

export async function verify(
  publicKeyBytes: Uint8Array,
  data: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  const res = await post<{ ok: boolean }>({
    type: "verify",
    publicKeyBytes: Array.from(publicKeyBytes),
    data: Array.from(data),
    signature: Array.from(signature),
  });
  return res.ok;
}

const PACK_IV_LEN = 12;
const PACK_SIG_LEN = 64;
const PACK_PUBKEY_LEN = 32;

export interface PackedMessage {
  iv: Uint8Array;
  ciphertext: Uint8Array;
  signature: Uint8Array;
  publicKey: Uint8Array;
}

export function packedMessageToBytes(p: PackedMessage): Uint8Array {
  const total = PACK_IV_LEN + p.ciphertext.length + PACK_SIG_LEN + PACK_PUBKEY_LEN;
  const out = new Uint8Array(4 + total);
  const view = new DataView(out.buffer);
  view.setUint32(0, total, true);
  let off = 4;
  out.set(p.iv, off); off += PACK_IV_LEN;
  out.set(p.ciphertext, off); off += p.ciphertext.length;
  out.set(p.signature, off); off += PACK_SIG_LEN;
  out.set(p.publicKey, off);
  return out;
}

export function bytesToPackedMessage(buf: Uint8Array): PackedMessage | null {
  if (buf.length < 4 + PACK_IV_LEN + PACK_SIG_LEN + PACK_PUBKEY_LEN) return null;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const total = view.getUint32(0, true);
  if (buf.length < 4 + total) return null;
  let off = 4;
  const iv = buf.slice(off, off + PACK_IV_LEN); off += PACK_IV_LEN;
  const cipherLen = total - PACK_IV_LEN - PACK_SIG_LEN - PACK_PUBKEY_LEN;
  const ciphertext = buf.slice(off, off + cipherLen); off += cipherLen;
  const signature = buf.slice(off, off + PACK_SIG_LEN); off += PACK_SIG_LEN;
  const publicKey = buf.slice(off, off + PACK_PUBKEY_LEN);
  return { iv, ciphertext, signature, publicKey };
}

export async function packMessage(
  groupKey: Uint8Array,
  senderKeyPair: KeyPair,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const { iv, ciphertext } = await encrypt(groupKey, plaintext);
  const toSign = new Uint8Array(iv.length + ciphertext.length);
  toSign.set(iv);
  toSign.set(ciphertext);
  const signature = await sign(senderKeyPair.privateKey, toSign);
  return packedMessageToBytes({ iv, ciphertext, signature, publicKey: senderKeyPair.publicKey });
}

export async function unpackMessage(
  groupKey: Uint8Array,
  packed: Uint8Array
): Promise<{ plaintext: Uint8Array; publicKey: Uint8Array; signatureValid: boolean } | null> {
  const p = bytesToPackedMessage(packed);
  if (!p) return null;
  const toVerify = new Uint8Array(p.iv.length + p.ciphertext.length);
  toVerify.set(p.iv);
  toVerify.set(p.ciphertext);
  const signatureValid = await verify(p.publicKey, toVerify, p.signature);
  const plaintext = await decrypt(groupKey, p.iv, p.ciphertext);
  return { plaintext, publicKey: p.publicKey, signatureValid };
}