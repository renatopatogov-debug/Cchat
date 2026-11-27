import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type { Hex } from "@/lib/escrowClient";

export type MeshEscrowPacket =
  | {
      kind: "confirm-delivery";
      chainId: number;
      escrow: Hex;
      orderId: string;
      code: string;
      salt: Hex;
    }
  | {
      kind: "extend-deadline";
      chainId: number;
      escrow: Hex;
      orderId: string;
      newDeadline: number;
      sigExpiry: number;
      buyerSignature: Hex;
    };

export interface QueuedMeshEscrowItem {
  /** Chave determinística de deduplicação para evitar duplicatas no flood da Mesh. */
  dedupKey: string;
  packet: MeshEscrowPacket;
  receivedAt: number;
  attempts: number;
  lastError: string | null;
  status: "pending" | "submitted" | "failed";
  txHash: string | null;
}

interface MeshOutboxSchema extends DBSchema {
  outbox: {
    key: string;
    value: QueuedMeshEscrowItem;
    indexes: { "by-status": string };
  };
}

export const MESH_OUTBOX_DB_NAME = "armada-escrow-mesh-outbox";
const DB_VERSION = 1;
const STORE_NAME = "outbox";
export const MESH_ESCROW_PREFIX = "ARMADA_ESCROW_V1:";

let dbPromise: Promise<IDBPDatabase<MeshOutboxSchema>> | null = null;
let activeSubmitter: ((packet: MeshEscrowPacket) => Promise<{ txHash: string }>) | null = null;
let onlineListenerBound = false;

function getDb(): Promise<IDBPDatabase<MeshOutboxSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<MeshOutboxSchema>(MESH_OUTBOX_DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "dedupKey" });
        store.createIndex("by-status", "status");
      },
    });
  }
  return dbPromise;
}

export async function closeMeshOutboxDb(): Promise<void> {
  if (!dbPromise) return;
  const p = dbPromise;
  dbPromise = null;
  try {
    const db = await p;
    db.close();
  } catch {
    // best-effort
  }
}

export function packetDedupKey(packet: MeshEscrowPacket): string {
  const base = `${packet.kind}:${packet.chainId}:${packet.escrow.toLowerCase()}:${packet.orderId}`;
  return packet.kind === "extend-deadline" ? `${base}:${packet.newDeadline}` : base;
}

export function encodeMeshEscrowMessage(packet: MeshEscrowPacket): string {
  return `${MESH_ESCROW_PREFIX}${JSON.stringify(packet)}`;
}

export function tryParseMeshEscrowMessage(content: string): MeshEscrowPacket | null {
  if (!content.startsWith(MESH_ESCROW_PREFIX)) return null;
  try {
    const parsed = JSON.parse(content.slice(MESH_ESCROW_PREFIX.length)) as Partial<MeshEscrowPacket>;
    if (
      parsed?.kind === "confirm-delivery" &&
      typeof parsed.chainId === "number" &&
      typeof parsed.escrow === "string" &&
      typeof parsed.orderId === "string" &&
      typeof parsed.code === "string" &&
      /^\d{6}$/.test(parsed.code) &&
      typeof parsed.salt === "string"
    ) {
      return parsed as MeshEscrowPacket;
    }
    if (
      parsed?.kind === "extend-deadline" &&
      typeof parsed.chainId === "number" &&
      typeof parsed.escrow === "string" &&
      typeof parsed.orderId === "string" &&
      typeof parsed.newDeadline === "number" &&
      typeof parsed.sigExpiry === "number" &&
      typeof parsed.buyerSignature === "string"
    ) {
      return parsed as MeshEscrowPacket;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Grava em IndexedDB assim que o pacote chega pela Bluetooth Mesh.
 * Se já houver internet e um submitter registrado, tenta liquidar imediatamente.
 */
export async function enqueueMeshEscrowPacket(packet: MeshEscrowPacket): Promise<QueuedMeshEscrowItem> {
  const db = await getDb();
  const dedupKey = packetDedupKey(packet);
  const existing = await db.get(STORE_NAME, dedupKey);
  if (existing) return existing;

  const item: QueuedMeshEscrowItem = {
    dedupKey,
    packet,
    receivedAt: Date.now(),
    attempts: 0,
    lastError: null,
    status: "pending",
    txHash: null,
  };
  await db.put(STORE_NAME, item);

  if (activeSubmitter && typeof navigator !== "undefined" && navigator.onLine) {
    void flushMeshOutbox(activeSubmitter).catch(() => undefined);
  }

  return item;
}

export async function listPendingMeshEscrowItems(): Promise<QueuedMeshEscrowItem[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, "by-status", "pending");
}

export async function listAllMeshEscrowItems(): Promise<QueuedMeshEscrowItem[]> {
  const db = await getDb();
  return db.getAll(STORE_NAME);
}

export async function markMeshItemSubmitted(dedupKey: string, txHash: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, dedupKey);
  if (!existing) return;
  await db.put(STORE_NAME, {
    ...existing,
    status: "submitted",
    txHash,
    lastError: null,
  });
}

export async function markMeshItemAttemptFailed(dedupKey: string, reason: string): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, dedupKey);
  if (!existing) return;
  await db.put(STORE_NAME, {
    ...existing,
    attempts: existing.attempts + 1,
    lastError: reason,
  });
}

export async function flushMeshOutbox(
  submitter: (packet: MeshEscrowPacket) => Promise<{ txHash: string }>,
): Promise<{ submitted: number; failed: number }> {
  const pending = await listPendingMeshEscrowItems();
  let submitted = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      const { txHash } = await submitter(item.packet);
      await markMeshItemSubmitted(item.dedupKey, txHash);
      submitted++;
    } catch (err) {
      await markMeshItemAttemptFailed(
        item.dedupKey,
        err instanceof Error ? err.message : String(err),
      );
      failed++;
    }
  }

  return { submitted, failed };
}

/**
 * Registra o enviador de transações (Paymaster/Relayer) e conecta o listener `online`
 * para esvaziar automaticamente a fila assim que o celular recuperar 4G/Wi-Fi.
 */
export function registerMeshOutboxAutoSync(
  submitter: (packet: MeshEscrowPacket) => Promise<{ txHash: string }>,
): () => void {
  activeSubmitter = submitter;

  const onOnline = () => {
    if (activeSubmitter) {
      void flushMeshOutbox(activeSubmitter).catch(() => undefined);
    }
  };

  if (typeof window !== "undefined" && !onlineListenerBound) {
    window.addEventListener("online", onOnline);
    onlineListenerBound = true;
  }

  if (typeof navigator !== "undefined" && navigator.onLine) {
    void flushMeshOutbox(submitter).catch(() => undefined);
  }

  return () => {
    if (activeSubmitter === submitter) {
      activeSubmitter = null;
    }
    if (typeof window !== "undefined" && onlineListenerBound) {
      window.removeEventListener("online", onOnline);
      onlineListenerBound = false;
    }
  };
}
