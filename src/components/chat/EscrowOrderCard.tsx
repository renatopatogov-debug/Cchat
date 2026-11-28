import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeCanvas } from "@/components/ui/qrcode";
import { toast } from "@/hooks/useToast";
import { FormattedMessage, useIntl } from "@/i18n";
import {
  ORDER_STATUS_LABELS,
  canonicalOrderSeed,
  computeCommitment,
  deriveOrderSecret,
  encodeConfirmDeliveryCall,
  encodeOpenDisputeCall,
  encodeRefundArbiterTimeoutCall,
  encodeRefundBySellerCall,
  encodeRefundTimeoutCall,
  fetchOnchainOrder,
  formatTokenAmount,
  resolveActiveChainAndTokens,
  type DeliveryConfirmQr,
  type Hex,
  type OnchainOrder,
} from "@/lib/escrowClient";
import { unlockEvmPrivateKey } from "@/lib/evmWallet";
import { enqueueMeshEscrowPacket } from "@/lib/meshOutbox";

export interface EscrowOrderCardProps {
  chainId: number;
  escrowAddress: Hex;
  orderId: bigint;
  myAddress?: Hex;
  nostrPubkey?: string;
  /** Código + salt caso já estejam em memória na sessão atual. */
  buyerSecret?: { code: string; salt: Hex };
  /** Callback opcional para enviar calldata via Paymaster / carteira conectada. */
  onExecuteCalldata?: (to: Hex, data: Hex, label: string) => Promise<void>;
}

const GRACE_PERIOD_SEC = 24 * 3600;
const ARBITER_TIMEOUT_SEC = 15 * 24 * 3600;

export function EscrowOrderCard({
  chainId,
  escrowAddress,
  orderId,
  myAddress,
  nostrPubkey,
  buyerSecret,
  onExecuteCalldata,
}: EscrowOrderCardProps) {
  const intl = useIntl();
  const [order, setOrder] = useState<OnchainOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [unlockPin, setUnlockPin] = useState("");
  const [recoveredSecret, setRecoveredSecret] = useState<{ code: string; salt: Hex } | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [manualSalt, setManualSalt] = useState("");

  const { chain, tokens } = resolveActiveChainAndTokens(chainId);
  const activeSecret = buyerSecret ?? recoveredSecret;

  const refreshOnchain = useCallback(async () => {
    if (!chain || escrowAddress === "0x0000000000000000000000000000000000000000") {
      setError(
        intl.formatMessage({
          id: "cchat.escrow.notConfigured",
          defaultMessage: "Escrow contract is not configured for this network yet.",
        }),
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOnchainOrder(chain.rpcUrls[0], escrowAddress, orderId);
      setOrder(data);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : intl.formatMessage({
              id: "cchat.escrow.fetchFailed",
              defaultMessage: "Failed to verify order on the blockchain.",
            }),
      );
    } finally {
      setLoading(false);
    }
  }, [chain, escrowAddress, intl, orderId]);

  useEffect(() => {
    void refreshOnchain();
  }, [refreshOnchain]);

  const tokenMeta = order
    ? tokens.find((t) => t.address.toLowerCase() === order.token.toLowerCase())
    : undefined;

  const isBuyer =
    !!order && !!myAddress && order.buyer.toLowerCase() === myAddress.toLowerCase();
  const isSeller =
    !!order && !!myAddress && order.seller.toLowerCase() === myAddress.toLowerCase();

  const handleRecoverBuyerCode = async () => {
    if (!order || !nostrPubkey) return;
    try {
      const priv = await unlockEvmPrivateKey(nostrPubkey, unlockPin);
      try {
        const seed = canonicalOrderSeed({
          chainId,
          escrow: escrowAddress,
          seller: order.seller,
          token: order.token,
          amount: order.amount,
          deliveryDeadline: order.deliveryDeadline,
        });
        const derived = deriveOrderSecret(priv, seed);
        if (derived.commitment.toLowerCase() !== order.codeCommitment.toLowerCase()) {
          toast({
            title: intl.formatMessage({
              id: "cchat.escrow.codeMismatchTitle",
              defaultMessage: "Code does not match this wallet",
            }),
            description: intl.formatMessage({
              id: "cchat.escrow.codeMismatchBody",
              defaultMessage: "This order was created with a different seed or wallet.",
            }),
            variant: "destructive",
          });
          return;
        }
        setRecoveredSecret({ code: derived.code, salt: derived.salt });
        setUnlockPin("");
      } finally {
        priv.fill(0);
      }
    } catch (e) {
      toast({
        title: intl.formatMessage({
          id: "cchat.escrow.unlockFailed",
          defaultMessage: "Failed to unlock code",
        }),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const deliveryQrPayload: DeliveryConfirmQr | null =
    activeSecret && order
      ? {
          v: 2,
          type: "delivery-confirm",
          chainId,
          escrow: escrowAddress,
          orderId: orderId.toString(),
          code: activeSecret.code,
          salt: activeSecret.salt,
          exp: Math.floor(Date.now() / 1000) + 600,
        }
      : null;

  const handleConfirmDelivery = async () => {
    if (!order) return;
    if (!/^\d{6}$/.test(manualCode)) {
      toast({
        title: intl.formatMessage({
          id: "cchat.escrow.invalidCodeTitle",
          defaultMessage: "Invalid code",
        }),
        description: intl.formatMessage({
          id: "cchat.escrow.invalidCodeBody",
          defaultMessage: "Enter exactly 6 digits.",
        }),
        variant: "destructive",
      });
      return;
    }
    const saltHex = (manualSalt.startsWith("0x") ? manualSalt : `0x${manualSalt}`) as Hex;
    try {
      const commitment = computeCommitment(manualCode, saltHex);
      if (commitment.toLowerCase() !== order.codeCommitment.toLowerCase()) {
        toast({
          title: intl.formatMessage({
            id: "cchat.escrow.wrongCodeTitle",
            defaultMessage: "Code does not match",
          }),
          description: intl.formatMessage({
            id: "cchat.escrow.wrongCodeBody",
            defaultMessage: "The code and salt pair does not match the on-chain commitment.",
          }),
          variant: "destructive",
        });
        return;
      }

      if (!navigator.onLine) {
        await enqueueMeshEscrowPacket({
          kind: "confirm-delivery",
          chainId,
          escrow: escrowAddress,
          orderId: orderId.toString(),
          code: manualCode,
          salt: saltHex,
        });
        toast({
          title: intl.formatMessage({
            id: "cchat.escrow.queuedOfflineTitle",
            defaultMessage: "Saved to offline queue",
          }),
          description: intl.formatMessage({
            id: "cchat.escrow.queuedOfflineBody",
            defaultMessage: "No internet: the code was saved to disk for automatic sending on reconnect.",
          }),
        });
        return;
      }

      const calldata = encodeConfirmDeliveryCall(orderId, manualCode, saltHex);
      if (onExecuteCalldata) {
        await onExecuteCalldata(
          escrowAddress,
          calldata,
          intl.formatMessage({
            id: "cchat.escrow.actionConfirmDelivery",
            defaultMessage: "Confirm delivery",
          }),
        );
        await refreshOnchain();
      } else {
        await navigator.clipboard?.writeText(calldata);
        toast({
          title: intl.formatMessage({
            id: "cchat.escrow.calldataTitle",
            defaultMessage: "Calldata generated",
          }),
          description: intl.formatMessage({
            id: "cchat.escrow.calldataBody",
            defaultMessage: "confirmDelivery data copied (ready for Remix/Paymaster).",
          }),
        });
      }
    } catch (e) {
      toast({
        title: intl.formatMessage({
          id: "cchat.escrow.confirmError",
          defaultMessage: "Failed to confirm",
        }),
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const nowSec = Math.floor(Date.now() / 1000);

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm space-y-3 max-w-md">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold">
              <FormattedMessage
                id="cchat.escrow.orderTitle"
                defaultMessage="Escrow Order #{id}"
                values={{ id: orderId.toString() }}
              />
            </p>
            <p className="text-xs text-muted-foreground">{chain.name}</p>
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void refreshOnchain()} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {order && (
        <>
          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <FormattedMessage id="cchat.escrow.onchainStatus" defaultMessage="On-chain status:" />
              </span>
              <span className="font-semibold text-foreground">{ORDER_STATUS_LABELS[order.status]}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <FormattedMessage id="cchat.escrow.lockedAmount" defaultMessage="Locked amount:" />
              </span>
              <span className="font-semibold">
                {tokenMeta ? (
                  `${formatTokenAmount(order.amount, tokenMeta.decimals)} ${tokenMeta.symbol}`
                ) : (
                  <FormattedMessage
                    id="cchat.escrow.unlistedToken"
                    defaultMessage="{amount} (token not whitelisted)"
                    values={{ amount: order.amount.toString() }}
                  />
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                <FormattedMessage id="cchat.escrow.deliveryDeadline" defaultMessage="Delivery deadline:" />
              </span>
              <span>{new Date(order.deliveryDeadline * 1000).toLocaleString()}</span>
            </div>
          </div>

          {/* Comprador: Recuperar código em outro aparelho usando apenas PIN + dados on-chain */}
          {isBuyer && !activeSecret && nostrPubkey && (order.status === 1 || order.status === 3) && (
            <div className="flex items-center gap-2 pt-1">
              <Input
                type="password"
                value={unlockPin}
                onChange={(e) => setUnlockPin(e.target.value)}
                placeholder={intl.formatMessage({
                  id: "cchat.escrow.revealPinPlaceholder",
                  defaultMessage: "PIN to reveal code",
                })}
              />
              <Button type="button" size="sm" onClick={() => void handleRecoverBuyerCode()}>
                <KeyRound className="size-3.5 mr-1.5" />
                <FormattedMessage id="cchat.escrow.revealButton" defaultMessage="Reveal" />
              </Button>
            </div>
          )}

          {/* Área do Comprador: Código estilo iFood + QR presencial */}
          {isBuyer && activeSecret && (order.status === 1 || order.status === 3) && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-emerald-400">
                  <FormattedMessage
                    id="cchat.escrow.buyerCodeHint"
                    defaultMessage="Your delivery code (show only on receipt)"
                  />
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setShowQr((s) => !s)}
                >
                  <QrCode className="size-3.5 mr-1.5" />
                  {showQr ? (
                    <FormattedMessage id="cchat.escrow.hideQr" defaultMessage="Hide QR" />
                  ) : (
                    <FormattedMessage id="cchat.escrow.showQr" defaultMessage="Show QR" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground">
                  {activeSecret.code}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(activeSecret.code);
                    toast({
                      title: intl.formatMessage({
                        id: "cchat.escrow.codeCopied",
                        defaultMessage: "Code copied",
                      }),
                    });
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              {showQr && deliveryQrPayload && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <div className="rounded-lg bg-white p-2">
                    <QRCodeCanvas value={JSON.stringify(deliveryQrPayload)} size={180} />
                  </div>
                  <p className="text-[11px] text-muted-foreground text-center">
                    <FormattedMessage
                      id="cchat.escrow.qrInPersonWarning"
                      defaultMessage="Show only in person. Never send this QR in chat before delivery."
                    />
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Área do Vendedor: Digitar código ou cancelar amigavelmente */}
          {isSeller && (order.status === 1 || order.status === 3) && (
            <div className="space-y-2 pt-1">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder={intl.formatMessage({
                    id: "cchat.escrow.codeInputPlaceholder",
                    defaultMessage: "6-digit code",
                  })}
                  inputMode="numeric"
                />
                <Input
                  value={manualSalt}
                  onChange={(e) => setManualSalt(e.target.value.trim())}
                  placeholder="Salt (0x...)"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void handleConfirmDelivery()}>
                  <CheckCircle2 className="size-4 mr-1.5" />
                  <FormattedMessage
                    id="cchat.escrow.confirmDeliveryButton"
                    defaultMessage="Confirm Delivery"
                  />
                </Button>
                {onExecuteCalldata && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void onExecuteCalldata(
                        escrowAddress,
                        encodeRefundBySellerCall(orderId),
                        intl.formatMessage({
                          id: "cchat.escrow.actionSellerRefund",
                          defaultMessage: "Cancel and refund buyer",
                        }),
                      ).then(refreshOnchain)
                    }
                  >
                    <FormattedMessage id="cchat.escrow.refundFullButton" defaultMessage="Refund 100%" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Ações de Disputa e Timeouts */}
          {(order.status === 1 || order.status === 3) && onExecuteCalldata && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/60">
              {order.status === 1 &&
                order.arbiter !== "0x0000000000000000000000000000000000000000" &&
                (isBuyer || isSeller) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() =>
                      void onExecuteCalldata(
                        escrowAddress,
                        encodeOpenDisputeCall(orderId),
                        intl.formatMessage({
                          id: "cchat.escrow.actionOpenDispute",
                          defaultMessage: "Open dispute",
                        }),
                      ).then(refreshOnchain)
                    }
                  >
                    <FormattedMessage
                      id="cchat.escrow.openDisputeButton"
                      defaultMessage="Open Dispute"
                    />
                  </Button>
                )}

              {order.status === 1 && isBuyer && nowSec > order.deliveryDeadline + GRACE_PERIOD_SEC && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void onExecuteCalldata(
                      escrowAddress,
                      encodeRefundTimeoutCall(orderId),
                      intl.formatMessage({
                        id: "cchat.escrow.actionTimeoutRefund",
                        defaultMessage: "Claim expired deadline refund",
                      }),
                    ).then(refreshOnchain)
                  }
                >
                  <Clock className="size-4 mr-1.5" />
                  <FormattedMessage
                    id="cchat.escrow.claimTimeoutButton"
                    defaultMessage="Claim Timeout"
                  />
                </Button>
              )}

              {order.status === 3 &&
                isBuyer &&
                order.disputedAt > 0 &&
                nowSec > order.disputedAt + ARBITER_TIMEOUT_SEC && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void onExecuteCalldata(
                        escrowAddress,
                        encodeRefundArbiterTimeoutCall(orderId),
                        intl.formatMessage({
                          id: "cchat.escrow.actionArbiterTimeoutRefund",
                          defaultMessage: "Claim arbiter inactivity refund (15d)",
                        }),
                      ).then(refreshOnchain)
                    }
                  >
                    <Clock className="size-4 mr-1.5" />
                    <FormattedMessage
                      id="cchat.escrow.claimArbiterTimeoutButton"
                      defaultMessage="Claim Abandoned Dispute"
                    />
                  </Button>
                )}
            </div>
          )}

          {order.status === 2 && (
            <div className="flex items-center gap-2 text-xs text-emerald-500">
              <Unlock className="size-4" />
              <span>
                <FormattedMessage
                  id="cchat.escrow.releasedBanner"
                  defaultMessage="Delivery confirmed and funds released to seller."
                />
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
