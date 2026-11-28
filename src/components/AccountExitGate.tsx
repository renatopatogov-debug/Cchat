import { Check, Loader2 } from "lucide-react";

import { useAccountExit } from "@/components/accountExitState";
import { CchatLogo } from "@/components/brand/CchatLogo";
import { useIntl } from "@/i18n";

/**
 * Full-screen account-exit overlay reporting each teardown step cleanly.
 */
export function AccountExitGate() {
  const intl = useIntl();
  const exit = useAccountExit();
  if (!exit) return null;

  const { kind, log } = exit;
  const subtitle =
    kind === "logout"
      ? intl.formatMessage({ id: "cchat.exitGate.logout", defaultMessage: "Signing out securely…" })
      : intl.formatMessage({ id: "cchat.exitGate.switch", defaultMessage: "Switching account…" });

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <CchatLogo size={76} />
        <h1 className="text-xl font-bold tracking-tight text-foreground">Cchat</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
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

export default AccountExitGate;
