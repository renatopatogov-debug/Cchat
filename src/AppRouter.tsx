import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams, type Location } from "react-router-dom";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useNotificationNavigation } from "@/hooks/useNotificationNavigation";
import { useShareTargetNavigation } from "@/hooks/useShareTargetNavigation";
import {
  coldLaunchPending,
  consumeColdLaunchDeepLink,
  onColdLaunchResolved,
} from "@/lib/coldLaunchDeepLink";
import {
  coldSharePending,
  consumeColdShareRoute,
  onColdShareResolved,
} from "@/lib/shareTarget";
import { BlankSplash, BootSplash } from "@/components/brand/BootSplash";
import { LocationRefProvider } from "@/components/LocationRefProvider";
import { Nip19Route } from "@/components/Nip19Route";
import { ThemePreviewBar } from "@/components/ThemePreviewBar";
import { VersionCheck } from "@/components/VersionCheck";
import { DesktopUpdateToast } from "@/components/DesktopUpdateToast";
import { Toaster } from "@/components/ui/toaster";
import { useAppContext } from "@/hooks/useAppContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useOnboardingActive } from "@/hooks/useOnboarding";
import { parseJoinLink, setPendingJoin } from "@/lib/joinLink";
import { CONCORD2_PANES } from "@/lib/routes";
import { lazyWithReload } from "@/lib/chunkReload";
import { likelySignedIn } from "@/lib/likelySignedIn";
// Not lazy: the signed-out landing rides in the entry chunk so it paints on mount.
import { WelcomePage } from "@/pages/WelcomePage";
import {
  ProfileOverlayContext,
  profileOverlayPubkey,
  type ProfileBackgroundState,
  type ProfileOverlay,
} from "@/lib/profileOverlay";
import { SettingsOverlayContext, useSettingsOverlayController } from "@/lib/settingsOverlay";
import { isDesktop } from "@/lib/desktop";
import { isNativeRuntime } from "@/lib/platform";
import { markBootPainted } from "@/lib/bootGate";
import { routeOpensBootGate } from "@/lib/bootGateRoute";

// Route-level code splitting. lazyWithReload turns a stale-chunk fetch after a
// deploy into a one-time reload instead of a crash.

// Lazy: nothing in the frame is usable by a signed-out visitor.
const AppShell = lazy(lazyWithReload(() => import("@/components/layout/AppShell").then((m) => ({ default: m.AppShell }))));

// Prefetch the frame on a signed-in launch so lazy AppShell doesn't slow it.
if (likelySignedIn()) {
  void import("@/components/layout/AppShell").catch(() => undefined);
}

const LazySignedInRouterServices = lazy(() =>
  import("@/components/SignedInServices").then((m) => ({ default: m.SignedInRouterServices })),
);

const CreateCommunityPage = lazy(lazyWithReload(() => import("@/pages/CreateCommunityPage").then((m) => ({ default: m.CreateCommunityPage }))));
const DMsPage = lazy(lazyWithReload(() => import("@/pages/DMsPage").then((m) => ({ default: m.DMsPage }))));
const InvitePage = lazy(lazyWithReload(() => import("@/concord/pages/InvitePage")));
const InvitesPage = lazy(lazyWithReload(() => import("@/concord/pages/InvitesPage").then((m) => ({ default: m.InvitesPage }))));
const MeshPage = lazy(lazyWithReload(() => import("@/pages/MeshPage")));
const NotificationsPage = lazy(lazyWithReload(() => import("@/pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage }))));
const NotFound = lazy(lazyWithReload(() => import("@/pages/NotFound").then((m) => ({ default: m.NotFound }))));
const PrivacyPolicyPage = lazy(lazyWithReload(() => import("@/pages/PrivacyPolicyPage").then((m) => ({ default: m.PrivacyPolicyPage }))));
const RemoteLoginSuccessPage = lazy(lazyWithReload(() => import("@/pages/RemoteLoginSuccessPage").then((m) => ({ default: m.RemoteLoginSuccessPage }))));
const SettingsPage = lazy(lazyWithReload(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage }))));
const SharePage = lazy(lazyWithReload(() => import("@/pages/SharePage").then((m) => ({ default: m.SharePage }))));
const SupportPage = lazy(lazyWithReload(() => import("@/pages/SupportPage").then((m) => ({ default: m.SupportPage }))));
const TermsPage = lazy(lazyWithReload(() => import("@/pages/TermsPage").then((m) => ({ default: m.TermsPage }))));
const WalletPage = lazy(lazyWithReload(() => import("@/pages/WalletPage").then((m) => ({ default: m.WalletPage }))));
const CommunitiesHubPage = lazy(lazyWithReload(() => import("@/pages/CommunitiesHubPage").then((m) => ({ default: m.CommunitiesHubPage }))));
const CommunityScreen = lazy(lazyWithReload(() => import("@/pages/CommunityScreen").then((m) => ({ default: m.CommunityScreen }))));

/** Dispatch `/invite/<segment>`: Concord group invites carry an `naddr1` code. */
function InviteRoute() {
  const { naddr } = useParams<{ naddr: string }>();
  const isConcord = Boolean(naddr && /^naddr1/i.test(naddr));
  return isConcord ? <InvitePage /> : <Navigate to="/communities" replace />;
}

/** Redirect legacy `/cc/*` or sub-pane/thread paths to canonical `/c/*`. */
function LegacyCommunityRedirect() {
  const { communityId, channelId } = useParams<{ communityId: string; channelId?: string }>();
  if (!communityId) return <Navigate to="/communities" replace />;
  const base = `/c/${encodeURIComponent(communityId)}`;
  return <Navigate to={channelId ? `${base}/${encodeURIComponent(channelId)}` : base} replace />;
}

/**
 * Signup "join" link (`/join?relay=wss://...`): stashes the relay for the signup
 * wizard. Never touches a signed-in user's relays.
 */
function JoinRoute() {
  const { user } = useCurrentUser();
  const { search } = useLocation();
  const join = useMemo(() => parseJoinLink(search), [search]);
  if (!user && join) setPendingJoin(join);
  return <Navigate to="/" replace />;
}

/**
 * Signed-out: render the landing here (`/` is its address). Signed-in: first
 * rail item, else mesh (where available), else DMs/Discover.
 */
function HomeRedirect() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  // Set synchronously before the wizard's `login.*`, so the redirects below don't
  // yank the user out of onboarding.
  const onboarding = useOnboardingActive();

  // Cold launch from a notification tap or share resolves async; hold the default
  // redirect until known or the late navigate loses the race.
  const [state, setState] = useState<{ ready: boolean; deepLink: string | null }>(() =>
    coldLaunchPending() || coldSharePending()
      ? { ready: false, deepLink: null }
      : { ready: true, deepLink: consumeColdLaunchDeepLink() ?? consumeColdShareRoute() },
  );
  useEffect(() => {
    const check = () => {
      if (coldLaunchPending() || coldSharePending()) return;
      setState((prev) =>
        prev.ready
          ? prev
          : { ready: true, deepLink: consumeColdLaunchDeepLink() ?? consumeColdShareRoute() },
      );
    };
    const offLaunch = onColdLaunchResolved(check);
    const offShare = onColdShareResolved(check);
    return () => {
      offLaunch();
      offShare();
    };
  }, []);

  if (!state.ready) {
    return user ? <BootSplash /> : <BlankSplash />;
  }
  if (state.deepLink) {
    return <Navigate to={state.deepLink} replace />;
  }

  if (!user || onboarding) {
    return <WelcomePage />;
  }

  // Signal-first UX: signed-in users always land directly on Conversations (/dm),
  // where Bluetooth Mesh is integrated seamlessly.
  return <Navigate to={config.dmsDisabled ? "/communities" : "/dm"} replace />;
}

/** Bounce signed-out users to `/` for account-scoped routes. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useCurrentUser();
  if (!user) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/**
 * With `config.dmsDisabled`, send stale DM deep links to `/`. Wraps
 * `RequireAuth` so a signed-out hit still bounces to the landing first.
 */
function RequireDms({ children }: { children: ReactNode }) {
  const { config } = useAppContext();
  if (config.dmsDisabled) {
    return <Navigate to="/" replace />;
  }
  return <RequireAuth>{children}</RequireAuth>;
}

/**
 * Redirect legacy `/dms` paths to `/dm`. Needed for links outside this build:
 * old push subscriptions and Android tray notifications (`armada://open/dms/<peer>`).
 */
function LegacyDmRedirect() {
  const { peer } = useParams<{ peer: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/dm${peer ? `/${peer}` : ""}${search}${hash}`} replace />;
}

function RouteFallback() {
  return <BootSplash />;
}

/**
 * Prefetch notification-target route chunks at idle after boot so a later
 * notification tap doesn't wait on a chunk fetch. Web only: the desktop and
 * native apps load chunks from their own bundle in milliseconds, and an
 * `import()` keeps the evaluated modules resident (~15 MB on desktop).
 */
function useWarmRouteChunks() {
  useEffect(() => {
    if (isDesktop() || isNativeRuntime()) return;
    const timer = setTimeout(() => {
      for (const load of [
        () => import("@/pages/CommunityScreen"),
        () => import("@/pages/CommunitiesHubPage"),
        () => import("@/pages/DMsPage"),
        () => import("@/pages/WalletPage"),
        () => import("@/pages/NotificationsPage"),
        // The profile overlay opens over a page, so nothing else would warm it.
        () => import("@/components/profile/ProfileDialog"),
        () => import("@/pages/SettingsPage"),
      ]) {
        void load().catch(() => undefined);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);
}

/** Notification-tap and warm-share navigation bridges; must be inside <BrowserRouter>. */
function NotificationNavigation() {
  useNotificationNavigation();
  useShareTargetNavigation();
  return null;
}

/** In-router signed-in services, gated on `user` and lazy like `SignedInServices`. */
function SignedInRouterServicesGate() {
  const { user } = useCurrentUser();
  if (!user) return null;
  return (
    <Suspense fallback={null}>
      <LazySignedInRouterServices />
    </Suspense>
  );
}

/**
 * Keep the previous `location` object while it names the same history entry,
 * so closing an overlay doesn't re-render the routed tree.
 */
function useSameEntry(location: Location): Location {
  const ref = useRef(location);
  const prev = ref.current;
  if (
    prev !== location &&
    !(
      prev.key === location.key &&
      prev.pathname === location.pathname &&
      prev.search === location.search &&
      prev.hash === location.hash
    )
  ) {
    ref.current = location;
  }
  return ref.current;
}

/**
 * Routes are matched against `backgroundLocation` when present, so the page
 * behind a profile/settings overlay stays mounted (see `lib/profileOverlay.ts`).
 */
function AppRoutes() {
  const location = useLocation();
  const background = (location.state as ProfileBackgroundState | null)?.backgroundLocation;
  const routedPubkey = background ? profileOverlayPubkey(location.pathname) : undefined;

  // Cleared by any completed navigation, so a click that never opens a profile
  // can't strand the spinner.
  const [opening, setOpening] = useState(false);
  useEffect(() => setOpening(false), [location]);
  const overlay = useMemo<ProfileOverlay>(
    () => ({ pubkey: routedPubkey, opening, begin: () => setOpening(true) }),
    [routedPubkey, opening],
  );
  const settings = useSettingsOverlayController(location, useNavigate());
  const target = useSameEntry(background ?? location);

  // A page with no timeline opens the boot gate on its first frame (see bootGateRoute).
  const gatePath = target.pathname;
  useEffect(() => {
    if (routeOpensBootGate(gatePath)) return;
    const frame = requestAnimationFrame(() => markBootPainted());
    return () => cancelAnimationFrame(frame);
  }, [gatePath]);

  // Load-bearing memo: `<Routes>` would otherwise re-render the whole routed tree
  // when only the overlay changes.
  const routes = useMemo(
    () => (
        <Routes location={target}>
          {/* Outside <AppShell> so the landing and pure redirects don't fetch the frame. */}
          <Route path="/" element={<HomeRedirect />} />
          {/* Old landing address; bookmarks and older builds' logout still use it. */}
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          <Route path="/join" element={<JoinRoute />} />
          <Route element={<AppShell />}>
            {/* Cut NIP-29 / legacy Armada routes redirect cleanly to home or groups. */}
            <Route path="/s/*" element={<Navigate to="/" replace />} />
            <Route path="/discover" element={<Navigate to="/communities" replace />} />
            <Route path="/import/discord" element={<Navigate to="/communities" replace />} />
            <Route path="/gift/:from" element={<Navigate to="/" replace />} />
            <Route path="/changelog" element={<Navigate to="/" replace />} />
            <Route path="/downloads" element={<Navigate to="/" replace />} />

            {/* Encrypted Groups (Concord E2EE with subgroups & voice calls). */}
            <Route path="/c/:communityId" element={<RequireAuth><CommunityScreen /></RequireAuth>} />
            <Route path="/c/:communityId/history" element={<LegacyCommunityRedirect />} />
            {CONCORD2_PANES.map((pane) => (
              <Route key={pane} path={`/c/:communityId/${pane}`} element={<LegacyCommunityRedirect />} />
            ))}
            <Route path="/c/:communityId/:channelId" element={<RequireAuth><CommunityScreen /></RequireAuth>} />
            <Route path="/c/:communityId/:channelId/m/:messageId" element={<RequireAuth><CommunityScreen /></RequireAuth>} />
            <Route path="/c/:communityId/:channelId/t/*" element={<LegacyCommunityRedirect />} />

            {/* Legacy /cc/* aliases redirect to /c/*. */}
            <Route path="/cc/:communityId" element={<LegacyCommunityRedirect />} />
            <Route path="/cc/:communityId/:channelId" element={<LegacyCommunityRedirect />} />
            <Route path="/cc/:communityId/:channelId/*" element={<LegacyCommunityRedirect />} />

            <Route path="/invite/:naddr" element={<InviteRoute />} />
            <Route path="/privacy" element={<PrivacyPolicyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/share" element={<SharePage />} />
            {/* Callback target baked into nostrconnect:// URIs. */}
            <Route path="/remoteloginsuccess" element={<RemoteLoginSuccessPage />} />
            <Route path="/create" element={<RequireAuth><CreateCommunityPage /></RequireAuth>} />
            <Route path="/mesh" element={<RequireAuth><MeshPage /></RequireAuth>} />
            {/* Received direct invites (CORD-05 §6). */}
            <Route path="/invites" element={<RequireAuth><InvitesPage /></RequireAuth>} />
            <Route path="/notifications" element={<RequireAuth><NotificationsPage /></RequireAuth>} />
            <Route path="/dm" element={<RequireDms><DMsPage /></RequireDms>} />
            <Route path="/dm/:peer" element={<RequireDms><DMsPage /></RequireDms>} />
            <Route path="/dm/:peer/m/:messageId" element={<RequireDms><DMsPage /></RequireDms>} />
            <Route path="/wallet" element={<RequireAuth><WalletPage /></RequireAuth>} />
            <Route path="/communities" element={<RequireAuth><CommunitiesHubPage /></RequireAuth>} />
            {/* Must precede `/:user`, which would swallow `/dms`. */}
            <Route path="/dms" element={<LegacyDmRedirect />} />
            <Route path="/dms/:peer" element={<LegacyDmRedirect />} />
            <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
            {/* `/<npub|nprofile|nip05|naddr>` (see Nip19Route). UserPage renders the 404 for unknown segments. */}
            <Route path="/:user" element={<Nip19Route />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
    ),
    [target],
  );

  return (
    <ProfileOverlayContext.Provider value={overlay}>
      <SettingsOverlayContext.Provider value={settings}>
        <Suspense fallback={<RouteFallback />}>{routes}</Suspense>
      </SettingsOverlayContext.Provider>
    </ProfileOverlayContext.Provider>
  );
}

export function AppRouter() {
  useWarmRouteChunks();
  return (
    <BrowserRouter>
      <NotificationNavigation />
      <SignedInRouterServicesGate />
      <VersionCheck />
      <DesktopUpdateToast />
      {/* MUST be inside <BrowserRouter>: toasts can carry router <Link> actions. */}
      <Toaster />
      <ThemePreviewBar />
      <LocationRefProvider>
        <AppRoutes />
      </LocationRefProvider>
    </BrowserRouter>
  );
}

export default AppRouter;
