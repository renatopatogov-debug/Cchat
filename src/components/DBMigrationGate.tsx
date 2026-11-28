import { useNostrLogin } from "@nostrify/react/login";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { CchatLogo } from "@/components/brand/CchatLogo";
import type { SyncLogLine } from "@/hooks/useInitialSync";
import { t } from "@/i18n";
import { markUpToDate, pendingUpgrades, runMigrations } from "@/lib/db/migrations";

/**
 * Full-screen storage-upgrade overlay while schema migrations (`db/schema.ts`)
 * run for every logged-in account. Renders nothing when on-disk data already
 * matches this build.
 */
export function DBMigrationGate() {
  const { logins } = useNostrLogin();
  const [active, setActive] = useState(false);
  const [log, setLog] = useState<SyncLogLine[]>([]);
  const started = useRef(false);

  const accounts = logins.map((l) => l.pubkey);
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let cancelled = false;
    void (async () => {
      const pending = await pendingUpgrades().catch(() => null);
      if (cancelled || !pending) return;

      if (pending.future) return;

      if (pending.schema.length === 0) {
        await markUpToDate().catch(() => undefined);
        return;
      }

      setActive(true);
      setLog([
        {
          id: "open",
          text: t({ id: "dbMigrationGate.upgrading", defaultMessage: "upgrading local storage" }),
          tone: "info",
        },
      ]);

      await runMigrations(accountsRef.current, ({ label, done, total }) => {
        if (cancelled) return;
        setLog((prev) => [
          ...prev.map((l) => (l.status === undefined ? { ...l, status: "OK", tone: "ok" as const } : l)),
          { id: `${label}:${done}`, text: label.toLowerCase(), status: `${done}/${total}` },
        ]);
      });

      if (cancelled) return;
      setLog((prev) => [
        ...prev.map((l) => (l.status === undefined ? { ...l, status: "OK", tone: "ok" as const } : l)),
        {
          id: "done",
          text: t({ id: "dbMigrationGate.done", defaultMessage: "storage upgraded" }),
          status: "OK",
          tone: "ok",
        },
      ]);
      setTimeout(() => {
        if (!cancelled) setActive(false);
      }, 500);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background px-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <CchatLogo size={76} />
        <h1 className="text-xl font-bold tracking-tight text-foreground">Cchat</h1>
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

export default DBMigrationGate;
