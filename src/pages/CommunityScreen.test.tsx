import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dissolved: null as number | null,
  excluded: false,
  stranded: false,
  canPost: true,
  isDesktop: false,
  joinConcordCall: vi.fn(),
}));

const mockCommunity = {
  id: new Uint8Array(32),
  idHex: "a".repeat(64),
  owner: "b".repeat(64),
  ownerSalt: new Uint8Array(32),
  root: new Uint8Array(32),
  rootEpoch: 0n,
  heldRoots: [{ epoch: 0n, key: new Uint8Array(32) }],
  privateChannels: [],
  relays: ["wss://relay.example.com"],
  name: "Grupo Teste",
};

const mockChannel = {
  id: new Uint8Array(32),
  idHex: "c".repeat(64),
  name: "geral",
  topic: "Subgrupo principal",
  isPrivate: false,
  streams: [],
  voice: { room: { pk: "e".repeat(64) } },
};

const mockVoiceChannel = {
  id: new Uint8Array(32),
  idHex: "d".repeat(64),
  name: "chamada-geral",
  topic: undefined,
  isPrivate: false,
  view: "voice" as const,
  streams: [],
  voice: { room: { pk: "f".repeat(64) } },
};

vi.mock("@/lib/blocklistStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blocklistStore")>();
  return { ...actual, useIsBlocked: () => () => false };
});
vi.mock("@/lib/bootGate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bootGate")>();
  return {
    ...actual,
    markBootPainted: () => undefined,
  };
});
vi.mock("@/hooks/useReadState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useReadState")>();
  return {
    ...actual,
    useReadState: () => ({
      readState: {},
      getLastRead: () => 0,
      markRead: () => undefined,
      hydrate: () => undefined,
    }),
    concordReadKey: (id: string) => `c2:${id}`,
  };
});
vi.mock("@/wire/activation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/wire/activation")>();
  return {
    ...actual,
    activateScope: () => undefined,
    concordScope: (id: string) => `c2:${id}`,
  };
});
vi.mock("@/hooks/useCurrentUser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCurrentUser")>();
  return {
    ...actual,
    useCurrentUser: () => ({ user: { pubkey: "b".repeat(64) } }),
  };
});
vi.mock("@/hooks/useIsDesktop", () => ({ useIsDesktop: () => state.isDesktop }));
vi.mock("@/hooks/useIsMobile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useIsMobile")>();
  return { ...actual, useIsTouch: () => true, useIsMobile: () => true };
});
vi.mock("@/lib/settingsOverlay", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settingsOverlay")>();
  return { ...actual, usePageCovered: () => false };
});
vi.mock("@/hooks/useAppContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useAppContext")>();
  return {
    ...actual,
    useAppContext: () => ({
      config: { lastChannelByServer: {}, zapsEnabled: false },
      updateConfig: () => undefined,
    }),
  };
});
vi.mock("@/hooks/useAndroidBack", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useAndroidBack")>();
  return {
    ...actual,
    useAndroidBack: () => undefined,
    useBackDismiss: (props: { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }) => ({
      open: props.open ?? props.defaultOpen ?? false,
      onOpenChange: props.onOpenChange ?? (() => undefined),
    }),
  };
});
vi.mock("@/hooks/useCustomEmojis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCustomEmojis")>();
  return {
    ...actual,
    CustomEmojisProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});
vi.mock("@/concord/components/ConcordMediaHold", () => ({
  ConcordMediaHold: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/concord/hooks/useCommunityList", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useCommunityList")>();
  return {
    ...actual,
    useCommunity: () => mockCommunity,
    useCommunityList: () => ({
      data: { event: null, list: { entries: [], tombstones: [] } },
      isLoading: false,
    }),
    useIsExcluded: () => state.excluded,
  };
});
vi.mock("@/concord/hooks/useControlPlane", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useControlPlane")>();
  return {
    ...actual,
    useControlFold: () => ({
      data: {
        ownerHex: "b".repeat(64),
        metadata: { name: "Comunidade Teste", relays: ["wss://relay.example.com"] },
        channels: new Map(),
        banned: new Set<string>(),
        heads: new Map(),
        headEditions: new Map(),
        roster: { roles: new Map(), grants: new Map(), overwrites: new Map() },
        rankedRoster: true,
        incomplete: [],
      },
    }),
    useChannels: () => [mockChannel, mockVoiceChannel],
    useDissolved: () => ({ data: state.dissolved }),
  };
});
vi.mock("@/hooks/useCall", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useCall")>();
  return {
    ...actual,
    useCall: () => ({
      joinConcordCall: state.joinConcordCall,
      activeCall: undefined,
      registerCallStageSlot: () => () => undefined,
    }),
  };
});
vi.mock("@/concord/hooks/useVoice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useVoice")>();
  return {
    ...actual,
    resolveVoiceBroker: async () => "https://av.example.com",
    useVoiceBroker: () => ({ data: "https://av.example.com" }),
    useVoicePresence: () => ({ present: [], otherTransport: [], claims: new Map() }),
  };
});
vi.mock("@/concord/lib/callGate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/lib/callGate")>();
  return { ...actual, mayConnect: () => true };
});
vi.mock("@/concord/lib/voice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/lib/voice")>();
  return { ...actual, communityAvBrokers: () => ["https://av.example.com"] };
});
vi.mock("@/components/chat/CallStageSlot", () => ({ CallStageSlot: () => null }));
vi.mock("@/concord/hooks/useStreamAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useStreamAuth")>();
  return {
    ...actual,
    useRegisterChannelStreamKeys: () => undefined,
  };
});
vi.mock("@/concord/hooks/useRekey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useRekey")>();
  return {
    ...actual,
    useRekeyWatch: () => ({ stranded: state.stranded }),
    useChannelRekeyWatch: () => undefined,
  };
});
vi.mock("@/concord/hooks/useRoles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useRoles")>();
  return { ...actual, useStaffKeyWatch: () => undefined };
});
vi.mock("@/concord/hooks/useRelayFollow", () => ({ useRelayFollow: () => undefined }));
vi.mock("@/concord/hooks/useWriterAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useWriterAccess")>();
  return {
    ...actual,
    useWriterAccess: () => undefined,
    useCanPost: () => state.canPost,
  };
});
vi.mock("@/concord/lib/writerKeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/lib/writerKeys")>();
  return { ...actual, sendsIn: () => state.canPost };
});
vi.mock("@/concord/hooks/useCommunityActions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useCommunityActions")>();
  return {
    ...actual,
    useStrandedRecovery: () => ({ canRecover: false, checking: false, checkNow: async () => false }),
    useCommunityManagement: () => ({
      leave: async () => undefined,
      isLeaving: false,
      createChannel: async () => ({ channelIdHex: "d".repeat(64) }),
      isAddingChannel: false,
    }),
  };
});
vi.mock("@/concord/hooks/useGuestbook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useGuestbook")>();
  return {
    ...actual,
    useGuestbook: () => ({
      coalesced: new Map(),
      timeouts: new Map(),
      nicknames: new Map(),
      refound: undefined,
    }),
    useRestoreJoin: () => undefined,
  };
});
vi.mock("@/concord/hooks/usePause", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/usePause")>();
  return { ...actual, useActivePause: () => undefined };
});
vi.mock("@/concord/hooks/useConcordUnread", () => ({
  useConcordUnread: () => ({ byChannel: {}, markRead: () => undefined, getLastRead: () => 0 }),
}));
vi.mock("@/concord/hooks/useCommunityRumors", () => ({
  useCommunityRumors: () => ({ byChannel: new Map() }),
}));
vi.mock("@/concord/hooks/useTransport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useTransport")>();
  return {
    ...actual,
    useTransport: (_comm: unknown, _ch: unknown, canWrite: boolean) => ({
      transport: {
        messages: [],
        isLoading: false,
        canWrite,
        canModerate: false,
        hasMore: false,
      },
      span: undefined,
      reactionsFor: () => ({ tallies: [], react: () => undefined }),
      allMessages: [],
      timerEntries: [],
      trustedAuthors: new Set<string>(),
    }),
  };
});
vi.mock("@/concord/lib/rumorStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/lib/rumorStore")>();
  return { ...actual, scheduleExpiredSweep: () => undefined };
});
vi.mock("@/concord/lib/channelSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/lib/channelSync")>();
  return { ...actual, channelDecodeDeadEnd: () => false };
});
vi.mock("@/concord/hooks/useReplyParents", () => ({
  useConcordReplyParents: () => new Map(),
}));
vi.mock("@/concord/hooks/useChannel", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useChannel")>();
  return { ...actual, useSendMessage: () => ({ mutateAsync: async () => undefined }) };
});
vi.mock("@/concord/hooks/useTyping", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/concord/hooks/useTyping")>();
  return {
    ...actual,
    useTyping: () => [],
    useTypingPublisher: () => () => undefined,
  };
});
vi.mock("@/sync/useSyncTopic", () => ({
  useSyncTopicState: () => ({ status: "settled" }),
}));
vi.mock("@/hooks/useSyncActivity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSyncActivity")>();
  return { ...actual, useSyncTaskInScope: () => false };
});
vi.mock("@/components/SyncStatusIndicator", () => ({ SyncStatusIndicator: () => null }));
vi.mock("@/components/chat/ChatMessage", () => ({ ChatMessage: () => null }));
vi.mock("@/components/chat/MessageTimeline", () => ({
  MessageTimeline: () => <div data-testid="message-timeline" />,
}));
vi.mock("@/components/chat/ChatComposer", () => ({
  ChatComposer: ({ placeholder }: { placeholder?: string }) => (
    <input aria-label="chat-composer" placeholder={placeholder} />
  ),
}));

import { CommunityScreen } from "@/pages/CommunityScreen";

beforeEach(() => {
  state.dissolved = null;
  state.excluded = false;
  state.stranded = false;
  state.canPost = true;
  state.isDesktop = false;
  state.joinConcordCall.mockClear();
});

describe("CommunityScreen Signal UI & E2EE guards", () => {
  it("lists subgroups and call channels on mobile, opens a subgroup on tap, and joins voice calls", () => {
    render(
      <MemoryRouter initialEntries={[`/c/${mockCommunity.idHex}`]}>
        <Routes>
          <Route path="/c/:communityId" element={<CommunityScreen />} />
          <Route path="/c/:communityId/:channelId" element={<CommunityScreen />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Grupo Teste")).toBeInTheDocument();
    const voiceBtn = screen.getByRole("button", { name: /chamada-geral/i });
    fireEvent.click(voiceBtn);
    expect(state.joinConcordCall).toHaveBeenCalledTimes(1);

    const channelBtn = screen.getByRole("button", { name: /geral/i });
    fireEvent.click(channelBtn);

    expect(screen.getByTestId("message-timeline")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "chat-composer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar na chamada de voz" })).toBeInTheDocument();
  });

  it("replaces the composer with read-only notices when dissolved, excluded, stranded, or lacking post access", () => {
    state.dissolved = Date.now();
    const { unmount: u1 } = render(
      <MemoryRouter initialEntries={[`/c/${mockCommunity.idHex}/${mockChannel.idHex}`]}>
        <Routes>
          <Route path="/c/:communityId/:channelId" element={<CommunityScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("textbox", { name: "chat-composer" })).not.toBeInTheDocument();
    expect(screen.getByText(/dissolved by its owner/i)).toBeInTheDocument();
    u1();

    state.dissolved = null;
    state.excluded = true;
    const { unmount: u2 } = render(
      <MemoryRouter initialEntries={[`/c/${mockCommunity.idHex}/${mockChannel.idHex}`]}>
        <Routes>
          <Route path="/c/:communityId/:channelId" element={<CommunityScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("textbox", { name: "chat-composer" })).not.toBeInTheDocument();
    expect(screen.getByText(/no longer have access/i)).toBeInTheDocument();
    u2();

    state.excluded = false;
    state.stranded = true;
    const { unmount: u3 } = render(
      <MemoryRouter initialEntries={[`/c/${mockCommunity.idHex}/${mockChannel.idHex}`]}>
        <Routes>
          <Route path="/c/:communityId/:channelId" element={<CommunityScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("textbox", { name: "chat-composer" })).not.toBeInTheDocument();
    expect(screen.getByText(/out of date/i)).toBeInTheDocument();
    u3();

    state.stranded = false;
    state.canPost = false;
    const { unmount: u4 } = render(
      <MemoryRouter initialEntries={[`/c/${mockCommunity.idHex}/${mockChannel.idHex}`]}>
        <Routes>
          <Route path="/c/:communityId/:channelId" element={<CommunityScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("textbox", { name: "chat-composer" })).not.toBeInTheDocument();
    expect(screen.getByText(/can't send messages in this channel/i)).toBeInTheDocument();
    u4();
  });

  it("keeps heavy and ConcordPage modules off CommunityScreen's static import closure", () => {
    const ROOT = resolve(__dirname, "../..");
    const IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/gm;
    const TYPE_ONLY = /\{\s*(type\s+\w+\s*,?\s*)+\}\s*from/;

    const resolveSpec = (from: string, spec: string): string | undefined => {
      let base: string;
      if (spec.startsWith("@/")) base = join(ROOT, "src", spec.slice(2));
      else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
      else return `npm:${spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/")}`;
      for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
        const p = base + ext;
        if (existsSync(p) && statSync(p).isFile()) return p;
      }
      return undefined;
    };

    const start = join(ROOT, "src/pages/CommunityScreen.tsx");
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length > 0) {
      const file = queue.shift()!;
      if (file.startsWith("npm:")) continue;
      for (const m of readFileSync(file, "utf8").matchAll(IMPORT)) {
        if (TYPE_ONLY.test(m[0])) continue;
        const dep = resolveSpec(file, m[1]);
        if (dep && !seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }

    const reached = [...seen].map((f) =>
      f.startsWith("npm:") ? f : relative(ROOT, f).replace(/\\/g, "/"),
    );

    for (const forbidden of [
      "npm:@scure/btc-signer",
      "npm:react-easy-crop",
      "npm:react-day-picker",
      "src/components/brand/GameOverScreen.tsx",
      "src/concord/components/CommunitySettingsView.tsx",
      "src/components/projects/ProjectsView.tsx",
      "src/concord/pages/ConcordPage.tsx",
    ]) {
      expect(reached).not.toContain(forbidden);
    }
  });
});
