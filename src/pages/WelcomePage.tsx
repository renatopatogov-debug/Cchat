import { Lock, ShieldCheck, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormattedMessage } from "@/i18n";
import { lazyWithReload } from "@/lib/chunkReload";
import { peekPendingJoin } from "@/lib/joinLink";
import { TERMS_ACCEPTED_KEY, termsNeeded } from "@/lib/platform";

/**
 * Tela de boas-vindas estilo Signal para o Cchat.
 * Mantém o contrato síncrono (eager) testado por WelcomePage.eager.test.tsx
 * (botão com `landingPage.join` renderizado no primeiro frame e LoginScreen /
 * SignupWizard carregados sob demanda).
 */

const LoginScreen = lazy(lazyWithReload(() => import("@/components/auth/LoginScreen")));

const SignupWizard = lazy(
  lazyWithReload(() => import("@/pages/SignupWizard").then((m) => ({ default: m.SignupWizard }))),
);

function CchatWelcomeLogo({ size = 84 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label="Cchat"
      className="drop-shadow-[0_10px_28px_rgba(44,107,237,0.3)]"
    >
      <rect width="128" height="128" rx="32" fill="#2C6BED" />
      <g transform="translate(8 8) scale(0.875)">
        <path
          d="M47.2 97.3 A40 40 0 1 0 30.7 80.8 L22.5 104.5 L47.2 97.3 Z"
          stroke="#FFFFFF"
          strokeWidth={8.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx={66} cy={62} r={9.5} fill="#FFFFFF" />
      </g>
    </svg>
  );
}

export function WelcomePage() {
  const [joinOpen, setJoinOpen] = useState(false);
  const [loginMounted, setLoginMounted] = useState(false);
  const [wizardActive, setWizardActive] = useState(() => !!peekPendingJoin());
  const [requireTermsCheck] = useState(() => termsNeeded());
  const [termsChecked, setTermsChecked] = useState(() => !termsNeeded());

  const persistTermsIfNeeded = useCallback(() => {
    if (!requireTermsCheck) return;
    try {
      localStorage.setItem(TERMS_ACCEPTED_KEY, "1");
    } catch {
      // ignora em ambiente restrito
    }
  }, [requireTermsCheck]);

  const openSignup = useCallback(() => {
    if (!termsChecked) return;
    persistTermsIfNeeded();
    setWizardActive(true);
  }, [termsChecked, persistTermsIfNeeded]);

  const openLogin = useCallback(() => {
    if (!termsChecked) return;
    persistTermsIfNeeded();
    setLoginMounted(true);
    setJoinOpen(true);
  }, [termsChecked, persistTermsIfNeeded]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void import("@/components/auth/LoginScreen").catch(() => undefined);
      void import("@/pages/SignupWizard").catch(() => undefined);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (wizardActive) {
    return (
      <Suspense fallback={null}>
        <SignupWizard onExit={() => setWizardActive(false)} />
      </Suspense>
    );
  }

  return (
    <main className="relative flex h-full w-full flex-col items-center justify-between overflow-y-auto bg-background px-6 py-10 text-foreground safe-area-top safe-area-bottom">
      <div className="w-full max-w-sm" />

      <div className="flex max-w-sm flex-col items-center text-center space-y-5">
        <CchatWelcomeLogo size={84} />

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Cchat</h1>
          <p className="text-base font-medium text-foreground/90">
            <FormattedMessage
              id="cchat.welcome.tagline"
              defaultMessage="Privacy that protects your conversations and your money."
            />
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            <FormattedMessage
              id="cchat.welcome.subtitle"
              defaultMessage="No phone number needed. End-to-end encrypted messaging, non-custodial BRZ wallet, and delivery escrow codes."
            />
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full pt-1 text-[11px] text-muted-foreground">
          <div className="rounded-2xl border border-border bg-card p-2.5 flex flex-col items-center gap-1">
            <Lock className="size-4 text-primary" />
            <span>
              <FormattedMessage id="cchat.welcome.badgeE2ee" defaultMessage="End-to-end" />
            </span>
          </div>
          <div className="rounded-2xl border border-border bg-card p-2.5 flex flex-col items-center gap-1">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>
              <FormattedMessage id="cchat.welcome.badgeEscrow" defaultMessage="BRZ Escrow" />
            </span>
          </div>
          <div className="rounded-2xl border border-border bg-card p-2.5 flex flex-col items-center gap-1">
            <WifiOff className="size-4 text-sky-400" />
            <span>
              <FormattedMessage id="cchat.welcome.badgeMesh" defaultMessage="Offline Mesh" />
            </span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-3 pb-2">
        {requireTermsCheck ? (
          <label className="flex items-start gap-2.5 rounded-2xl border border-border bg-card/70 px-3.5 py-2.5 text-left text-xs text-muted-foreground cursor-pointer">
            <Checkbox
              checked={termsChecked}
              onCheckedChange={(v) => setTermsChecked(v === true)}
              className="mt-0.5"
            />
            <span>
              <FormattedMessage id="cchat.welcome.termsAgreePrefix" defaultMessage="I agree to the" />{" "}
              <a href="/terms" className="text-primary hover:underline">
                <FormattedMessage id="cchat.welcome.termsOfUse" defaultMessage="Terms of Service" />
              </a>{" "}
              <FormattedMessage id="cchat.welcome.andWord" defaultMessage="and" />{" "}
              <a href="/privacy" className="text-primary hover:underline">
                <FormattedMessage id="cchat.welcome.privacyPolicy" defaultMessage="Privacy Policy" />
              </a>
              .
            </span>
          </label>
        ) : (
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            <FormattedMessage id="cchat.welcome.termsContinuePrefix" defaultMessage="By continuing, you agree to the" />{" "}
            <a href="/terms" className="text-primary hover:underline">
              <FormattedMessage id="cchat.welcome.termsOfUse" defaultMessage="Terms of Service" />
            </a>{" "}
            <FormattedMessage id="cchat.welcome.andWord" defaultMessage="and" />{" "}
            <a href="/privacy" className="text-primary hover:underline">
              <FormattedMessage id="cchat.welcome.privacyShort" defaultMessage="Privacy" />
            </a>
            .
          </p>
        )}

        <Button
          type="button"
          size="lg"
          disabled={!termsChecked}
          onClick={openSignup}
          className="h-12 w-full rounded-full text-sm font-semibold shadow-sm"
        >
          <FormattedMessage id="cchat.welcome.createAccount" defaultMessage="Create account" />
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={!termsChecked}
          onClick={openLogin}
          className="h-12 w-full rounded-full text-sm font-medium"
        >
          <FormattedMessage id="landingPage.join" defaultMessage="Join" />
        </Button>
      </div>

      {loginMounted && (
        <Suspense fallback={null}>
          <LoginScreen
            isOpen={joinOpen}
            onClose={() => setJoinOpen(false)}
            onLogin={() => setJoinOpen(false)}
            onSignupClick={() => {
              setJoinOpen(false);
              setWizardActive(true);
            }}
          />
        </Suspense>
      )}
    </main>
  );
}

export default WelcomePage;
