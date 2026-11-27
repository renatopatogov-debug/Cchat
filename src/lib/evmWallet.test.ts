// @vitest-environment jsdom
import { keccak_256 } from "@noble/hashes/sha3.js";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { beforeEach, describe, expect, it } from "vitest";

import { recoverAddressFromEthSig } from "./escrowClient";
import {
  createDerivedEvmWalletFromNsec,
  createEncryptedEvmWallet,
  exportEncryptedWalletBackup,
  getStoredWalletSummary,
  removeEvmWallet,
  restoreFromEncryptedBackup,
  signWithStoredWallet,
  unlockEvmPrivateKey,
} from "./evmWallet";

const TEST_PUBKEY = "a".repeat(64);

describe("evmWallet (AES-GCM & HKDF nsec derivation)", () => {
  beforeEach(async () => {
    localStorage.clear();
    await removeEvmWallet(TEST_PUBKEY);
  });

  it("derives the exact same EVM wallet address from the same nsec across devices", async () => {
    const nostrSk = generateSecretKey();
    const pubkey = getPublicKey(nostrSk);
    const nsec = nip19.nsecEncode(nostrSk);

    const w1 = await createDerivedEvmWalletFromNsec(pubkey, nsec, "1234");
    await removeEvmWallet(pubkey);
    const w2 = await createDerivedEvmWalletFromNsec(pubkey, nsec, "9876");

    expect(w1.address).toBe(w2.address);
    expect(w1.mode).toBe("nsec-derived");
  });

  it("creates encrypted wallet, rejects wrong PIN, signs and restores backup", async () => {
    const created = await createEncryptedEvmWallet(TEST_PUBKEY, "1234");
    expect(created.address).toMatch(/^0x[0-9a-fA-F]{40}$/);

    const summary = await getStoredWalletSummary(TEST_PUBKEY);
    expect(summary?.address).toBe(created.address);

    const rawStored = localStorage.getItem(`armada:evm-wallet:v1:${TEST_PUBKEY}`) ?? "";
    expect(rawStored).toContain("pin-aes-gcm");
    expect(rawStored).not.toContain("privateKey");

    await expect(unlockEvmPrivateKey(TEST_PUBKEY, "9999")).rejects.toThrow();

    const digest = keccak_256(new TextEncoder().encode("test-digest"));
    const signed = await signWithStoredWallet(TEST_PUBKEY, "1234", digest);
    expect(recoverAddressFromEthSig(digest, signed.signature)).toBe(created.address);

    const backup = await exportEncryptedWalletBackup(TEST_PUBKEY, "1234", "senha-forte");
    await removeEvmWallet(TEST_PUBKEY);
    expect(await getStoredWalletSummary(TEST_PUBKEY)).toBeNull();

    const restored = await restoreFromEncryptedBackup(
      TEST_PUBKEY,
      backup,
      "senha-forte",
      "5678",
    );
    expect(restored.address).toBe(created.address);
  });
});
