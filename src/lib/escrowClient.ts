import { schnorr, secp256k1 } from "@noble/curves/secp256k1.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";
import { nip19 } from "nostr-tools";
import { z } from "zod";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

export type Hex = `0x${string}`;

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrls: string[];
  explorerUrl: string;
  escrowAddress: Hex;
}

export interface TokenConfig {
  chainId: number;
  address: Hex;
  symbol: string;
  name: string;
  decimals: number;
  supportsPermit: boolean;
}

/** Endereços oficiais na rede Base e rede de testes Base Sepolia. */
export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  8453: {
    chainId: 8453,
    name: "Base",
    rpcUrls: ["https://mainnet.base.org"],
    explorerUrl: "https://basescan.org",
    // Preencher após deploy auditado na Mainnet (Gate Fase 5)
    escrowAddress: "0x0000000000000000000000000000000000000000",
  },
  84532: {
    chainId: 84532,
    name: "Base Sepolia (Testnet)",
    rpcUrls: ["https://sepolia.base.org"],
    explorerUrl: "https://sepolia.basescan.org",
    // Configurável em tempo real pela WalletPage após deploy no Remix
    escrowAddress: "0x0000000000000000000000000000000000000000",
  },
};

export const TOKEN_WHITELIST: TokenConfig[] = [
  {
    chainId: 8453,
    address: "0xE9185Ee218cae427aF7B9764A011bb89FeA761B4",
    symbol: "BRZ",
    name: "Brazilian Digital Token",
    decimals: 18,
    supportsPermit: true,
  },
  {
    chainId: 8453,
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    supportsPermit: true,
  },
];

const TESTNET_OVERRIDE_KEY = "armada:testnet-escrow:84532";

export interface TestnetEscrowOverride {
  escrowAddress: Hex;
  mockTokenAddress: Hex;
  mockTokenDecimals: number;
}

export function getTestnetOverride(): TestnetEscrowOverride | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(TESTNET_OVERRIDE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TestnetEscrowOverride>;
    if (
      typeof parsed.escrowAddress === "string" &&
      isValidAddress(parsed.escrowAddress) &&
      typeof parsed.mockTokenAddress === "string" &&
      isValidAddress(parsed.mockTokenAddress)
    ) {
      return {
        escrowAddress: normalizeAddress(parsed.escrowAddress),
        mockTokenAddress: normalizeAddress(parsed.mockTokenAddress),
        mockTokenDecimals: typeof parsed.mockTokenDecimals === "number" ? parsed.mockTokenDecimals : 18,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function saveTestnetOverride(override: TestnetEscrowOverride): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(
    TESTNET_OVERRIDE_KEY,
    JSON.stringify({
      escrowAddress: normalizeAddress(override.escrowAddress),
      mockTokenAddress: normalizeAddress(override.mockTokenAddress),
      mockTokenDecimals: override.mockTokenDecimals,
    }),
  );
}

export function resolveActiveChainAndTokens(chainId: number): {
  chain: ChainConfig;
  tokens: TokenConfig[];
} {
  const baseChain = SUPPORTED_CHAINS[chainId] ?? SUPPORTED_CHAINS[8453];
  if (chainId === 84532) {
    const ov = getTestnetOverride();
    if (ov) {
      return {
        chain: { ...baseChain, escrowAddress: ov.escrowAddress },
        tokens: [
          {
            chainId: 84532,
            address: ov.mockTokenAddress,
            symbol: "mBRZ",
            name: "Mock Brazilian Digital",
            decimals: ov.mockTokenDecimals,
            supportsPermit: true,
          },
        ],
      };
    }
  }
  return {
    chain: baseChain,
    tokens: TOKEN_WHITELIST.filter((t) => t.chainId === chainId),
  };
}

export const ORDER_STATUS_LABELS = [
  "Inexistente",
  "Travado (Em entrega)",
  "Liberado",
  "Em disputa",
  "Reembolsado",
] as const;

export type EscrowOrderStatus = 0 | 1 | 2 | 3 | 4;

export interface OnchainOrder {
  orderId: bigint;
  buyer: Hex;
  seller: Hex;
  arbiter: Hex;
  token: Hex;
  amount: bigint;
  deliveryDeadline: number;
  disputedAt: number;
  codeCommitment: Hex;
  deadlineNonce: bigint;
  status: EscrowOrderStatus;
}

export const EscrowOfferQrSchema = z.object({
  v: z.literal(2),
  type: z.literal("escrow-offer"),
  chainId: z.number().int().positive(),
  escrow: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  token: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  tokenSymbol: z.string().min(1).max(16),
  decimals: z.number().int().min(0).max(36),
  amount: z.string().regex(/^\d+$/),
  seller: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  sellerNpub: z.string().min(10),
  arbiter: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  deadline: z.number().int().positive(),
  exp: z.number().int().positive(),
  sig: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

export type EscrowOfferQr = z.infer<typeof EscrowOfferQrSchema>;

export const DeliveryConfirmQrSchema = z.object({
  v: z.literal(2),
  type: z.literal("delivery-confirm"),
  chainId: z.number().int().positive(),
  escrow: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  orderId: z.string().regex(/^\d+$/),
  code: z.string().regex(/^\d{6}$/),
  salt: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
  exp: z.number().int().positive(),
});

export type DeliveryConfirmQr = z.infer<typeof DeliveryConfirmQrSchema>;

export function strip0x(hexStr: string): string {
  return hexStr.startsWith("0x") || hexStr.startsWith("0X") ? hexStr.slice(2) : hexStr;
}

export function ensureHex(bytes: Uint8Array): Hex {
  return `0x${bytesToHex(bytes)}`;
}

export function isValidAddress(addr: string): addr is Hex {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export function isValidNpub(npub: string): boolean {
  try {
    return nip19.decode(npub).type === "npub";
  } catch {
    return false;
  }
}

export function normalizeAddress(addr: string): Hex {
  if (!isValidAddress(addr)) {
    throw new Error(`Endereço EVM inválido: ${addr}`);
  }
  const clean = addr.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(ENCODER.encode(clean)));
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += parseInt(hash[i], 16) >= 8 ? clean[i].toUpperCase() : clean[i];
  }
  return out as Hex;
}

export function addressFromPrivateKey(privateKey: Uint8Array): Hex {
  const uncompressed = secp256k1.getPublicKey(privateKey, false);
  const hash = keccak_256(uncompressed.slice(1));
  return normalizeAddress(`0x${bytesToHex(hash.slice(12))}`);
}

export function encodeUint256(value: bigint | number): Uint8Array {
  const v = typeof value === "number" ? BigInt(value) : value;
  if (v < 0n || v >= 1n << 256n) throw new Error("uint256 fora do intervalo");
  return hexToBytes(v.toString(16).padStart(64, "0"));
}

export function encodeAddress(addr: string): Uint8Array {
  if (!isValidAddress(addr)) throw new Error(`Endereço inválido: ${addr}`);
  return hexToBytes(strip0x(addr).toLowerCase().padStart(64, "0"));
}

export function encodeBytes32(value: Hex): Uint8Array {
  const clean = strip0x(value);
  if (!/^[0-9a-fA-F]{1,64}$/.test(clean)) throw new Error("bytes32 inválido");
  return hexToBytes(clean.padStart(64, "0"));
}

export function encodeBool(value: boolean): Uint8Array {
  return encodeUint256(value ? 1n : 0n);
}

export function encodeDynamicBytes(rawBytes: Uint8Array): Uint8Array {
  const lenWord = encodeUint256(rawBytes.length);
  const paddedLen = Math.ceil(rawBytes.length / 32) * 32;
  const padded = new Uint8Array(paddedLen);
  padded.set(rawBytes, 0);
  return concatBytes(lenWord, padded);
}

export function keccakUtf8(text: string): Hex {
  return ensureHex(keccak_256(ENCODER.encode(text)));
}

export function functionSelector(signature: string): Uint8Array {
  return keccak_256(ENCODER.encode(signature)).slice(0, 4);
}

/**
 * Gera código uniforme de 6 dígitos (000000..999999) via CSPRNG com máscara de 20 bits
 * e rejection sampling (< 1_000_000, ~95,37% de aceitação sem modulo bias).
 */
export function generateDeliveryCode(): string {
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const candidate = buf[0] & 0xfffff;
    if (candidate < 1_000_000) {
      return candidate.toString(10).padStart(6, "0");
    }
  }
}

export function generateSalt(): Hex {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return ensureHex(bytes);
}

/**
 * Constrói a semente canônica de um pedido usando APENAS campos persistidos on-chain na struct Order!
 * Assim qualquer dispositivo do comprador (PC ou celular) reconstrói (code, salt) lendo só orders(orderId).
 */
export function canonicalOrderSeed(params: {
  chainId: number;
  escrow: string;
  seller: string;
  token: string;
  amount: bigint | string;
  deliveryDeadline: number;
}): string {
  return [
    params.chainId,
    params.escrow.toLowerCase(),
    params.seller.toLowerCase(),
    params.token.toLowerCase(),
    BigInt(params.amount).toString(),
    params.deliveryDeadline,
  ].join(":");
}

/**
 * Deriva (code, salt) de forma determinística a partir de uma chave secreta da carteira
 * e da semente canônica on-chain do pedido, garantindo recuperação entre PC e celular.
 */
export function deriveOrderSecret(
  walletSecretKey: Uint8Array,
  orderSeed: string,
): { code: string; salt: Hex; commitment: Hex } {
  const saltBytes = hmac(sha256, walletSecretKey, ENCODER.encode(`armada:escrow:salt:${orderSeed}`)).slice(0, 16);
  const salt = ensureHex(saltBytes);

  let codeNum = 0;
  for (let attempt = 0; attempt < 64; attempt++) {
    const digest = hmac(
      sha256,
      walletSecretKey,
      ENCODER.encode(`armada:escrow:code:${orderSeed}:${attempt}`),
    );
    const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
    const candidate = view.getUint32(0, false) & 0xfffff;
    if (candidate < 1_000_000) {
      codeNum = candidate;
      break;
    }
  }

  const code = codeNum.toString(10).padStart(6, "0");
  const commitment = computeCommitment(code, salt);
  return { code, salt, commitment };
}

/** Espelha exatamente keccak256(abi.encode(uint256 code, uint256 salt)) do DeliveryEscrow.sol. */
export function computeCommitment(code: string, salt: Hex): Hex {
  if (!/^\d{6}$/.test(code)) {
    throw new Error("Código de entrega deve ter exatamente 6 dígitos numéricos");
  }
  const encoded = concatBytes(encodeUint256(BigInt(code)), encodeUint256(BigInt(salt)));
  return ensureHex(keccak_256(encoded));
}

// ─── EIP-712 Signing & Verification ─────────────────────────────────────────

const EIP712_DOMAIN_TYPEHASH = keccak_256(
  ENCODER.encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

const ESCROW_OFFER_TYPEHASH = keccak_256(
  ENCODER.encode(
    "EscrowOffer(uint256 chainId,address escrow,address token,uint256 amount,address seller,address arbiter,uint64 deadline,uint64 exp,bytes32 sellerNpubHash)",
  ),
);

const EXTEND_DEADLINE_TYPEHASH = keccak_256(
  ENCODER.encode("ExtendDeadline(uint256 orderId,uint64 newDeadline,uint256 nonce,uint64 sigExpiry)"),
);

function buildDomainSeparator(name: string, version: string, chainId: number, verifyingContract: Hex): Uint8Array {
  return keccak_256(
    concatBytes(
      EIP712_DOMAIN_TYPEHASH,
      keccak_256(ENCODER.encode(name)),
      keccak_256(ENCODER.encode(version)),
      encodeUint256(chainId),
      encodeAddress(verifyingContract),
    ),
  );
}

function hashEip712(domainSeparator: Uint8Array, structHash: Uint8Array): Uint8Array {
  return keccak_256(concatBytes(new Uint8Array([0x19, 0x01]), domainSeparator, structHash));
}

export function hashEscrowOfferDigest(
  offer: Omit<EscrowOfferQr, "sig">,
): Uint8Array {
  const domain = buildDomainSeparator(
    "ArmadaDeliveryEscrow",
    "1",
    offer.chainId,
    offer.escrow as Hex,
  );
  const structHash = keccak_256(
    concatBytes(
      ESCROW_OFFER_TYPEHASH,
      encodeUint256(offer.chainId),
      encodeAddress(offer.escrow),
      encodeAddress(offer.token),
      encodeUint256(BigInt(offer.amount)),
      encodeAddress(offer.seller),
      encodeAddress(offer.arbiter),
      encodeUint256(offer.deadline),
      encodeUint256(offer.exp),
      keccak_256(ENCODER.encode(offer.sellerNpub)),
    ),
  );
  return hashEip712(domain, structHash);
}

export function hashExtendDeadlineDigest(params: {
  chainId: number;
  escrow: Hex;
  orderId: bigint;
  newDeadline: number;
  nonce: bigint;
  sigExpiry: number;
}): Uint8Array {
  const domain = buildDomainSeparator("ArmadaDeliveryEscrow", "1", params.chainId, params.escrow);
  const structHash = keccak_256(
    concatBytes(
      EXTEND_DEADLINE_TYPEHASH,
      encodeUint256(params.orderId),
      encodeUint256(params.newDeadline),
      encodeUint256(params.nonce),
      encodeUint256(params.sigExpiry),
    ),
  );
  return hashEip712(domain, structHash);
}

export function signDigestEth(digest: Uint8Array, privateKey: Uint8Array): Hex {
  const sigRec = secp256k1.sign(digest, privateKey, { prehash: false, format: "recovered" });
  const recid = sigRec[0];
  const rs = sigRec.slice(1, 65);
  const ethSig = new Uint8Array(65);
  ethSig.set(rs, 0);
  ethSig[64] = recid + 27;
  return ensureHex(ethSig);
}

export function recoverAddressFromEthSig(digest: Uint8Array, signature: Hex): Hex {
  const bytes = hexToBytes(strip0x(signature));
  if (bytes.length !== 65) throw new Error("Assinatura EIP-712 deve ter 65 bytes");
  const v = bytes[64];
  const recid = v >= 27 ? v - 27 : v;
  if (recid !== 0 && recid !== 1) throw new Error("Recovery ID inválido");

  const sigRec = new Uint8Array(65);
  sigRec[0] = recid;
  sigRec.set(bytes.slice(0, 64), 1);

  const compressedPub = secp256k1.recoverPublicKey(sigRec, digest, { prehash: false });
  const uncompressed = schnorr.Point.fromBytes(compressedPub).toBytes(false);
  const addrHash = keccak_256(uncompressed.slice(1));
  return normalizeAddress(`0x${bytesToHex(addrHash.slice(12))}`);
}

export function signEscrowOffer(
  offerWithoutSig: Omit<EscrowOfferQr, "sig">,
  sellerPrivateKey: Uint8Array,
): EscrowOfferQr {
  const digest = hashEscrowOfferDigest(offerWithoutSig);
  const sig = signDigestEth(digest, sellerPrivateKey);
  return { ...offerWithoutSig, sig };
}

export interface OfferValidationOptions {
  expectedChainId?: number;
  expectedSellerNpub?: string;
  nowSec?: number;
  extraAllowedTokens?: TokenConfig[];
  extraAllowedEscrows?: Record<number, Hex[]>;
}

export function parseAndValidateEscrowOffer(
  rawJson: string,
  options: OfferValidationOptions = {},
): { ok: true; offer: EscrowOfferQr; token: TokenConfig } | { ok: false; reason: string } {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "QR Code inválido (não é um JSON válido)." };
  }

  const res = EscrowOfferQrSchema.safeParse(parsedJson);
  if (!res.success) {
    return { ok: false, reason: "Estrutura do QR v2 inválida." };
  }
  const offer = res.data;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1000);

  if (!isValidNpub(offer.sellerNpub)) {
    return { ok: false, reason: "Identidade Nostr (sellerNpub) inválida no QR." };
  }
  if (options.expectedSellerNpub && offer.sellerNpub !== options.expectedSellerNpub) {
    return { ok: false, reason: "O QR pertence a outro vendedor diferente desta conversa." };
  }

  if (options.expectedChainId !== undefined && offer.chainId !== options.expectedChainId) {
    return { ok: false, reason: `Rede incompatível (esperada ${options.expectedChainId}, recebida ${offer.chainId}).` };
  }

  if (!SUPPORTED_CHAINS[offer.chainId]) {
    return { ok: false, reason: `Rede chainId=${offer.chainId} não suportada.` };
  }

  const { chain, tokens: activeTokens } = resolveActiveChainAndTokens(offer.chainId);

  const allowedEscrows = [
    chain.escrowAddress,
    ...(options.extraAllowedEscrows?.[offer.chainId] ?? []),
  ]
    .map((a) => a.toLowerCase())
    .filter((a) => a !== "0x0000000000000000000000000000000000000000");

  if (!allowedEscrows.includes(offer.escrow.toLowerCase())) {
    return { ok: false, reason: "Contrato de escrow fora da whitelist oficial do app." };
  }

  const allTokens = [...activeTokens, ...(options.extraAllowedTokens ?? [])];
  const token = allTokens.find(
    (t) => t.chainId === offer.chainId && t.address.toLowerCase() === offer.token.toLowerCase(),
  );
  if (!token) {
    return { ok: false, reason: "Token não consta na whitelist oficial (possível token falso)." };
  }
  if (offer.decimals !== token.decimals) {
    return { ok: false, reason: "Casas decimais divergentes do token oficial." };
  }
  if (BigInt(offer.amount) <= 0n) {
    return { ok: false, reason: "Valor do pedido deve ser maior que zero." };
  }
  if (offer.exp <= nowSec) {
    return { ok: false, reason: "Este QR Code expirou. Peça um novo ao vendedor." };
  }
  if (offer.deadline <= nowSec) {
    return { ok: false, reason: "Prazo de entrega inválido (no passado)." };
  }

  try {
    const { sig, ...rest } = offer;
    const digest = hashEscrowOfferDigest(rest);
    const recovered = recoverAddressFromEthSig(digest, sig as Hex);
    if (recovered.toLowerCase() !== offer.seller.toLowerCase()) {
      return { ok: false, reason: "Assinatura EIP-712 não confere com o vendedor informado." };
    }
  } catch {
    return { ok: false, reason: "Falha ao verificar assinatura criptográfica do vendedor." };
  }

  return { ok: true, offer, token };
}

export function parseDeliveryConfirmQr(
  rawJson: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): { ok: true; payload: DeliveryConfirmQr } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { ok: false, reason: "QR de entrega inválido." };
  }
  const res = DeliveryConfirmQrSchema.safeParse(parsed);
  if (!res.success) {
    return { ok: false, reason: "Formato do QR de entrega inválido." };
  }
  if (res.data.exp <= nowSec) {
    return { ok: false, reason: "QR de entrega expirado. Peça ao comprador para reexibir." };
  }
  return { ok: true, payload: res.data };
}

// ─── ABI Encoding Completa (DeliveryEscrow.sol + ERC-20) ────────────────────

export function encodeApproveCall(spender: Hex, amount: bigint): Hex {
  return ensureHex(
    concatBytes(
      functionSelector("approve(address,uint256)"),
      encodeAddress(spender),
      encodeUint256(amount),
    ),
  );
}

export function encodeCreateOrderCall(params: {
  seller: Hex;
  arbiter: Hex;
  token: Hex;
  amount: bigint;
  deliveryDeadline: number;
  codeCommitment: Hex;
}): Hex {
  const selector = functionSelector("createOrder(address,address,address,uint256,uint64,bytes32)");
  return ensureHex(
    concatBytes(
      selector,
      encodeAddress(params.seller),
      encodeAddress(params.arbiter),
      encodeAddress(params.token),
      encodeUint256(params.amount),
      encodeUint256(params.deliveryDeadline),
      encodeBytes32(params.codeCommitment),
    ),
  );
}

export function encodeCreateOrderWithPermitCall(params: {
  seller: Hex;
  arbiter: Hex;
  token: Hex;
  amount: bigint;
  deliveryDeadline: number;
  codeCommitment: Hex;
  permitDeadline: bigint | number;
  v: number;
  r: Hex;
  s: Hex;
}): Hex {
  const selector = functionSelector(
    "createOrderWithPermit(address,address,address,uint256,uint64,bytes32,uint256,uint8,bytes32,bytes32)",
  );
  return ensureHex(
    concatBytes(
      selector,
      encodeAddress(params.seller),
      encodeAddress(params.arbiter),
      encodeAddress(params.token),
      encodeUint256(params.amount),
      encodeUint256(params.deliveryDeadline),
      encodeBytes32(params.codeCommitment),
      encodeUint256(params.permitDeadline),
      encodeUint256(params.v),
      encodeBytes32(params.r),
      encodeBytes32(params.s),
    ),
  );
}

export function encodeConfirmDeliveryCall(orderId: bigint, code: string, salt: Hex): Hex {
  if (!/^\d{6}$/.test(code)) throw new Error("Código inválido");
  const selector = functionSelector("confirmDelivery(uint256,uint256,uint256)");
  return ensureHex(
    concatBytes(
      selector,
      encodeUint256(orderId),
      encodeUint256(BigInt(code)),
      encodeUint256(BigInt(salt)),
    ),
  );
}

export function encodeRefundBySellerCall(orderId: bigint): Hex {
  return ensureHex(concatBytes(functionSelector("refundBySeller(uint256)"), encodeUint256(orderId)));
}

export function encodeExtendDeadlineCall(params: {
  orderId: bigint;
  newDeadline: number;
  sigExpiry: number;
  buyerSignature: Hex;
}): Hex {
  const selector = functionSelector("extendDeadline(uint256,uint64,uint64,bytes)");
  const sigBytes = hexToBytes(strip0x(params.buyerSignature));
  // 4 argumentos na head (4 * 32 = 128 bytes até o início do tail dinâmico de `bytes`)
  const headOffset = encodeUint256(128);
  return ensureHex(
    concatBytes(
      selector,
      encodeUint256(params.orderId),
      encodeUint256(params.newDeadline),
      encodeUint256(params.sigExpiry),
      headOffset,
      encodeDynamicBytes(sigBytes),
    ),
  );
}

export function encodeOpenDisputeCall(orderId: bigint): Hex {
  return ensureHex(concatBytes(functionSelector("openDispute(uint256)"), encodeUint256(orderId)));
}

export function encodeResolveDisputeCall(orderId: bigint, releaseToSeller: boolean): Hex {
  return ensureHex(
    concatBytes(
      functionSelector("resolveDispute(uint256,bool)"),
      encodeUint256(orderId),
      encodeBool(releaseToSeller),
    ),
  );
}

export function encodeRefundTimeoutCall(orderId: bigint): Hex {
  return ensureHex(concatBytes(functionSelector("refundTimeout(uint256)"), encodeUint256(orderId)));
}

export function encodeRefundArbiterTimeoutCall(orderId: bigint): Hex {
  return ensureHex(
    concatBytes(functionSelector("refundArbiterTimeout(uint256)"), encodeUint256(orderId)),
  );
}

export function encodeBalanceOfCall(owner: Hex): Hex {
  return ensureHex(concatBytes(functionSelector("balanceOf(address)"), encodeAddress(owner)));
}

export function encodeGetOrderCall(orderId: bigint): Hex {
  return ensureHex(concatBytes(functionSelector("orders(uint256)"), encodeUint256(orderId)));
}

function readWord(bytes: Uint8Array, wordIndex: number): Uint8Array {
  const start = wordIndex * 32;
  return bytes.slice(start, start + 32);
}

function wordToBigInt(word: Uint8Array): bigint {
  return BigInt(`0x${bytesToHex(word)}`);
}

function wordToAddress(word: Uint8Array): Hex {
  return normalizeAddress(`0x${bytesToHex(word.slice(12, 32))}`);
}

export function decodeOrderResult(orderId: bigint, returnData: Hex): OnchainOrder {
  const bytes = hexToBytes(strip0x(returnData));
  // 10 campos retornados pela getter pública orders(uint256):
  // 0: buyer, 1: status, 2: seller, 3: deliveryDeadline, 4: arbiter,
  // 5: disputedAt, 6: token, 7: amount, 8: codeCommitment, 9: deadlineNonce
  if (bytes.length < 320) {
    throw new Error("Resposta inválida de orders(uint256)");
  }
  const statusNum = Number(wordToBigInt(readWord(bytes, 1))) as EscrowOrderStatus;
  return {
    orderId,
    buyer: wordToAddress(readWord(bytes, 0)),
    status: statusNum,
    seller: wordToAddress(readWord(bytes, 2)),
    deliveryDeadline: Number(wordToBigInt(readWord(bytes, 3))),
    arbiter: wordToAddress(readWord(bytes, 4)),
    disputedAt: Number(wordToBigInt(readWord(bytes, 5))),
    token: wordToAddress(readWord(bytes, 6)),
    amount: wordToBigInt(readWord(bytes, 7)),
    codeCommitment: ensureHex(readWord(bytes, 8)),
    deadlineNonce: wordToBigInt(readWord(bytes, 9)),
  };
}

// ─── Formatting & JSON-RPC ──────────────────────────────────────────────────

export function parseTokenAmount(decimalText: string, decimals: number): bigint {
  const trimmed = decimalText.trim().replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error("Valor numérico inválido");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    throw new Error(`Máximo de ${decimals} casas decimais suportadas`);
  }
  const paddedFrac = frac.padEnd(decimals, "0");
  return BigInt(`${whole}${paddedFrac}`);
}

export function formatTokenAmount(minorUnits: bigint, decimals: number, displayDecimals = 2): string {
  const base = 10n ** BigInt(decimals);
  const whole = minorUnits / base;
  const rem = minorUnits % base;
  const fracStr = rem.toString().padStart(decimals, "0").slice(0, displayDecimals);
  return displayDecimals > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
}

async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) {
    throw new Error(`RPC HTTP ${res.status}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(json.error.message ?? "Erro desconhecido do nó RPC");
  }
  if (json.result === undefined) {
    throw new Error("Resposta RPC vazia");
  }
  return json.result;
}

export async function fetchTokenBalance(
  rpcUrl: string,
  tokenAddress: Hex,
  owner: Hex,
): Promise<bigint> {
  const data = encodeBalanceOfCall(owner);
  const result = await rpcCall<Hex>(rpcUrl, "eth_call", [{ to: tokenAddress, data }, "latest"]);
  return result === "0x" ? 0n : BigInt(result);
}

export async function fetchOnchainOrder(
  rpcUrl: string,
  escrowAddress: Hex,
  orderId: bigint,
): Promise<OnchainOrder> {
  const data = encodeGetOrderCall(orderId);
  const result = await rpcCall<Hex>(rpcUrl, "eth_call", [{ to: escrowAddress, data }, "latest"]);
  return decodeOrderResult(orderId, result);
}

export function utf8ToHex(text: string): Hex {
  return ensureHex(ENCODER.encode(text));
}

export function hexToUtf8(hexStr: Hex): string {
  return DECODER.decode(hexToBytes(strip0x(hexStr)));
}
