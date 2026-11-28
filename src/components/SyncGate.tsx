import { Check, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { CchatLogo } from "@/components/brand/CchatLogo";
import { setSyncGateActive } from "@/components/syncGateState";
import { useFreshLogin } from "@/hooks/useFreshLogin";
import { useInitialSync } from "@/hooks/useInitialSync";
import { FormattedMessage } from "@/i18n";
import { markBootPainted } from "@/lib/bootGate";

/**
 * Full-screen overlay after a *fresh* login ({@link useFreshLogin}) until
 * {@link useInitialSync} is done, so the app doesn't flash empty conversations.
 */
export function SyncGate() {
  const { freshPubkey, acknowledge } = useFreshLogin();
  if (!freshPubkey) return null;
  return <SyncOverlay pubkey={freshPubkey} onDone={acknowledge} />;
}

function SyncOverlay({ pubkey, onDone }: { pubkey: string; onDone: () => void }) {
  const { log, done } = useInitialSync(pubkey);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    setSyncGateActive(true);
    markBootPainted();
    return () => setSyncGateActive(false);
  }, []);

  useEffect(() => {
    if (!done) return;
    const beat = setTimeout(() => setLeaving(true), 350);
    const unmount = setTimeout(onDone, 850);
    return () => {
      clearTimeout(beat);
      clearTimeout(unmount);
    };
  }, [done, onDone]);

  useEffect(() => {
    if (leaving) setSyncGateActive(false);
  }, [leaving]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6 transition-opacity duration-500 ${
        leaving ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <CchatLogo size={76} />
        <h1 className="text-xl font-bold tracking-tight text-foreground">Cchat</h1>
        <p className="text-sm text-muted-foreground">
          {done ? (
            <FormattedMessage id="cchat.syncGate.done" defaultMessage="Sync complete" />
          ) : (
            <FormattedMessage id="cchat.syncGate.syncing" defaultMessage="Syncing encrypted messages…" />
          )}
        </p>
      </div>

      {log.length > 0 && (
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 space-y-2.5">
          {log.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-foreground/90">{line.text}</span>
              {line.status !== undefined ? (
                <span className="inline-flex items-center gap-1 shrink-0 font-medium text-emerald-500">
                  <Check className="size-3.5" />
                  {line.status}
                </span>
              ) : (
                <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default SyncGate;
