const AES_GCM_IV_LENGTH = 12;

type EncryptRequest = { type: "encrypt"; keyBytes: number[]; plaintext: number[] };
type DecryptRequest = { type: "decrypt"; keyBytes: number[]; iv: number[]; ciphertext: number[] };
type SignRequest = { type: "sign"; privateKeyBytes: number[]; data: number[] };
type VerifyRequest = {
  type: "verify";
  publicKeyBytes: number[];
  data: number[];
  signature: number[];
};
type GenerateKeyPairRequest = { type: "generateKeyPair" };

type CryptoRequest =
  | EncryptRequest
  | DecryptRequest
  | SignRequest
  | VerifyRequest
  | GenerateKeyPairRequest;

function toUint8Array(arr: number[]): Uint8Array {
  const u = new Uint8Array(arr.length);
  for (let i = 0; i < arr.length; i++) u[i] = Number(arr[i]) & 0xff;
  return u;
}

function fromUint8Array(buf: Uint8Array): number[] {
  return Array.from(buf);
}

function toArrayBuffer(buf: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(buf.length);
  copy.set(buf);
  return copy.buffer.slice(0, copy.byteLength);
}

async function importAesKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(keyBytes: Uint8Array, plaintext: Uint8Array): Promise<{ iv: number[]; ciphertext: number[] }> {
  const key = await importAesKey(keyBytes);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    key,
    toArrayBuffer(plaintext)
  );
  return {
    iv: fromUint8Array(iv),
    ciphertext: fromUint8Array(new Uint8Array(ciphertext)),
  };
}

async function decrypt(
  keyBytes: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<number[]> {
  const key = await importAesKey(keyBytes);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv), tagLength: 128 },
    key,
    toArrayBuffer(ciphertext)
  );
  return fromUint8Array(new Uint8Array(plaintext));
}

async function generateKeyPair(): Promise<{ publicKey: number[]; privateKey: number[] }> {
  const pair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );
  const keyPair = pair as CryptoKeyPair;
  const [pubRaw, privRaw] = await Promise.all([
    crypto.subtle.exportKey("raw", keyPair.publicKey),
    crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
  ]);
  return {
    publicKey: fromUint8Array(new Uint8Array(pubRaw)),
    privateKey: fromUint8Array(new Uint8Array(privRaw)),
  };
}

async function sign(privateKeyBytes: Uint8Array, data: Uint8Array): Promise<number[]> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(privateKeyBytes),
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("Ed25519", key, toArrayBuffer(data));
  return fromUint8Array(new Uint8Array(sig));
}

async function verify(
  publicKeyBytes: Uint8Array,
  data: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(publicKeyBytes),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "Ed25519",
    key,
    toArrayBuffer(signature),
    toArrayBuffer(data)
  );
}

self.onmessage = async (e: MessageEvent<CryptoRequest>) => {
  const msg = e.data;
  try {
    if (msg.type === "encrypt") {
      const result = await encrypt(toUint8Array(msg.keyBytes), toUint8Array(msg.plaintext));
      self.postMessage({ type: "encryptResult", ...result });
    } else if (msg.type === "decrypt") {
      const result = await decrypt(
        toUint8Array(msg.keyBytes),
        toUint8Array(msg.iv),
        toUint8Array(msg.ciphertext)
      );
      self.postMessage({ type: "decryptResult", plaintext: result });
    } else if (msg.type === "sign") {
      const result = await sign(toUint8Array(msg.privateKeyBytes), toUint8Array(msg.data));
      self.postMessage({ type: "signResult", signature: result });
    } else if (msg.type === "verify") {
      const result = await verify(
        toUint8Array(msg.publicKeyBytes),
        toUint8Array(msg.data),
        toUint8Array(msg.signature)
      );
      self.postMessage({ type: "verifyResult", ok: result });
    } else if (msg.type === "generateKeyPair") {
      const result = await generateKeyPair();
      self.postMessage({ type: "generateKeyPairResult", ...result });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
