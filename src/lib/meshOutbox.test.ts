import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";

import {
  encodeMeshEscrowMessage,
  enqueueMeshEscrowPacket,
  flushMeshOutbox,
  listPendingMeshEscrowItems,
  tryParseMeshEscrowMessage,
  type MeshEscrowPacket,
} from "./meshOutbox";

describe("meshOutbox", () => {
  it("parses, deduplicates, persists to IndexedDB and flushes pending packets", async () => {
    const packet: MeshEscrowPacket = {
      kind: "confirm-delivery",
      chainId: 8453,
      escrow: "0x1111111111111111111111111111111111111111",
      orderId: "99",
      code: "042042",
      salt: "0x01020304",
    };

    const wire = encodeMeshEscrowMessage(packet);
    const parsed = tryParseMeshEscrowMessage(wire);
    expect(parsed).toEqual(packet);
    expect(tryParseMeshEscrowMessage("oi tudo bem")).toBeNull();

    const first = await enqueueMeshEscrowPacket(packet);
    const dup = await enqueueMeshEscrowPacket(packet);
    expect(dup.dedupKey).toBe(first.dedupKey);

    const pendingBefore = await listPendingMeshEscrowItems();
    expect(pendingBefore.some((i) => i.dedupKey === first.dedupKey)).toBe(true);

    const result = await flushMeshOutbox(async () => ({ txHash: "0xabc123" }));
    expect(result.submitted).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const pendingAfter = await listPendingMeshEscrowItems();
    expect(pendingAfter.some((i) => i.dedupKey === first.dedupKey)).toBe(false);
  });
});
