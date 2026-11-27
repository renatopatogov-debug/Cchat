import { useEffect, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { common, useIntl } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Full-screen Signal-style step container for signup, login, and post-login setup.
 * `stepKey` differs per step so the transition replays smoothly.
 */
export function WizardShell({
  index,
  total,
  stepKey,
  maxWidth = "max-w-sm",
  zClassName = "z-50",
  onBack,
  onClose,
  children,
}: {
  index: number;
  /** Number of steps. `0` means single-screen: no progress bar. */
  total: number;
  stepKey: string;
  maxWidth?: "max-w-sm" | "max-w-md" | "max-w-xl";
  /** Stacking layer. Post-login flow sits above Radix dialogs (`z-[250]`) so queued dialogs can't cover a step. */
  zClassName?: string;
  onBack?: () => void;
  onClose?: () => void;
  children: ReactNode;
}) {
  const intl = useIntl();
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useAndroidBack(() => {
    (onBack ?? onClose)?.();
    return true;
  }, true, "overlay");

  const pct = total > 0 ? ((index + 1) / total) * 100 : 100;
  return (
    <div className={cn("fixed inset-0 flex flex-col bg-background", zClassName)}>
      {total > 0 && (
        <div className="relative z-10 h-1 shrink-0 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <div className="relative z-20 flex shrink-0 items-center justify-between px-3 pt-2 safe-area-top">
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 touch:size-11 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onBack}
            aria-label={intl.formatMessage(common.back)}
          >
            <ArrowLeft className="size-5" />
          </Button>
        ) : (
          <div className="size-9 touch:size-11" />
        )}
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 touch:size-11 rounded-full text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label={intl.formatMessage(common.close)}
          >
            <X className="size-5" />
          </Button>
        ) : (
          <div className="size-9 touch:size-11" />
        )}
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div
          key={stepKey}
          className={cn(
            "mx-auto flex min-h-full w-full flex-col justify-center gap-6 px-6 pb-12 pt-4 safe-area-bottom",
            "animate-in fade-in slide-in-from-right-4 duration-300",
            maxWidth,
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** Common step body: glyph, heading, paragraph, actions. */
export function WizardStepBody({
  glyph,
  title,
  description,
  children,
}: {
  glyph: ReactNode;
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {glyph}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
