import { Bell, Loader2, MessageCircle, Settings, Users, Wallet } from "lucide-react";
import { lazy, Suspense, useContext, useEffect, useRef, type ReactNode } from "react";
import { matchPath, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { AppsProvider } from "@/components/AppsProvider";
import { LoginArea } from "@/components/auth/LoginArea";
import { CallProvider } from "@/components/CallProvider";
import { DmCallProvider } from "@/components/DmCallProvider";
import { SignalBottomNav } from "@/components/layout/SignalBottomNav";
import { QuickSwitcher } from "@/components/QuickSwitcher";
import { DirectInviteNotifier } from "@/concord/components/DirectInviteNotifier";
import { useRegisterAllStreamKeys } from "@/concord/hooks/useStreamAuth";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { useHasUnreadDMs } from "@/hooks/useDirectMessages";
import { useShareShortcuts } from "@/hooks/useShareShortcuts";
import { common, useIntl } from "@/i18n";
import { lazyWithReload } from "@/lib/chunkReload";
import { ProfileOverlayContext } from "@/lib/profileOverlay";
import { SettingsOverlayContext, type SettingsOverlay } from "@/lib/settingsOverlay";
import { cn } from "@/lib/utils";

// Lazy: most sessions never open a profile or settings panel.
const ProfileDialog = lazy(
  lazyWithReload(() =>
    import("@/components/profile/ProfileDialog").then((m) => ({ default: m.ProfileDialog })),
  ),
);
const SettingsPage = lazy(
  lazyWithReload(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))),
);

function ProfileOverlayFallback({ onDismiss }: { onDismiss?: () => void }) {
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0"
      onClick={onDismiss}
    >
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function RoutePaneFallback() {
  const intl = useIntl();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-background"
      role="status"
      aria-label={intl.formatMessage({ id: "mainLayout.loadingPage", defaultMessage: "Loading page" })}
    >
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function SettingsOverlayPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const intl = useIntl();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && previous !== document.body && previous.isConnected && !previous.closest("[inert]")) {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  useAndroidBack(() => {
    onCloseRef.current();
    return true;
  }, true, "overlay");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) return;
      const panel = panelRef.current;
      const stacked = document.querySelectorAll(
        "[role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']",
      );
      if (Array.from(stacked).some((el) => el !== panel && !panel?.contains(el))) return;
      onCloseRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={intl.formatMessage(common.settings)}
      tabIndex={-1}
      className="absolute inset-0 z-20 flex bg-background outline-none"
    >
      {children}
    </div>
  );
}

function SignalDesktopSidebar({
  pathname,
  settings,
  unreadCount,
}: {
  pathname: string;
  settings: SettingsOverlay;
  unreadCount: number;
}) {
  const intl = useIntl();
  const navItems = [
    {
      to: "/dm",
      label: intl.formatMessage({ id: "cchat.nav.chats", defaultMessage: "Chats" }),
      icon: MessageCircle,
      active: !settings.open && (pathname.startsWith("/dm") || pathname.startsWith("/mesh")),
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      to: "/wallet",
      label: intl.formatMessage({ id: "cchat.nav.wallet", defaultMessage: "Wallet" }),
      icon: Wallet,
      active: !settings.open && pathname.startsWith("/wallet"),
    },
    {
      to: "/communities",
      label: intl.formatMessage({ id: "cchat.nav.groups", defaultMessage: "Groups" }),
      icon: Users,
      active:
        !settings.open &&
        (pathname.startsWith("/communities") ||
          pathname.startsWith("/create") ||
          pathname.startsWith("/c/") ||
          pathname.startsWith("/cc/") ||
          pathname.startsWith("/s/") ||
          pathname.startsWith("/invites") ||
          pathname.startsWith("/invite/")),
    },
    {
      to: "/notifications",
      label: intl.formatMessage({ id: "cchat.nav.notifications", defaultMessage: "Notifications" }),
      icon: Bell,
      active: !settings.open && pathname.startsWith("/notifications"),
    },
  ];

  return (
    <aside
      aria-label={intl.formatMessage({ id: "cchat.nav.sidebarAria", defaultMessage: "Main menu" })}
      className="hidden sidebar:flex w-52 lg:w-56 shrink-0 flex-col border-r border-border bg-chrome select-none"
    >
      <div className="flex items-center gap-2.5 px-4 pt-[calc(0.875rem+var(--safe-area-inset-top,env(safe-area-inset-top,0px)))] pb-3">
        <svg
          width="30"
          height="30"
          viewBox="0 0 128 128"
          fill="none"
          aria-hidden="true"
          className="shrink-0 rounded-xl shadow-sm"
        >
          <rect width="128" height="128" rx="32" fill="#2C6BED" />
          <g transform="translate(8 8) scale(0.875)">
            <path
              d="M47.2 97.3 A40 40 0 1 0 30.7 80.8 L22.5 104.5 L47.2 97.3 Z"
              stroke="#FFFFFF"
              strokeWidth="9"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="66" cy="62" r="9.5" fill="#FFFFFF" />
          </g>
        </svg>
        <span className="text-base font-bold tracking-tight text-foreground">Cchat</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2.5 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => {
                if (settings.open) settings.close();
              }}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                item.active
                  ? "bg-primary/15 text-primary font-semibold"
                  : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground font-medium",
              )}
            >
              <Icon className="size-5 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge !== undefined && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border/60 px-2.5 pt-2.5 pb-[calc(0.5rem+var(--safe-area-pad-bottom-tight,0px))] space-y-2">
        <button
          type="button"
          aria-pressed={settings.open}
          onClick={() => (settings.open ? settings.close() : settings.show())}
          className={cn(
            "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors text-left",
            settings.open
              ? "bg-primary/15 text-primary font-semibold"
              : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground font-medium",
          )}
        >
          <Settings className="size-5 shrink-0" />
          <span className="flex-1 truncate">{intl.formatMessage(common.settings)}</span>
        </button>

        <div className="px-0.5">
          <LoginArea className="w-full flex" />
        </div>
      </div>
    </aside>
  );
}

/**
 * Signal-inspired application frame for authenticated routes:
 * - Desktop (`>= 900px`): fixed clean left sidebar (Chats, Wallet, Communities, Notifications, Settings, Account).
 * - Mobile (`< 900px`): bottom tab bar rendered exclusively on top-level tabs (`/dm`, `/wallet`, `/communities`).
 * Preserves CallProvider, DmCallProvider, AppsProvider, StreamAuth, ShareShortcuts, ProfileDialog, and SettingsPage overlays.
 */
export function AppShell() {
  useRegisterAllStreamKeys();
  useShareShortcuts();

  const navigate = useNavigate();
  const location = useLocation();
  const hasUnreadDms = useHasUnreadDMs();
  const { pubkey: overlayPubkey, opening } = useContext(ProfileOverlayContext);
  const settings = useContext(SettingsOverlayContext);

  const isTopLevelTab = Boolean(
    matchPath({ path: "/dm", end: true }, location.pathname) ||
      matchPath({ path: "/wallet", end: true }, location.pathname) ||
      matchPath({ path: "/communities", end: true }, location.pathname),
  );
  const showBottomNav = isTopLevelTab && !settings.open && !overlayPubkey;
  const unreadCount = hasUnreadDms ? 1 : 0;

  return (
    <CallProvider>
      <DmCallProvider>
        <AppsProvider>
          <SignalDesktopSidebar
            pathname={location.pathname}
            settings={settings}
            unreadCount={unreadCount}
          />
          <div className="relative flex min-w-0 min-h-0 flex-1 flex-col">
            <div className="relative flex min-w-0 min-h-0 flex-1">
              <div className="contents" inert={settings.open || undefined}>
                <Suspense fallback={<RoutePaneFallback />}>
                  <Outlet />
                </Suspense>
              </div>
              {opening && !overlayPubkey && <ProfileOverlayFallback />}
              {overlayPubkey && (
                <Suspense fallback={<ProfileOverlayFallback onDismiss={() => navigate(-1)} />}>
                  <ProfileDialog pubkey={overlayPubkey} onClose={() => navigate(-1)} />
                </Suspense>
              )}
            </div>
            {showBottomNav && <SignalBottomNav unreadCount={unreadCount} />}
            {settings.open && (
              <SettingsOverlayPanel onClose={settings.close}>
                <Suspense fallback={<RoutePaneFallback />}>
                  <SettingsPage section={settings.section} onClose={settings.close} />
                </Suspense>
              </SettingsOverlayPanel>
            )}
          </div>
          <DirectInviteNotifier />
          <QuickSwitcher />
        </AppsProvider>
      </DmCallProvider>
    </CallProvider>
  );
}
