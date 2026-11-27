import { Capacitor } from "@capacitor/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
import { SecureStoragePlugin } from "capacitor-secure-storage-plugin";
import { nip19 } from "nostr-tools";

import { desktopDecryptSecret, desktopEncryptSecret, isDesktop } from "@/lib/desktop";
import { addressFromPrivateKey, signDigestEth, type Hex } from "@/lib/escrowClient";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const HKDF_SALT = ENCODER.encode("armada-evm-wallet/v1");
const PBKDF2_ITERATIONS = 150_000;

interface EncryptedWalletEnvelope {
  v: 1;
  mode: "pin-aes-gcm" | "nsec-derived";
  address: Hex;
  salt: string;
  iv: string;
  ciphertext: string;
  createdAt: number;
}

const walletStorageKey = (nostrPubkey: string) => `armada:evm-wallet:v1:${nostrPubkey}`;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveAesKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ENCODER.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptSecretWithPin(secretBytes: Uint8Array, pin: string): Promise<{
  salt: string;
  iv: string;
  ciphertext: string;
}> {
  if (pin.trim().length < 4) {
    throw new Error("Defina um PIN de pelo menos 4 caracteres para proteger a carteira.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(pin, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    secretBytes.buffer.slice(secretBytes.byteOffset, secretBytes.byteOffset + secretBytes.byteLength) as ArrayBuffer,
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(encrypted)),
  };
}

async function decryptSecretWithPin(
  envelope: Pick<EncryptedWalletEnvelope, "salt" | "iv" | "ciphertext">,
  pin: string,
): Promise<Uint8Array> {
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const aesKey = await deriveAesKey(pin, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
      },
      aesKey,
      ciphertext.buffer.slice(
        ciphertext.byteOffset,
        ciphertext.byteOffset + ciphertext.byteLength,
      ) as ArrayBuffer,
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error("PIN incorreto ou backup corrompido.");
  }
}

async function writeRawEnvelope(key: string, json: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await SecureStoragePlugin.set({ key, value: json });
    return;
  }
  if (isDesktop()) {
    const sealed = await desktopEncryptSecret(json);
    if (sealed) {
      localStorage.setItem(key, JSON.stringify({ v: 1, enc: "safeStorage", data: sealed }));
      return;
    }
  }
  localStorage.setItem(key, json);
}

async function readRawEnvelope(key: string): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await SecureStoragePlugin.get({ key });
      return value;
    } catch {
      return null;
    }
  }
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  if (isDesktop()) {
    try {
      const parsed = JSON.parse(raw) as { enc?: string; data?: string };
      if (parsed?.enc === "safeStorage" && typeof parsed.data === "string") {
        return await desktopDecryptSecret(parsed.data);
      }
    } catch {
      return null;
    }
  }
  return raw;
}

export async function removeEvmWallet(nostrPubkey: string): Promise<void> {
  const key = walletStorageKey(nostrPubkey);
  if (Capacitor.isNativePlatform()) {
    try {
      await SecureStoragePlugin.remove({ key });
    } catch {
      // ignora se ausente
    }
    return;
  }
  localStorage.removeItem(key);
}

export interface EvmWalletSummary {
  address: Hex;
  mode: "pin-aes-gcm" | "nsec-derived";
  createdAt: number;
}

export async function getStoredWalletSummary(nostrPubkey: string): Promise<EvmWalletSummary | null> {
  const raw = await readRawEnvelope(walletStorageKey(nostrPubkey));
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as EncryptedWalletEnvelope;
    if (!env?.address || !env?.ciphertext) return null;
    return {
      address: env.address,
      mode: env.mode ?? "pin-aes-gcm",
      createdAt: env.createdAt,
    };
  } catch {
    return null;
  }
}

/**
 * Deriva uma chave privada EVM determinística a partir do `nsec` do usuário via HKDF-SHA256.
 * Quem faz backup do `nsec` do Armada recupera automaticamente a mesma carteira EVM em qualquer dispositivo!
 */
export function deriveEvmSecretFromNsec(nsecOrSecret: string | Uint8Array): Uint8Array {
  let root: Uint8Array;
  if (typeof nsecOrSecret === "string") {
    const trimmed = nsecOrSecret.trim();
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("A chave informada não é um nsec válido.");
    }
    root = decoded.data;
  } else {
    root = nsecOrSecret;
  }

  if (root.length !== 32) {
    throw new Error("Chave raiz Nostr inválida.");
  }

  for (let ctr = 0; ctr < 256; ctr++) {
    const info = ENCODER.encode(`evm-account/0:${ctr}`);
    const candidate = hkdf(sha256, root, HKDF_SALT, info, 32);
    if (secp256k1.utils.isValidSecretKey(candidate)) {
      return candidate;
    }
  }
  throw new Error("Falha ao derivar chave secp256k1 válida.");
}

export async function createDerivedEvmWalletFromNsec(
  nostrPubkey: string,
  nsecOrSecret: string | Uint8Array,
  pin: string,
): Promise<EvmWalletSummary> {
  const derived = deriveEvmSecretFromNsec(nsecOrSecret);
  try {
    return await importEncryptedEvmWallet(nostrPubkey, derived, pin, "nsec-derived");
  } finally {
    derived.fill(0);
  }
}

/**
 * Cria uma nova carteira EVM aleatória protegida com AES-GCM + PIN
 * (útil para contas NIP-07 / NIP-46 onde o app não tem acesso ao nsec).
 */
export async function createEncryptedEvmWallet(
  nostrPubkey: string,
  pin: string,
): Promise<EvmWalletSummary> {
  const privKey = secp256k1.utils.randomSecretKey();
  try {
    return await importEncryptedEvmWallet(nostrPubkey, privKey, pin, "pin-aes-gcm");
  } finally {
    privKey.fill(0);
  }
}

export async function importEncryptedEvmWallet(
  nostrPubkey: string,
  privateKey: Uint8Array | Hex,
  pin: string,
  mode: "pin-aes-gcm" | "nsec-derived" = "pin-aes-gcm",
): Promise<EvmWalletSummary> {
  const bytes =
    typeof privateKey === "string"
      ? hexToBytes(privateKey.startsWith("0x") ? privateKey.slice(2) : privateKey)
      : privateKey;

  if (bytes.length !== 32 || !secp256k1.utils.isValidSecretKey(bytes)) {
    throw new Error("Chave privada secp256k1 inválida");
  }

  const address = addressFromPrivateKey(bytes);
  const enc = await encryptSecretWithPin(bytes, pin);
  const envelope: EncryptedWalletEnvelope = {
    v: 1,
    mode,
    address,
    ...enc,
    createdAt: Date.now(),
  };

  await writeRawEnvelope(walletStorageKey(nostrPubkey), JSON.stringify(envelope));
  return { address, mode, createdAt: envelope.createdAt };
}

export async function unlockEvmPrivateKey(nostrPubkey: string, pin: string): Promise<Uint8Array> {
  const raw = await readRawEnvelope(walletStorageKey(nostrPubkey));
  if (!raw) throw new Error("Nenhuma carteira EVM encontrada para esta conta.");
  const env = JSON.parse(raw) as EncryptedWalletEnvelope;
  return decryptSecretWithPin(env, pin);
}

export async function signWithStoredWallet(
  nostrPubkey: string,
  pin: string,
  digest: Uint8Array,
): Promise<{ address: Hex; signature: Hex }> {
  const priv = await unlockEvmPrivateKey(nostrPubkey, pin);
  try {
    return {
      address: addressFromPrivateKey(priv),
      signature: signDigestEth(digest, priv),
    };
  } finally {
    priv.fill(0);
  }
}

/** Exporta backup portátil cifrado com a senha informada (nunca em texto puro). */
export async function exportEncryptedWalletBackup(
  nostrPubkey: string,
  unlockPin: string,
  backupPassword: string,
): Promise<string> {
  const priv = await unlockEvmPrivateKey(nostrPubkey, unlockPin);
  try {
    const summary = await getStoredWalletSummary(nostrPubkey);
    const payload = JSON.stringify({
      v: 1,
      nostrPubkey,
      mode: summary?.mode ?? "pin-aes-gcm",
      address: addressFromPrivateKey(priv),
      privateKeyHex: bytesToHex(priv),
    });
    const enc = await encryptSecretWithPin(ENCODER.encode(payload), backupPassword);
    return JSON.stringify({
      type: "armada-evm-backup",
      v: 1,
      ...enc,
    });
  } finally {
    priv.fill(0);
  }
}

export async function restoreFromEncryptedBackup(
  nostrPubkey: string,
  backupJson: string,
  backupPassword: string,
  newPin: string,
): Promise<EvmWalletSummary> {
  const parsed = JSON.parse(backupJson) as {
    type?: string;
    salt: string;
    iv: string;
    ciphertext: string;
  };
  if (parsed?.type !== "armada-evm-backup") {
    throw new Error("Arquivo de backup inválido");
  }
  const plainBytes = await decryptSecretWithPin(parsed, backupPassword);
  const decoded = JSON.parse(DECODER.decode(plainBytes)) as {
    privateKeyHex: string;
    mode?: "pin-aes-gcm" | "nsec-derived";
  };
  return importEncryptedEvmWallet(
    nostrPubkey,
    `0x${decoded.privateKeyHex}`,
    newPin,
    decoded.mode ?? "pin-aes-gcm",
  );
}
