import { act, render, screen } from "@testing-library/react";
import { lazy, Suspense, type ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sidebarAccountLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }));

vi.mock("@/components/auth/LoginArea", async () => {
  const { useEffect } = await import("react");
  return {
    LoginArea: function MockLoginArea() {
      useEffect(() => {
        sidebarAccountLifecycle.mounts += 1;
        return () => {
          sidebarAccountLifecycle.unmounts += 1;
        };
      }, []);
      return <div data-testid="sidebar-account" />;
    },
  };
});
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
vi.mock("@/concord/components/DirectInviteNotifier", () => ({
  DirectInviteNotifier: () => null,
}));
vi.mock("@/components/QuickSwitcher", () => ({ QuickSwitcher: () => null }));
vi.mock("@/concord/hooks/useStreamAuth", () => ({ useRegisterAllStreamKeys: () => undefined }));
vi.mock("@/hooks/useShareShortcuts", () => ({ useShareShortcuts: () => undefined }));

import { AppShell } from "@/components/layout/AppShell";

beforeEach(() => {
  sidebarAccountLifecycle.mounts = 0;
  sidebarAccountLifecycle.unmounts = 0;
});

describe("AppShell route Suspense", () => {
  it("keeps the shell mounted while a first-visited page chunk loads", async () => {
    let finishLoading!: () => void;
    const DelayedPage = lazy(
      () =>
        new Promise<{ default: () => ReactNode }>((resolve) => {
          finishLoading = () => resolve({ default: () => <main>Delayed page</main> });
        }),
    );

    render(
      <MemoryRouter initialEntries={["/delayed"]}>
        <Suspense fallback={<div>Boot splash</div>}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/delayed" element={<DelayedPage />} />
            </Route>
          </Routes>
        </Suspense>
      </MemoryRouter>,
    );

    expect(screen.getByRole("complementary", { name: "Menu principal" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading page" })).toBeInTheDocument();
    expect(screen.queryByText("Boot splash")).not.toBeInTheDocument();
    expect(sidebarAccountLifecycle).toEqual({ mounts: 1, unmounts: 0 });

    await act(async () => finishLoading());

    expect(await screen.findByText("Delayed page")).toBeInTheDocument();
    expect(sidebarAccountLifecycle).toEqual({ mounts: 1, unmounts: 0 });
  });
});
