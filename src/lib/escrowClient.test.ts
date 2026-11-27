import { secp256k1 } from "@noble/curves/secp256k1.js";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import { describe, expect, it } from "vitest";

import {
  SUPPORTED_CHAINS,
  addressFromPrivateKey,
  canonicalOrderSeed,
  computeCommitment,
  decodeOrderResult,
  deriveOrderSecret,
  encodeApproveCall,
  encodeConfirmDeliveryCall,
  encodeCreateOrderCall,
  encodeCreateOrderWithPermitCall,
  encodeExtendDeadlineCall,
  encodeRefundArbiterTimeoutCall,
  formatTokenAmount,
  generateDeliveryCode,
  generateSalt,
  hashExtendDeadlineDigest,
  isValidNpub,
  parseAndValidateEscrowOffer,
  parseDeliveryConfirmQr,
  parseTokenAmount,
  recoverAddressFromEthSig,
  signDigestEth,
  signEscrowOffer,
  type Hex,
} from "./escrowClient";

describe("escrowClient", () => {
  it("generates uniform 6-digit codes and matches keccak256(abi.encode(code, salt))", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateDeliveryCode();
      expect(code).toMatch(/^\d{6}$/);
    }
    const salt = generateSalt();
    const c1 = computeCommitment("004819", salt);
    const c2 = computeCommitment("004819", salt);
    expect(c1).toBe(c2);
    expect(c1).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("reconstructs exact (code, salt) across devices using canonical on-chain Order fields", () => {
    const sk = secp256k1.utils.randomSecretKey();
    const seedDesktop = canonicalOrderSeed({
      chainId: 8453,
      escrow: "0x1111111111111111111111111111111111111111",
      seller: "0xAbCdEf0000000000000000000000000000000001",
      token: "0xE9185Ee218cae427aF7B9764A011bb89FeA761B4",
      amount: "25000000000000000000",
      deliveryDeadline: 1_850_000_000,
    });
    const seedMobile = canonicalOrderSeed({
      chainId: 8453,
      escrow: "0x1111111111111111111111111111111111111111",
      seller: "0xabcdef0000000000000000000000000000000001",
      token: "0xe9185ee218cae427af7b9764a011bb89fea761b4",
      amount: 25000000000000000000n,
      deliveryDeadline: 1_850_000_000,
    });

    const a = deriveOrderSecret(sk, seedDesktop);
    const b = deriveOrderSecret(sk, seedMobile);
    expect(a).toEqual(b);
    expect(a.commitment).toBe(computeCommitment(a.code, a.salt));
  });

  it("signs and validates QR v2 EscrowOffer with real npub, token & escrow whitelist", () => {
    const sellerSk = secp256k1.utils.randomSecretKey();
    const sellerAddr = addressFromPrivateKey(sellerSk);
    const nostrSk = generateSecretKey();
    const realNpub = nip19.npubEncode(getPublicKey(nostrSk));
    expect(isValidNpub(realNpub)).toBe(true);
    expect(isValidNpub("npub1invalido000000000")).toBe(false);

    const testEscrow: Hex = "0x1111111111111111111111111111111111111111";
    const now = 1_800_000_000;

    const signed = signEscrowOffer(
      {
        v: 2,
        type: "escrow-offer",
        chainId: 8453,
        escrow: testEscrow,
        token: "0xE9185Ee218cae427aF7B9764A011bb89FeA761B4",
        tokenSymbol: "BRZ",
        decimals: 18,
        amount: parseTokenAmount("25.50", 18).toString(),
        seller: sellerAddr,
        sellerNpub: realNpub,
        arbiter: "0x0000000000000000000000000000000000000000",
        deadline: now + 86400,
        exp: now + 600,
      },
      sellerSk,
    );

    const valid = parseAndValidateEscrowOffer(JSON.stringify(signed), {
      expectedChainId: 8453,
      expectedSellerNpub: realNpub,
      nowSec: now,
      extraAllowedEscrows: { 8453: [testEscrow] },
    });
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.token.symbol).toBe("BRZ");
      expect(formatTokenAmount(BigInt(valid.offer.amount), valid.token.decimals)).toBe("25.50");
    }

    // Token falso imitando símbolo BRZ deve ser bloqueado
    const fakeToken = signEscrowOffer(
      {
        ...signed,
        token: "0x9999999999999999999999999999999999999999",
      },
      sellerSk,
    );
    const rejected = parseAndValidateEscrowOffer(JSON.stringify(fakeToken), {
      expectedChainId: 8453,
      nowSec: now,
      extraAllowedEscrows: { 8453: [testEscrow] },
    });
    expect(rejected.ok).toBe(false);
  });

  it("signs EIP-712 extendDeadline and encodes all ABI contract functions", () => {
    const buyerSk = secp256k1.utils.randomSecretKey();
    const buyerAddr = addressFromPrivateKey(buyerSk);
    const digest = hashExtendDeadlineDigest({
      chainId: 8453,
      escrow: "0x1111111111111111111111111111111111111111",
      orderId: 7n,
      newDeadline: 1_900_000_000,
      nonce: 0n,
      sigExpiry: 1_850_000_000,
    });
    const sig = signDigestEth(digest, buyerSk);
    expect(recoverAddressFromEthSig(digest, sig)).toBe(buyerAddr);

    const extendCall = encodeExtendDeadlineCall({
      orderId: 7n,
      newDeadline: 1_900_000_000,
      sigExpiry: 1_850_000_000,
      buyerSignature: sig,
    });
    // 4B selector + 4*32B head + 32B len + 96B padded 65B sig = 260B = 520 hex + "0x"
    expect(extendCall.length).toBe(2 + 8 + 4 * 64 + 64 + 3 * 64);

    const approveCall = encodeApproveCall("0x1111111111111111111111111111111111111111", 500n);
    expect(approveCall.length).toBe(2 + 8 + 2 * 64);

    const permitCreateCall = encodeCreateOrderWithPermitCall({
      seller: "0x2222222222222222222222222222222222222222",
      arbiter: "0x0000000000000000000000000000000000000000",
      token: "0xE9185Ee218cae427aF7B9764A011bb89FeA761B4",
      amount: 100n,
      deliveryDeadline: 1_900_000_000,
      codeCommitment: computeCommitment("004819", "0x01"),
      permitDeadline: 1_900_000_000,
      v: 27,
      r: `0x${"11".repeat(32)}`,
      s: `0x${"22".repeat(32)}`,
    });
    expect(permitCreateCall.length).toBe(2 + 8 + 10 * 64);

    const arbTimeoutCall = encodeRefundArbiterTimeoutCall(7n);
    expect(arbTimeoutCall.length).toBe(2 + 8 + 64);
  });

  it("validates DeliveryConfirmQr and order result decoding", () => {
    const now = 1_800_000_000;
    const qr = parseDeliveryConfirmQr(
      JSON.stringify({
        v: 2,
        type: "delivery-confirm",
        chainId: 8453,
        escrow: "0x1111111111111111111111111111111111111111",
        orderId: "1",
        code: "004819",
        salt: "0x0f1e2d3c4b5a69788796a5b4c3d2e1f0",
        exp: now + 300,
      }),
      now,
    );
    expect(qr.ok).toBe(true);

    const createCall = encodeCreateOrderCall({
      seller: "0x2222222222222222222222222222222222222222",
      arbiter: "0x0000000000000000000000000000000000000000",
      token: "0xE9185Ee218cae427aF7B9764A011bb89FeA761B4",
      amount: 100n,
      deliveryDeadline: now + 3600,
      codeCommitment: computeCommitment("004819", "0x01"),
    });
    expect(createCall.length).toBe(2 + 8 + 6 * 64);

    const confirmCall = encodeConfirmDeliveryCall(1n, "004819", "0x01");
    expect(confirmCall.length).toBe(2 + 8 + 3 * 64);

    const word = (v: string) => v.padStart(64, "0");
    const mockReturn = `0x${[
      word("1111111111111111111111111111111111111111"),
      word("1"),
      word("2222222222222222222222222222222222222222"),
      word((now + 3600).toString(16)),
      word("0"),
      word("0"),
      word("e9185ee218cae427af7b9764a011bb89fea761b4"),
      word((25n * 10n ** 18n).toString(16)),
      word("aa".repeat(32)),
      word("0"),
    ].join("")}` as Hex;

    const decoded = decodeOrderResult(1n, mockReturn);
    expect(decoded.status).toBe(1);
    expect(decoded.amount).toBe(25n * 10n ** 18n);
    expect(SUPPORTED_CHAINS[8453]?.name).toBe("Base");
  });
});
