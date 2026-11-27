import { Lock, ShieldCheck, WifiOff } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { ArmadaCrest } from "@/components/brand/ArmadaCrest";
import { Button } from "@/components/ui/button";
import { FormattedMessage } from "@/i18n";
import { lazyWithReload } from "@/lib/chunkReload";
import { peekPendingJoin } from "@/lib/joinLink";

/**
 * Tela de boas-vindas minimalista estilo Signal para o Cchat.
 * Mantém o contrato síncrono (eager) testado por WelcomePage.eager.test.tsx
 * (botão com `landingPage.join` renderizado no primeiro frame e LoginScreen /
 * SignupWizard carregados sob demanda).
 */

const LoginScreen = lazy(lazyWithReload(() => import("@/components/auth/LoginScreen")));

const SignupWizard = lazy(
  lazyWithReload(() => import("@/pages/SignupWizard").then((m) => ({ default: m.SignupWizard }))),
);

export function WelcomePage() {
  const [joinOpen, setJoinOpen] = useState(false);
  const [loginMounted, setLoginMounted] = useState(false);
  const [wizardActive, setWizardActive] = useState(() => !!peekPendingJoin());

  const openLogin = useCallback(() => {
    setLoginMounted(true);
    setJoinOpen(true);
  }, []);

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
    <main className="relative flex h-full w-full flex-col items-center justify-between overflow-y-auto bg-background px-6 py-12 text-foreground safe-area-top">
      <div className="w-full max-w-sm" />

      <div className="flex max-w-sm flex-col items-center text-center space-y-5">
        <ArmadaCrest size={88} />

        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Cchat</h1>
          <p className="text-base font-medium text-foreground/90">
            Privacidade que protege suas conversas e seu dinheiro.
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Mensagens criptografadas sem número de telefone, carteira BRZ sem custódia e entregas protegidas com código de confirmação.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 w-full pt-2 text-[11px] text-muted-foreground">
          <div className="rounded-2xl border border-border bg-card p-2.5 flex flex-col items-center gap-1">
            <Lock className="size-4 text-primary" />
            <span>Ponta a ponta</span>
          </div>
          <div className="rounded-2xl border border-border bg-card p-2.5 flex flex-col items-center gap-1">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>Escrow BRZ</span>
          </div>
          <div className="rounded-2xl border border-border bg-card p-2.5 flex flex-col items-center gap-1">
            <WifiOff className="size-4 text-sky-400" />
            <span>Mesh Offline</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-2.5 pb-2">
        <Button
          type="button"
          size="lg"
          onClick={() => setWizardActive(true)}
          className="h-12 w-full rounded-full text-sm font-semibold shadow-md"
        >
          Criar nova conta
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
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
