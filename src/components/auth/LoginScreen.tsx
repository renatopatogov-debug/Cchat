// NOTE: Preserves all existing auth handlers (nsec, bunker://, NIP-07, NIP-46, Android NIP-55, CredentialManager).

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, Copy, ExternalLink, FileUp, Loader2, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SignupTerms } from '@/components/onboarding/SignupTerms';
import { WizardShell } from '@/components/onboarding/WizardShell';
import { TermsGate } from '@/components/onboarding/TermsGate';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import {
  useLoginActions,
  generateNostrConnectParams,
  generateNostrConnectURI,
  type NostrConnectParams,
  type NostrConnectStatus,
} from '@/hooks/useLoginActions';
import { AndroidSignerOptions } from '@/components/auth/AndroidSignerOptions';
import { getNsecCredential } from '@/lib/credentialManager';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { APP_NAME } from '@/lib/platform';
import { shareOrigin } from '@/lib/shareOrigin';
import { withConnectPerms } from '@/lib/nostrConnectPerms';
import { toast } from '@/hooks/useToast';
import { writeClipboardText } from '@/lib/clipboard';
import { common, FormattedMessage, t, useIntl, type IntlShape } from '@/i18n';
import { cn } from '@/lib/utils';

interface LoginScreenProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignupClick?: () => void;
}

const validateNsec = (nsec: string) => {
  return /^nsec1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/.test(nsec);
};

const nsecRejectionMessage = (input: string) => {
  return input.startsWith('nsec1')
    ? t({ id: 'loginScreen.incompleteNsec', defaultMessage: "That doesn't look like a complete secret key. Check you copied the whole nsec." })
    : t({ id: 'loginScreen.enterKey', defaultMessage: 'Enter a secret key starting with nsec1, or a bunker:// URI.' });
};

const isMobileDevice = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const validateBunkerUri = (uri: string) => {
  return uri.startsWith('bunker://');
};

const connectStatusLabel = (intl: IntlShape, status: NostrConnectStatus | null): string => {
  switch (status) {
    case 'awaiting-connect':
      return intl.formatMessage({ id: 'loginScreen.awaitingConnect', defaultMessage: 'Waiting for signer connection…' });
    case 'getting-public-key':
      return intl.formatMessage({ id: 'loginScreen.gettingPublicKey', defaultMessage: 'Getting public key…' });
    default:
      return '';
  }
};

function CchatAuthMark({ size = 72 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label="Cchat"
      className="drop-shadow-[0_10px_24px_rgba(44,107,237,0.28)]"
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

/**
 * Signal-style login takeover inside `WizardShell`: single primary field for
 * secret key or bunker:// signer link, with technical methods collapsed under
 * "Opções avançadas".
 */
const LoginScreen: React.FC<LoginScreenProps> = ({ isOpen, onClose, onLogin, onSignupClick }) => {
  const callbackOrigin = shareOrigin();
  const intl = useIntl();
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [loginInput, setLoginInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [extensionError, setExtensionError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string>('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectStatus, setConnectStatus] = useState<NostrConnectStatus | null>(null);
  const [hasOpenedSigner, setHasOpenedSigner] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [copiedConnectUri, setCopiedConnectUri] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const login = useLoginActions();
  const { currentUser } = useLoggedInAccounts();

  const onLoginRef = useRef(onLogin);
  const onCloseRef = useRef(onClose);
  const loginRef = useRef(login);
  useEffect(() => { onLoginRef.current = onLogin; }, [onLogin]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { loginRef.current = login; }, [login]);

  const [isMobile] = useState(isMobileDevice);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimerRef.current), []);
  const hasExtension = 'nostr' in window;

  const generateConnectSession = useCallback((): string => {
    const relayUrls = login.getRelayUrls();
    const params = generateNostrConnectParams(relayUrls);
    const uri = withConnectPerms(generateNostrConnectURI(params, {
      name: APP_NAME,
      callback: isMobile ? `${callbackOrigin}/remoteloginsuccess` : undefined,
    }));
    setNostrConnectParams(params);
    setNostrConnectUri(uri);
    setConnectError(null);
    return uri;
  }, [login, callbackOrigin, isMobile]);

  useEffect(() => {
    if (!nostrConnectParams) return;

    const startListening = async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await loginRef.current.nostrconnect(
          nostrConnectParams,
          controller.signal,
          (status) => {
            if (controller.signal.aborted) return;
            setConnectStatus(status);
          },
        );
        if (controller.signal.aborted) return;
        onLoginRef.current();
        onCloseRef.current();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('Nostrconnect failed:', error);
        setConnectStatus(null);
        setConnectError(error instanceof Error ? error.message : String(error));
      }
    };

    startListening();
  }, [nostrConnectParams]);

  useEffect(() => {
    if (!isOpen) {
      setLoginInput('');
      setLoginError('');
      setExtensionError('');
      setAdvancedOpen(false);
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setConnectError(null);
      setConnectStatus(null);
      setHasOpenedSigner(false);
      setShowQr(false);
      setCopiedConnectUri(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen]);

  const handleConnectCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setConnectError(null);
    setConnectStatus(null);
    setHasOpenedSigner(false);
    setShowQr(false);
    setCopiedConnectUri(false);
  }, []);

  const handleShowQr = () => {
    if (!nostrConnectParams) generateConnectSession();
    setShowQr(true);
  };

  const handleOpenSignerApp = () => {
    const uri = nostrConnectUri || generateConnectSession();
    setHasOpenedSigner(true);
    if (!isMobile) setShowQr(true);
    window.location.href = uri;
  };

  const copyConnectUri = async () => {
    try {
      await writeClipboardText(nostrConnectUri);
      setCopiedConnectUri(true);
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopiedConnectUri(false), 2000);
      toast({
        title: t({ id: 'loginScreen.linkCopied', defaultMessage: 'Link copied' }),
        description: t({ id: 'loginScreen.linkCopiedDescription', defaultMessage: 'Paste it into your signer app.' }),
      });
    } catch {
      toast({
        title: t({ id: 'loginScreen.copyFailed', defaultMessage: 'Copy failed' }),
        description: t({ id: 'loginScreen.copyFailedDescription', defaultMessage: 'Could not copy to the clipboard. Select the link and copy it manually.' }),
        variant: 'destructive',
      });
    }
  };

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setExtensionError('');

    try {
      if (!('nostr' in window)) {
        throw new Error(t({ id: 'loginScreen.extensionMissing', defaultMessage: 'Nostr extension not found. Please install a NIP-07 extension.' }));
      }
      await login.extension();
      onLogin();
      onClose();
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Extension login failed:', error);
      setExtensionError(error instanceof Error ? error.message : t({ id: 'loginScreen.extensionFailed', defaultMessage: 'Extension login failed' }));
    } finally {
      setIsLoading(false);
    }
  };

  const executeLogin = (key: string) => {
    setIsLoading(true);
    setLoginError('');

    setTimeout(async () => {
      try {
        await login.nsec(key);
        onLogin();
        onClose();
      } catch {
        setLoginError(t({ id: 'loginScreen.nsecFailed', defaultMessage: "Failed to login with this key. Please check that it's correct." }));
        setIsLoading(false);
      }
    }, 50);
  };

  const handleLogin = async () => {
    const input = loginInput.trim();
    if (!input) {
      setLoginError(t({ id: 'loginScreen.enterKeyOrBunker', defaultMessage: 'Please enter your secret key or bunker URI' }));
      return;
    }

    if (validateBunkerUri(input)) {
      setIsLoading(true);
      setLoginError('');
      try {
        await login.bunker(input);
        onLogin();
        onClose();
        setLoginInput('');
      } catch {
        setLoginError(t({ id: 'loginScreen.bunkerFailed', defaultMessage: 'Failed to connect. Check the bunker URI.' }));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!validateNsec(input)) {
      setLoginError(nsecRejectionMessage(input));
      return;
    }
    executeLogin(input);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setLoginError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      setIsFileLoading(false);
      const content = event.target?.result as string;
      const trimmedContent = content?.trim();
      if (trimmedContent && validateNsec(trimmedContent)) {
        executeLogin(trimmedContent);
      } else if (trimmedContent) {
        setLoginError(t({ id: 'loginScreen.fileInvalid', defaultMessage: 'File does not contain a valid secret key.' }));
      } else {
        setLoginError(t({ id: 'loginScreen.fileUnreadable', defaultMessage: 'Could not read file content.' }));
      }
    };
    reader.onerror = () => {
      setIsFileLoading(false);
      setLoginError(t({ id: 'loginScreen.fileReadFailed', defaultMessage: 'Failed to read file.' }));
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    if (!isOpen || currentUser) return;
    let cancelled = false;

    getNsecCredential().then((cred) => {
      if (cancelled || !cred) return;
      if (validateNsec(cred.nsec)) {
        executeLogin(cred.nsec);
      }
    });

    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const showProgressView = connectStatus !== null && (
    connectStatus === 'getting-public-key' ||
    (isMobile && hasOpenedSigner)
  );

  if (!isOpen) return null;

  const view = connectError ? 'error' : showProgressView ? 'progress' : showQr ? 'qr' : 'form';
  const joinMode = !!onSignupClick && view === 'form';

  return createPortal(
    <WizardShell index={0} total={0} stepKey={view} zClassName="z-[255]" onClose={onClose}>
      <TermsGate>
        <div className="flex flex-col items-center gap-6 text-center">
          <CchatAuthMark size={72} />

          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {joinMode ? (
                <FormattedMessage id="loginScreen.joinTitle" defaultMessage="join {app}" values={{ app: APP_NAME }} />
              ) : (
                <FormattedMessage id="loginScreen.logInTitle" defaultMessage="log in" />
              )}
            </h1>
            {joinMode && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                <FormattedMessage id="loginScreen.joinDescription" defaultMessage="Create a new account, or log in with a key you already have." />
              </p>
            )}
          </div>

          <div className="w-full space-y-4 text-left">
            {connectError ? (
              <div className="flex flex-col items-center space-y-3 py-4">
                <p className="text-sm text-destructive text-center">{connectError}</p>
                <Button variant="outline" onClick={handleConnectCancel} className="rounded-full px-6">
                  <FormattedMessage {...common.tryAgain} />
                </Button>
              </div>
            ) : showProgressView ? (
              <div className="flex flex-col items-center space-y-4 py-6 w-full">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground text-center min-h-[1.25rem]">
                  {connectStatusLabel(intl, connectStatus) || intl.formatMessage({ id: 'loginScreen.waitingForSigner', defaultMessage: 'Waiting for your signer…' })}
                </p>
                <button
                  type="button"
                  onClick={handleConnectCancel}
                  className="text-sm text-primary hover:underline underline-offset-4 font-medium"
                >
                  <FormattedMessage {...common.cancel} />
                </button>
              </div>
            ) : showQr ? (
              <div className="flex flex-col items-center space-y-4">
                {nostrConnectUri ? (
                  <div className="p-4 bg-white rounded-2xl shadow-sm">
                    <QRCodeCanvas value={nostrConnectUri} size={180} level="M" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[180px]">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}
                <p className="text-sm text-muted-foreground text-center">
                  <FormattedMessage id="loginScreen.scanQr" defaultMessage="Scan with a signer app to log in, or copy the link if your signer is on this device." />
                </p>
                {nostrConnectUri && (
                  <div className="relative w-full">
                    <Input
                      readOnly
                      value={nostrConnectUri}
                      aria-label={intl.formatMessage({ id: 'loginScreen.connectLink', defaultMessage: 'Signer connect link' })}
                      className="pr-12 text-xs bg-card border-border rounded-xl"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full w-10 touch:w-11 rounded-xl text-muted-foreground hover:bg-muted/60"
                      onClick={copyConnectUri}
                      aria-label={copiedConnectUri ? intl.formatMessage({ id: 'loginScreen.linkCopied', defaultMessage: 'Link copied' }) : intl.formatMessage(common.copyLink)}
                      title={copiedConnectUri ? intl.formatMessage(common.copied) : intl.formatMessage(common.copyLink)}
                    >
                      {copiedConnectUri ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleConnectCancel}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  <FormattedMessage {...common.back} />
                </button>
              </div>
            ) : (
              <>
                <form onSubmit={(e) => { e.preventDefault(); void handleLogin(); }} className="space-y-3">
                  <div className="space-y-1.5">
                    <label htmlFor="cchat-login-key" className="text-xs font-medium text-foreground">
                      <FormattedMessage id="cchat.login.keyLabel" defaultMessage="Paste your secret key or signer link" />
                    </label>
                    <Input
                      id="cchat-login-key"
                      type="password"
                      value={loginInput}
                      onChange={(e) => {
                        setLoginInput(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      aria-label={intl.formatMessage({ id: 'loginScreen.inputPlaceholder', defaultMessage: 'nsec1… or bunker://…' })}
                      placeholder={intl.formatMessage({ id: 'cchat.login.keyPlaceholder', defaultMessage: 'Secret key (nsec1…) or bunker://… link' })}
                      autoComplete="off"
                      className={cn(
                        'h-12 rounded-xl bg-card border-border',
                        loginError && 'border-destructive focus-visible:ring-destructive',
                      )}
                    />
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      <FormattedMessage
                        id="cchat.login.keyHint"
                        defaultMessage="Your secret key is your account's private code (starts with nsec1). Keys and remote signer links are detected automatically."
                      />
                    </p>
                  </div>

                  {loginError && <p className="text-sm text-destructive">{loginError}</p>}

                  <Button
                    type="submit"
                    size="lg"
                    disabled={isLoading || isFileLoading || !loginInput.trim()}
                    className="h-12 w-full rounded-full text-sm font-semibold"
                  >
                    {isLoading ? (
                      <FormattedMessage id="loginScreen.loggingIn" defaultMessage="Logging in…" />
                    ) : (
                      <FormattedMessage id="loginScreen.logIn" defaultMessage="Log in" />
                    )}
                  </Button>
                </form>

                <input
                  type="file"
                  accept=".txt"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-2xl border border-border bg-card/60">
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      aria-label={intl.formatMessage({ id: 'loginScreen.moreOptions', defaultMessage: 'More login options' })}
                      className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span>
                        <FormattedMessage id="cchat.login.advancedOptions" defaultMessage="Advanced options (QR, file, or extension)" />
                      </span>
                      <ChevronDown className={cn('size-4 transition-transform duration-200', advancedOpen && 'rotate-180')} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-3 space-y-2 border-t border-border/60 pt-3">
                    <AndroidSignerOptions onLogin={() => { onLogin(); onClose(); }} />

                    {hasExtension && (
                      <div className="space-y-2">
                        {extensionError && (
                          <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>{extensionError}</AlertDescription>
                          </Alert>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full h-10 rounded-full text-xs font-medium"
                          onClick={() => void handleExtensionLogin()}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <FormattedMessage id="loginScreen.loggingInDots" defaultMessage="Logging in..." />
                          ) : (
                            <FormattedMessage id="loginScreen.logInWithExtension" defaultMessage="Log in with Extension" />
                          )}
                        </Button>
                        <div className="flex items-center gap-3 py-1">
                          <div className="h-px flex-1 bg-border" />
                          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                            <FormattedMessage id="loginScreen.or" defaultMessage="or" />
                          </span>
                          <div className="h-px flex-1 bg-border" />
                        </div>
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isFileLoading}
                      className="w-full justify-start gap-2 rounded-xl text-xs"
                    >
                      <FileUp className="h-4 w-4 text-muted-foreground" />
                      <FormattedMessage id="loginScreen.selectKeyFile" defaultMessage="Select key file" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleShowQr}
                      className="w-full justify-start gap-2 rounded-xl text-xs"
                    >
                      <QrCode className="h-4 w-4 text-muted-foreground" />
                      <FormattedMessage id="loginScreen.connectRemoteSigner" defaultMessage="Connect remote signer" />
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleOpenSignerApp}
                      className="w-full justify-start gap-2 rounded-xl text-xs"
                    >
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      <FormattedMessage id="loginScreen.openSignerApp" defaultMessage="Open signer app" />
                    </Button>
                  </CollapsibleContent>
                </Collapsible>

                {joinMode && onSignupClick && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs text-muted-foreground">
                        <FormattedMessage id="loginScreen.orLogIn" defaultMessage="or log in" />
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full rounded-full text-sm font-medium text-primary"
                      onClick={() => { onClose(); onSignupClick(); }}
                    >
                      <FormattedMessage id="loginScreen.createAccount" defaultMessage="Create account" />
                    </Button>
                  </div>
                )}

                <SignupTerms action={joinMode ? 'continue' : 'login'} />
              </>
            )}
          </div>
        </div>
      </TermsGate>
    </WizardShell>,
    document.body,
  );
};

export default LoginScreen;
