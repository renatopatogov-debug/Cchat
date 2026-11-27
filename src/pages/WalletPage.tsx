import {
  ArrowDownLeft,
  ArrowUpRight,
  Bluetooth,
  Camera,
  CheckCircle2,
  Copy,
  KeyRound,
  QrCode,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EscrowOrderCard } from "@/components/chat/EscrowOrderCard";
import { SignalBottomNav } from "@/components/layout/SignalBottomNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { toast } from "@/hooks/useToast";
import {
  SUPPORTED_CHAINS,
  canonicalOrderSeed,
  deriveOrderSecret,
  fetchTokenBalance,
  formatTokenAmount,
  getTestnetOverride,
  isValidAddress,
  parseAndValidateEscrowOffer,
  parseDeliveryConfirmQr,
  parseTokenAmount,
  resolveActiveChainAndTokens,
  saveTestnetOverride,
  signEscrowOffer,
  type EscrowOfferQr,
  type Hex,
} from "@/lib/escrowClient";
import {
  createDerivedEvmWalletFromNsec,
  createEncryptedEvmWallet,
  exportEncryptedWalletBackup,
  getStoredWalletSummary,
  restoreFromEncryptedBackup,
  unlockEvmPrivateKey,
  type EvmWalletSummary,
} from "@/lib/evmWallet";
import {
  enqueueMeshEscrowPacket,
  listAllMeshEscrowItems,
  type QueuedMeshEscrowItem,
} from "@/lib/meshOutbox";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

function getBarcodeDetectorCtor(): (new (opts: { formats: string[] }) => BarcodeDetectorLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  };
  return w.BarcodeDetector ?? null;
}

function QrCameraScanner({
  onDetected,
  onClose,
}: {
  onDetected: (raw: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    const DetectorCtor = getBarcodeDetectorCtor();
    if (!DetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setCamError("Leitor nativo indisponível neste navegador; cole o payload JSON abaixo.");
      return;
    }

    let active = true;
    let stream: MediaStream | null = null;
    let rafId = 0;
    const detector = new DetectorCtor({ formats: ["qr_code"] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const scanFrame = async () => {
          if (!active) return;
          if (videoRef.current && videoRef.current.readyState >= 2) {
            try {
              const codes = await detector.detect(videoRef.current);
              const hit = codes.find((c) => typeof c.rawValue === "string" && c.rawValue.length > 0);
              if (hit?.rawValue) {
                onDetected(hit.rawValue);
                return;
              }
            } catch {
              // ignora frame intermediário
            }
          }
          rafId = requestAnimationFrame(() => void scanFrame());
        };

        rafId = requestAnimationFrame(() => void scanFrame());
      } catch (e) {
        if (active) {
          setCamError(e instanceof Error ? e.message : "Permissão de câmera negada.");
        }
      }
    })();

    return () => {
      active = false;
      if (rafId) cancelAnimationFrame(rafId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">Aponte a câmera para o QR v2</span>
        <Button type="button" size="icon" variant="ghost" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {camError ? (
        <p className="text-xs text-destructive">{camError}</p>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted
          className="w-full max-h-60 rounded-lg bg-black object-cover"
        />
      )}
    </div>
  );
}

export function WalletPage() {
  const { user } = useCurrentUser();
  const [chainId, setChainId] = useState<number>(8453);
  const [overrideVersion, setOverrideVersion] = useState(0);
  const [walletSummary, setWalletSummary] = useState<EvmWalletSummary | null>(null);
  const [pin, setPin] = useState("");
  const [nsecInput, setNsecInput] = useState("");
  const [restoreJson, setRestoreJson] = useState("");
  const [restorePwd, setRestorePwd] = useState("");
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Configuração rápida de Base Sepolia (Remix deploy)
  const initialOv = useMemo(() => getTestnetOverride(), []);
  const [testnetEscrowInput, setTestnetEscrowInput] = useState<string>(
    initialOv?.escrowAddress ?? "",
  );
  const [testnetTokenInput, setTestnetTokenInput] = useState<string>(
    initialOv?.mockTokenAddress ?? "",
  );

  // Vendedor: Gerar QR v2 de oferta
  const [offerAmount, setOfferAmount] = useState("25.00");
  const [offerHours, setOfferHours] = useState("48");
  const [generatedOffer, setGeneratedOffer] = useState<EscrowOfferQr | null>(null);

  // Comprador / Leitor: Validar QR v2 (câmera ou texto)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scannedInput, setScannedInput] = useState("");
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [validatedOffer, setValidatedOffer] = useState<EscrowOfferQr | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState("1");
  const [derivedPreview, setDerivedPreview] = useState<{
    code: string;
    salt: Hex;
    commitment: Hex;
  } | null>(null);

  // Fila persistente Bluetooth Mesh
  const [meshItems, setMeshItems] = useState<QueuedMeshEscrowItem[]>([]);

  const { chain, tokens: chainTokens } = useMemo(
    () => {
      void overrideVersion;
      return resolveActiveChainAndTokens(chainId);
    },
    [chainId, overrideVersion],
  );

  const loadWalletAndQueue = useCallback(async () => {
    if (!user) return;
    const summary = await getStoredWalletSummary(user.pubkey);
    setWalletSummary(summary);
    const items = await listAllMeshEscrowItems();
    setMeshItems(items);
  }, [user]);

  useEffect(() => {
    void loadWalletAndQueue();
  }, [loadWalletAndQueue]);

  const refreshBalances = useCallback(async () => {
    if (!walletSummary || chainTokens.length === 0) return;
    setLoadingBalances(true);
    try {
      const next: Record<string, string> = {};
      for (const tok of chainTokens) {
        try {
          const raw = await fetchTokenBalance(chain.rpcUrls[0], tok.address, walletSummary.address);
          next[tok.symbol] = formatTokenAmount(raw, tok.decimals);
        } catch {
          next[tok.symbol] = "—";
        }
      }
      setBalances(next);
    } finally {
      setLoadingBalances(false);
    }
  }, [walletSummary, chain, chainTokens]);

  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);

  const handleSaveTestnetConfig = () => {
    if (!isValidAddress(testnetEscrowInput) || !isValidAddress(testnetTokenInput)) {
      toast({
        title: "Endereço inválido",
        description: "Informe os dois endereços 0x… gerados no Remix (DeliveryEscrow e MockBRZ).",
        variant: "destructive",
      });
      return;
    }
    saveTestnetOverride({
      escrowAddress: testnetEscrowInput,
      mockTokenAddress: testnetTokenInput,
      mockTokenDecimals: 18,
    });
    setOverrideVersion((v) => v + 1);
    toast({ title: "Endereços Base Sepolia salvos!" });
  };

  const handleCreateWallet = async () => {
    if (!user) return;
    try {
      const created = nsecInput.trim()
        ? await createDerivedEvmWalletFromNsec(user.pubkey, nsecInput.trim(), pin)
        : await createEncryptedEvmWallet(user.pubkey, pin);
      setWalletSummary(created);
      setPin("");
      setNsecInput("");
      toast({
        title: "Carteira pronta",
        description:
          created.mode === "nsec-derived"
            ? "Derivada do seu nsec (recuperável automaticamente com sua chave Nostr)."
            : `Endereço ${created.address.slice(0, 10)}… salvo com AES-GCM.`,
      });
    } catch (e) {
      toast({
        title: "Erro ao criar carteira",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleExportBackup = async () => {
    if (!user) return;
    try {
      const backup = await exportEncryptedWalletBackup(user.pubkey, pin, pin);
      await navigator.clipboard?.writeText(backup);
      toast({
        title: "Backup cifrado copiado",
        description: "Guarde esse JSON em local seguro. Ele exige seu PIN para restaurar.",
      });
    } catch (e) {
      toast({
        title: "Falha no backup",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleRestoreBackup = async () => {
    if (!user) return;
    try {
      const restored = await restoreFromEncryptedBackup(user.pubkey, restoreJson, restorePwd, pin);
      setWalletSummary(restored);
      setRestoreJson("");
      setRestorePwd("");
      setPin("");
      toast({ title: "Carteira restaurada", description: restored.address });
    } catch (e) {
      toast({
        title: "Erro ao restaurar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleGenerateOfferQr = async () => {
    if (!user || !walletSummary) return;
    const primaryToken = chainTokens[0];
    if (!primaryToken) {
      toast({
        title: "Sem token configurado nesta rede",
        description: "Se estiver na Base Sepolia, preencha os endereços do Remix abaixo.",
        variant: "destructive",
      });
      return;
    }
    if (chain.escrowAddress === "0x0000000000000000000000000000000000000000") {
      toast({
        title: "Contrato de escrow não configurado",
        description: "Informe o endereço do DeliveryEscrow implantado antes de gerar o QR.",
        variant: "destructive",
      });
      return;
    }
    try {
      const priv = await unlockEvmPrivateKey(user.pubkey, pin);
      try {
        const now = Math.floor(Date.now() / 1000);
        const hours = Math.max(1, Number(offerHours) || 48);
        const minor = parseTokenAmount(offerAmount, primaryToken.decimals);
        const signed = signEscrowOffer(
          {
            v: 2,
            type: "escrow-offer",
            chainId,
            escrow: chain.escrowAddress,
            token: primaryToken.address,
            tokenSymbol: primaryToken.symbol,
            decimals: primaryToken.decimals,
            amount: minor.toString(),
            seller: walletSummary.address,
            sellerNpub: nip19.npubEncode(user.pubkey),
            arbiter: "0x0000000000000000000000000000000000000000",
            deadline: now + hours * 3600,
            exp: now + 900,
          },
          priv,
        );
        setGeneratedOffer(signed);
      } finally {
        priv.fill(0);
      }
    } catch (e) {
      toast({
        title: "Informe seu PIN para assinar a oferta",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const validateRawPayload = useCallback(
    async (rawText: string) => {
      setValidatedOffer(null);
      setDerivedPreview(null);

      const trimmed = rawText.trim();
      if (!trimmed) return;

      const delivery = parseDeliveryConfirmQr(trimmed);
      if (delivery.ok) {
        await enqueueMeshEscrowPacket({
          kind: "confirm-delivery",
          chainId: delivery.payload.chainId,
          escrow: delivery.payload.escrow as Hex,
          orderId: delivery.payload.orderId,
          code: delivery.payload.code,
          salt: delivery.payload.salt as Hex,
        });
        await loadWalletAndQueue();
        setScanStatus(
          `QR de entrega #${delivery.payload.orderId} validado e salvo na fila persistente para liquidação.`,
        );
        return;
      }

      const offerRes = parseAndValidateEscrowOffer(trimmed, { expectedChainId: chainId });
      if (offerRes.ok) {
        setValidatedOffer(offerRes.offer);
        setScanStatus(
          `Oferta válida: ${formatTokenAmount(BigInt(offerRes.offer.amount), offerRes.token.decimals)} ${offerRes.token.symbol}`,
        );
        if (user && pin.length >= 4) {
          try {
            const priv = await unlockEvmPrivateKey(user.pubkey, pin);
            try {
              const seed = canonicalOrderSeed({
                chainId: offerRes.offer.chainId,
                escrow: offerRes.offer.escrow,
                seller: offerRes.offer.seller,
                token: offerRes.offer.token,
                amount: offerRes.offer.amount,
                deliveryDeadline: offerRes.offer.deadline,
              });
              setDerivedPreview(deriveOrderSecret(priv, seed));
            } finally {
              priv.fill(0);
            }
          } catch {
            // PIN ainda não digitado
          }
        }
        return;
      }

      setScanStatus(`Rejeitado: ${offerRes.reason}`);
    },
    [chainId, loadWalletAndQueue, pin, user],
  );

  return (
    <div className="flex flex-1 flex-col min-h-0 bg-background">
      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                <Wallet className="size-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Carteira &amp; Entregas (BRZ)</h1>
                <p className="text-xs text-muted-foreground">
                  Non-custodial • Escrow on-chain com código estilo iFood • QR v2
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              {Object.values(SUPPORTED_CHAINS).map((c) => (
                <Button
                  key={c.chainId}
                  type="button"
                  size="sm"
                  variant={chainId === c.chainId ? "default" : "outline"}
                  onClick={() => setChainId(c.chainId)}
                >
                  {c.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Configuração rápida Base Sepolia (para colar deploy do Remix IDE) */}
          {chainId === 84532 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-400">
                <Settings2 className="size-4" />
                <h2 className="text-sm font-semibold">
                  Configurar Contratos de Teste (Deploy do Remix em Base Sepolia)
                </h2>
              </div>
              <div className="grid md:grid-cols-2 gap-2">
                <Input
                  value={testnetEscrowInput}
                  onChange={(e) => setTestnetEscrowInput(e.target.value.trim())}
                  placeholder="Endereço DeliveryEscrow (0x...)"
                />
                <Input
                  value={testnetTokenInput}
                  onChange={(e) => setTestnetTokenInput(e.target.value.trim())}
                  placeholder="Endereço MockBRZ (0x...)"
                />
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={handleSaveTestnetConfig}>
                Salvar Endereços de Teste
              </Button>
            </div>
          )}

          {/* Setup ou Resumo da Carteira */}
          {!walletSummary ? (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <KeyRound className="size-5 text-primary" />
                <h2 className="font-semibold">Criar ou Restaurar Carteira Cripto Local</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Sua chave nunca sai deste aparelho e fica cifrada com AES-GCM + Keystore. Opcionalmente, informe seu{" "}
                <code>nsec</code> para derivar uma carteira vinculada de forma determinística à sua conta Nostr.
              </p>
              <Input
                type="password"
                value={nsecInput}
                onChange={(e) => setNsecInput(e.target.value)}
                placeholder="Opcional: seu nsec1... (para recuperação automática via chave Nostr)"
              />
              <div className="flex flex-wrap gap-2">
                <Input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Crie um PIN (mín. 4 dígitos)"
                  className="max-w-xs"
                />
                <Button type="button" onClick={() => void handleCreateWallet()}>
                  {nsecInput.trim() ? "Derivar do meu nsec" : "Criar Carteira Nova"}
                </Button>
              </div>

              <div className="pt-3 border-t border-border space-y-2">
                <p className="text-xs font-medium">Ou restaurar backup cifrado:</p>
                <Input
                  value={restoreJson}
                  onChange={(e) => setRestoreJson(e.target.value)}
                  placeholder="Cole o JSON do backup"
                />
                <div className="flex flex-wrap gap-2">
                  <Input
                    type="password"
                    value={restorePwd}
                    onChange={(e) => setRestorePwd(e.target.value)}
                    placeholder="Senha do backup"
                    className="max-w-xs"
                  />
                  <Button type="button" variant="outline" onClick={() => void handleRestoreBackup()}>
                    <Upload className="size-4 mr-1.5" />
                    Restaurar Backup
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Seu endereço em {chain.name} ({walletSummary.mode === "nsec-derived" ? "derivado do nsec" : "chave local"})
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-xs md:text-sm font-mono bg-muted px-2 py-1 rounded break-all">
                      {walletSummary.address}
                    </code>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(walletSummary.address);
                        toast({ title: "Endereço copiado" });
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => void refreshBalances()}>
                  <RefreshCw className={`size-4 mr-1.5 ${loadingBalances ? "animate-spin" : ""}`} />
                  Atualizar Saldo
                </Button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {chainTokens.map((tok) => (
                  <div key={tok.address} className="rounded-lg bg-muted/40 border border-border/60 p-3">
                    <p className="text-xs text-muted-foreground">{tok.symbol}</p>
                    <p className="text-lg font-bold mt-0.5">{balances[tok.symbol] ?? "0.00"}</p>
                  </div>
                ))}
                {chainTokens.length === 0 && (
                  <p className="text-xs text-muted-foreground col-span-full">
                    Salve acima os endereços do deploy em Base Sepolia para exibir o saldo do MockBRZ.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                <Input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Seu PIN (para assinar/backup)"
                  className="max-w-xs"
                />
                <Button type="button" size="sm" variant="outline" onClick={() => void handleExportBackup()}>
                  Exportar Backup Cifrado
                </Button>
              </div>
            </div>
          )}

          {/* Gerar QR v2 (Vendedor) & Ler QR v2 (Comprador) */}
          {walletSummary && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Gerar Cobrança */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowDownLeft className="size-5 text-emerald-500" />
                  <h2 className="font-semibold text-sm">Receber com Escrow (QR v2)</h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={offerAmount}
                    onChange={(e) => setOfferAmount(e.target.value)}
                    placeholder="Valor (ex: 25.00)"
                  />
                  <Input
                    value={offerHours}
                    onChange={(e) => setOfferHours(e.target.value)}
                    placeholder="Prazo (horas)"
                  />
                </div>
                <Button type="button" className="w-full" onClick={() => void handleGenerateOfferQr()}>
                  <QrCode className="size-4 mr-1.5" />
                  Gerar QR Assinado (EIP-712)
                </Button>
                {generatedOffer && (
                  <div className="flex flex-col items-center gap-2 pt-2">
                    <div className="rounded-lg bg-white p-2">
                      <QRCodeCanvas value={JSON.stringify(generatedOffer)} size={180} />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        void navigator.clipboard?.writeText(JSON.stringify(generatedOffer));
                        toast({ title: "Payload QR v2 copiado" });
                      }}
                    >
                      <Copy className="size-3.5 mr-1.5" />
                      Copiar Payload para Chat
                    </Button>
                  </div>
                )}
              </div>

              {/* Ler / Validar QR v2 */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="size-5 text-primary" />
                    <h2 className="font-semibold text-sm">Escanear ou Colar QR v2</h2>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setCameraOpen((o) => !o)}
                  >
                    <Camera className="size-3.5 mr-1.5" />
                    {cameraOpen ? "Fechar" : "Câmera"}
                  </Button>
                </div>

                {cameraOpen && (
                  <QrCameraScanner
                    onDetected={(raw) => {
                      setCameraOpen(false);
                      setScannedInput(raw);
                      void validateRawPayload(raw);
                    }}
                    onClose={() => setCameraOpen(false)}
                  />
                )}

                <Input
                  value={scannedInput}
                  onChange={(e) => setScannedInput(e.target.value)}
                  placeholder="Ou cole o JSON do QR v2"
                />
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => void validateRawPayload(scannedInput)}
                >
                  <ShieldCheck className="size-4 mr-1.5" />
                  Validar Whitelist &amp; Assinatura
                </Button>
                {scanStatus && (
                  <p className="text-xs rounded-lg bg-muted p-2.5 text-foreground">{scanStatus}</p>
                )}
                {validatedOffer && derivedPreview && (
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-500">
                      <CheckCircle2 className="size-4" />
                      <span>Código determinístico pronto (recuperável em qualquer aparelho):</span>
                    </div>
                    <p className="font-mono">Código: {derivedPreview.code}</p>
                    <p className="font-mono truncate">Commit: {derivedPreview.commitment}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Consulta rápida de pedido on-chain */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-sm">Consultar Pedido On-Chain</h2>
              <Input
                value={previewOrderId}
                onChange={(e) => setPreviewOrderId(e.target.value.replace(/\D/g, "") || "1")}
                className="w-28"
                placeholder="Order ID"
              />
            </div>
            <EscrowOrderCard
              chainId={chainId}
              escrowAddress={chain.escrowAddress}
              orderId={BigInt(previewOrderId || "1")}
              myAddress={walletSummary?.address}
              nostrPubkey={user?.pubkey}
              buyerSecret={derivedPreview ?? undefined}
            />
          </div>

          {/* Fila Offline Bluetooth Mesh */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bluetooth className="size-5 text-sky-400" />
                <h2 className="font-semibold text-sm">Fila Persistente Bluetooth Mesh ({meshItems.length})</h2>
              </div>
            </div>
            {meshItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum pacote de entrega ou extensão de prazo pendente em disco.
              </p>
            ) : (
              <div className="space-y-2">
                {meshItems.map((item) => (
                  <div
                    key={item.dedupKey}
                    className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-medium">
                        {item.packet.kind} • Pedido #{item.packet.orderId}
                      </p>
                      <p className="text-muted-foreground">Status: {item.status}</p>
                    </div>
                    <code className="text-[11px]">{item.txHash ?? "aguardando rede"}</code>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <SignalBottomNav />
    </div>
  );
}
