import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { SettingsOverlayContext, type SettingsOverlay } from "@/lib/settingsOverlay";

const backListeners: Array<() => void> = [];
const minimizeApp = vi.fn(() => Promise.resolve());

vi.mock("@capacitor/core", async (orig) => {
  const actual = await orig<typeof import("@capacitor/core")>();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => "android" },
  };
});
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (event: string, fn: () => void) => {
      if (event === "backButton") backListeners.push(fn);
      return Promise.resolve({ remove: () => undefined });
    },
    minimizeApp: () => minimizeApp(),
  },
}));
vi.mock("@/components/auth/LoginArea", () => ({ LoginArea: () => null }));
vi.mock("@/hooks/useDirectMessages", () => ({ useHasUnreadDMs: () => false }));
vi.mock("@/components/CallProvider", () => ({
  CallProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/DmCallProvider", () => ({
  DmCallProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/AppsProvider", () => ({
  AppsProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/concord/components/DirectInviteNotifier", () => ({ DirectInviteNotifier: () => null }));
vi.mock("@/components/QuickSwitcher", () => ({ QuickSwitcher: () => null }));
vi.mock("@/concord/hooks/useStreamAuth", () => ({ useRegisterAllStreamKeys: () => undefined }));
vi.mock("@/hooks/useShareShortcuts", () => ({ useShareShortcuts: () => undefined }));
vi.mock("@/pages/SettingsPage", () => ({
  SettingsPage: ({ onClose }: { onClose?: () => void }) => (
    <main>
      <button type="button" onClick={onClose}>
        Back
      </button>
    </main>
  ),
}));

import { AppShell } from "@/components/layout/AppShell";
import { leaveApp, useAndroidBack } from "@/hooks/useAndroidBack";

let setOpen!: (open: boolean) => void;

function RootScreen() {
  useAndroidBack(() => {
    leaveApp();
    return true;
  });
  return <textarea aria-label="composer" />;
}

function Harness({ initialPath = "/dm" }: { initialPath?: string }) {
  const [open, setOpenState] = useState(false);
  setOpen = setOpenState;
  const overlay: SettingsOverlay = {
    open,
    section: "",
    show: () => setOpenState(true),
    close: () => setOpenState(false),
  };
  return (
    <SettingsOverlayContext.Provider value={overlay}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/dm" element={<RootScreen />} />
            <Route path="/dm/:peer" element={<RootScreen />} />
            <Route path="/wallet" element={<div>Wallet</div>} />
            <Route path="/communities" element={<div>Communities</div>} />
            <Route path="/c/:communityId" element={<div>Community</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SettingsOverlayContext.Provider>
  );
}

describe("AppShell settings overlay & Signal bottom navigation", () => {
  it("makes the page underneath inert, takes focus, and gives it back on close", async () => {
    render(<Harness />);
    const composer = screen.getByRole("textbox", { name: "composer" });
    composer.focus();

    await act(async () => setOpen(true));
    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    expect(composer.closest("[inert]")).not.toBeNull();
    expect(dialog.contains(document.activeElement)).toBe(true);

    await act(async () => setOpen(false));
    expect(composer.closest("[inert]")).toBeNull();
    expect(document.activeElement).toBe(composer);
  });

  it("closes on Escape", async () => {
    render(<Harness />);
    await act(async () => setOpen(true));
    await screen.findByRole("dialog", { name: "Settings" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("closes on Android back instead of leaving the app from the page beneath", async () => {
    minimizeApp.mockClear();
    render(<Harness />);
    await act(async () => setOpen(true));
    await screen.findByRole("dialog", { name: "Settings" });

    act(() => {
      for (const fn of backListeners) fn();
    });
    expect(screen.queryByRole("dialog", { name: "Settings" })).not.toBeInTheDocument();
    expect(minimizeApp).not.toHaveBeenCalled();

    act(() => {
      for (const fn of backListeners) fn();
    });
    expect(minimizeApp).toHaveBeenCalledTimes(1);
  });

  it("leaves Escape to a dialog stacked on it, and to a handler that took it", async () => {
    render(<Harness />);
    await act(async () => setOpen(true));
    await screen.findByRole("dialog", { name: "Settings" });

    const nested = document.createElement("div");
    nested.setAttribute("role", "alertdialog");
    document.body.append(nested);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
    nested.remove();

    const taken = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    taken.preventDefault();
    act(() => {
      window.dispatchEvent(taken);
    });
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeInTheDocument();
  });

  it("renders SignalBottomNav only on top-level tabs and hides it inside threads or communities", () => {
    const { unmount: u1 } = render(<Harness initialPath="/dm" />);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    u1();

    const { unmount: u2 } = render(<Harness initialPath="/wallet" />);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    u2();

    const { unmount: u3 } = render(<Harness initialPath="/communities" />);
    expect(screen.getByRole("navigation", { name: "Navegação principal" })).toBeInTheDocument();
    u3();

    const { unmount: u4 } = render(<Harness initialPath="/dm/npub1peer" />);
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
    u4();

    const { unmount: u5 } = render(<Harness initialPath="/c/test-comm" />);
    expect(screen.queryByRole("navigation", { name: "Navegação principal" })).not.toBeInTheDocument();
    u5();
  });
});
