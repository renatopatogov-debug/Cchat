import {
  CheckCheck,
  ChevronLeft,
  Hash,
  Loader2,
  Lock,
  LogOut,
  MessageSquareText,
  MoreVertical,
  Pause,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Timer,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { ChatComposer } from "@/components/chat/ChatComposer";
import { ChatMessage } from "@/components/chat/ChatMessage";
import { ChatSearchBar } from "@/components/chat/ChatSearchBar";
import { mergeChannelTimeline } from "@/components/chat/channelTimeline";
import { getQuoteReplyToId } from "@/components/chat/messageHelpers";
import { MessageTimeline } from "@/components/chat/MessageTimeline";
import { ReplyContext } from "@/components/chat/ReplyContext";
import { authorsByRecency, threadSummary } from "@/components/chat/transport";
import type {
  ChatMsg,
  MessageCalendar,
  MessagePoll,
  MessageReactions,
  MessageZaps,
  OnchainZapAnnouncement,
  SendStatus,
  ZapPayment,
} from "@/components/chat/transport";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useChatEditing } from "@/components/chat/useChatEditing";
import { SyncStatusIndicator } from "@/components/SyncStatusIndicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CommunityNoAccess } from "@/concord/components/CommunityNoAccess";
import { ConcordMediaHold } from "@/concord/components/ConcordMediaHold";
import { useSendMessage } from "@/concord/hooks/useChannel";
import { useCommunityManagement, useStrandedRecovery } from "@/concord/hooks/useCommunityActions";
import { useCommunity, useCommunityList, useIsExcluded } from "@/concord/hooks/useCommunityList";
import { useCommunityRumors } from "@/concord/hooks/useCommunityRumors";
import { useConcordUnread } from "@/concord/hooks/useConcordUnread";
import { useChannels, useControlFold, useDissolved } from "@/concord/hooks/useControlPlane";
import { useGuestbook, useRestoreJoin } from "@/concord/hooks/useGuestbook";
import { useActivePause } from "@/concord/hooks/usePause";
import { useChannelRekeyWatch, useRekeyWatch } from "@/concord/hooks/useRekey";
import { useRelayFollow } from "@/concord/hooks/useRelayFollow";
import { useConcordReplyParents } from "@/concord/hooks/useReplyParents";
import { useStaffKeyWatch } from "@/concord/hooks/useRoles";
import { useRegisterChannelStreamKeys } from "@/concord/hooks/useStreamAuth";
import { useTransport } from "@/concord/hooks/useTransport";
import { useTyping, useTypingPublisher } from "@/concord/hooks/useTyping";
import { useCanPost, useWriterAccess } from "@/concord/hooks/useWriterAccess";
import { channelDecodeDeadEnd } from "@/concord/lib/channelSync";
import { communityTimerNotice, messageExpirationOf } from "@/concord/lib/disappearing";
import { subjectOf } from "@/concord/lib/forum";
import { completeMemberlist, timeoutRunning } from "@/concord/lib/guestbook";
import { observedAuthors } from "@/concord/lib/observedAuthors";
import {
  badgeOf,
  channelPermissions,
  everyoneSends,
  isAuthorized,
  isAuthorizedIn,
   isStaff,
  Permissions,
} from "@/concord/lib/roles";
import { scheduleExpiredSweep } from "@/concord/lib/rumorStore";
import type { Channel, Community } from "@/concord/lib/types";
import { sendsIn } from "@/concord/lib/writerKeys";
import type { AppScope } from "@/contexts/AppsContext";
import { ChatScopeContext } from "@/contexts/ChatScopeContext";
import { CommunityNicknamesContext } from "@/contexts/CommunityNicknamesContext";
import { ComposerBoundsProvider } from "@/contexts/ComposerBoundsContext";
import { useAndroidBack } from "@/hooks/useAndroidBack";
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthor } from "@/hooks/useAuthor";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { CustomEmojisProvider } from "@/hooks/useCustomEmojis";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import { useIsTouch } from "@/hooks/useIsMobile";
import { useNewMessagesDivider } from "@/hooks/useNewMessagesDivider";
import { useStableNavigate } from "@/hooks/useStableNavigate";
import { useSyncTaskInScope } from "@/hooks/useSyncActivity";
import { useTimelineFocus } from "@/hooks/useTimelineFocus";
import { toast } from "@/hooks/useToast";
import { common, FormattedMessage, t, useIntl } from "@/i18n";
import { useIsBlocked } from "@/lib/blocklistStore";
import { markBootPainted } from "@/lib/bootGate";
import { lazyWithReload } from "@/lib/chunkReload";
import { clockNowMs } from "@/lib/relayClock";
import type { ChatRoute } from "@/lib/routes";
import { usePageCovered } from "@/lib/settingsOverlay";
import { cn, pickDefaultChannel } from "@/lib/utils";
import { useSyncTopicState } from "@/sync/useSyncTopic";
import { activateScope, concordScope } from "@/wire/activation";

const ROUTE_PREFIX = "/cc";
const EMPTY_REPLIES: ChatMsg[] = [];

// Lazy-loaded dialogs keep the channel's first-paint import closure minimal.
const InviteDialog = lazy(
  lazyWithReload(() =>
    import("@/concord/components/InviteDialog").then((m) => ({ default: m.InviteDialog })),
  ),
);
const CommunityMembersSheet = lazy(
  lazyWithReload(() =>
    import("@/components/community/CommunityMembersSheet").then((m) => ({
      default: m.CommunityMembersSheet,
    })),
  ),
);

function buildCommunityPath(communityId: string, channelId?: string): string {
  const base = `${ROUTE_PREFIX}/${encodeURIComponent(communityId)}`;
  return channelId ? `${base}/${encodeURIComponent(channelId)}` : base;
}

function TimerNotice({
  author,
  seconds,
  self,
}: {
  author: string;
  seconds: number;
  self: string | undefined;
}) {
  const a = useAuthor(author);
  const name = a.data?.metadata?.name ?? author.slice(0, 8);
  useIntl();
  return (
    <div className="flex items-center justify-center gap-1.5 px-4 py-1.5 select-none" role="status">
      <Timer className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
      <span className="text-2xs text-muted-foreground/80 text-center">
        {communityTimerNotice(seconds, author === self, name)}
      </span>
    </div>
  );
}

interface CommunityMessageItemProps {
  event: ChatMsg;
  title: string | undefined;
  permalink: ChatRoute | undefined;
  reactions: MessageReactions;
  zaps: MessageZaps | undefined;
  onSendZap: ((target: ChatMsg, payment: ZapPayment) => Promise<void>) | undefined;
  onSendOnchainZap:
    | ((target: ChatMsg, announcement: OnchainZapAnnouncement) => Promise<void>)
    | undefined;
  poll: MessagePoll | undefined;
  calendar: MessageCalendar | undefined;
  replies: ChatMsg[];
  continuation: boolean;
  canWrite: boolean;
  canModerate: boolean;
  everyoneMention: boolean;
  sendStatus: SendStatus | undefined;
  active: boolean;
  onToggleActive: (id: string) => void;
  onReply: ((event: ChatMsg) => void) | undefined;
  replyToId: string | undefined;
  replyParent: ChatMsg | undefined;
  onJumpToReply: (id: string) => void;
  onDelete: ((event: ChatMsg) => void) | undefined;
  onRetry: ((event: ChatMsg) => void) | undefined;
  onDiscard: ((id: string) => void) | undefined;
  isEditing: boolean;
  onEdit: ((event: ChatMsg) => void) | undefined;
  onEditSubmit: ((event: ChatMsg, content: string) => Promise<void>) | undefined;
  onEditCancel: () => void;
}

const CommunityMessageItem = memo(function CommunityMessageItem({
  event,
  title,
  permalink,
  reactions,
  zaps,
  onSendZap,
  onSendOnchainZap,
  poll,
  calendar,
  replies,
  continuation,
  canWrite,
  canModerate,
  everyoneMention,
  sendStatus,
  active,
  onToggleActive,
  onReply,
  replyToId,
  replyParent,
  onJumpToReply,
  onDelete,
  onRetry,
  onDiscard,
  isEditing,
  onEdit,
  onEditSubmit,
  onEditCancel,
}: CommunityMessageItemProps) {
  const threadInfo = useMemo(() => threadSummary(replies), [replies]);
  const replyContext = useMemo(
    () =>
      replyToId ? (
        <ReplyContext parentId={replyToId} parent={replyParent} onJump={onJumpToReply} />
      ) : undefined,
    [replyToId, replyParent, onJumpToReply],
  );
  const heading = useMemo(
    () =>
      title ? (
        <div className="mb-0.5 flex items-start gap-1.5 text-chat font-semibold leading-snug">
          <MessageSquareText className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 break-words">{title}</span>
        </div>
      ) : undefined,
    [title],
  );

  return (
    <ChatMessage
      event={event}
      rumor={event}
      heading={heading}
      canWrite={canWrite}
      canModerate={canModerate}
      everyoneMention={everyoneMention}
      reactions={reactions}
      zapEnabled={Boolean(onSendZap)}
      zaps={zaps}
      onSendZap={onSendZap}
      onSendOnchainZap={onSendOnchainZap}
      poll={poll}
      calendar={calendar}
      sendStatus={sendStatus}
      continuation={continuation}
      active={active}
      onToggleActive={onToggleActive}
      replyCount={replies.length}
      threadParticipants={threadInfo.participants}
      lastReplyAt={threadInfo.lastReplyAt}
      onReply={onReply}
      replyContext={replyContext}
      onDelete={onDelete}
      onRetry={sendStatus === "failed" && onRetry ? () => onRetry(event) : undefined}
      onDiscard={sendStatus === "failed" && onDiscard ? () => onDiscard(event.id) : undefined}
      isEditing={isEditing}
      onEdit={onEdit}
      onEditSubmit={onEditSubmit}
      onEditCancel={onEditCancel}
      permalink={permalink}
    />
  );
});

function CommunityBlockedNotice({ onBack }: { onBack: () => void }) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => markBootPainted());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center bg-background">
      <div className="size-14 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center">
        <ShieldAlert className="size-7" />
      </div>
      <div className="space-y-1.5 max-w-sm">
        <h1 className="text-lg font-bold">Comunidade indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Esta comunidade está bloqueada e não pode ser aberta neste aplicativo.
        </p>
      </div>
      <Button type="button" variant="outline" className="rounded-full" onClick={onBack}>
        Voltar para Comunidades
      </Button>
    </div>
  );
}

function CommunityScreenContent({
  communityId,
  routeChannelId,
  routeMessageId,
}: {
  communityId: string;
  routeChannelId: string | undefined;
  routeMessageId: string | undefined;
}) {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const navigateTo = useStableNavigate();
  const isDesktop = useIsDesktop();
  const isTouchDevice = useIsTouch();
  const covered = usePageCovered();
  const { config, updateConfig } = useAppContext();
  const composerBoundsRef = useRef<HTMLElement | null>(null);

  const lastChannelKey = `c2:${communityId}`;

  useEffect(() => {
    activateScope(concordScope(communityId));
  }, [communityId]);

  // Core Concord state & Control Plane fold
  const baseCommunity = useCommunity(communityId);
  const { data: listData, isLoading: communityListLoading } = useCommunityList();
  const { data: folded } = useControlFold(baseCommunity);

  const community = useMemo<Community | undefined>(() => {
    if (!baseCommunity) return undefined;
    if (!folded?.metadata) return baseCommunity;
    return { ...baseCommunity, name: folded.metadata.name || baseCommunity.name };
  }, [baseCommunity, folded]);

  const allChannels = useChannels(baseCommunity);
  const channels = useMemo(
    () => allChannels.filter((c) => c.view !== "voice"),
    [allChannels],
  );

  // Security, stream auth, and key-rotation watchers (mandatory for Concord E2EE)
  useRegisterChannelStreamKeys(communityId);
  const { stranded } = useRekeyWatch(baseCommunity);
  useChannelRekeyWatch(baseCommunity);
  useStaffKeyWatch(baseCommunity);
  useRelayFollow(baseCommunity);
  useWriterAccess(baseCommunity);
  const {
    canRecover,
    checking: recoveryChecking,
    checkNow: recoveryCheckNow,
  } = useStrandedRecovery(baseCommunity, stranded);

  const excluded = useIsExcluded(communityId);
  const { data: dissolved } = useDissolved(community);
  const { coalesced, timeouts: guestbookTimeouts, nicknames, refound } = useGuestbook(community);
  useRestoreJoin(community);
  const activePause = useActivePause(community);

  // Per-channel unread state
  const { byChannel: unreadByChannel, markRead: markChannelRead } = useConcordUnread(
    community,
    channels,
    undefined,
    true,
  );
  const markAllChannelsRead = useCallback(() => {
    for (const [idHex, unread] of Object.entries(unreadByChannel)) {
      markChannelRead(idHex, unread.latest);
    }
  }, [unreadByChannel, markChannelRead]);

  // Channel resolution: mobile shows channel list at `/cc/:communityId`; desktop auto-selects default channel
  const channelIdHex =
    routeChannelId ??
    (isDesktop ? config.lastChannelByServer[lastChannelKey] ?? null : null);

  const channel = useMemo<Channel | undefined>(() => {
    if (channels.length === 0) return undefined;
    if (channelIdHex) {
      const named = channels.find((c) => c.idHex === channelIdHex);
      if (named || !folded) return named;
      return channels[0];
    }
    if (!folded || !isDesktop) return undefined;
    return pickDefaultChannel(
      channels,
      config.lastChannelByServer[lastChannelKey],
      (c) => c.idHex,
      (c) => c.name,
    );
  }, [channels, channelIdHex, folded, isDesktop, config.lastChannelByServer, lastChannelKey]);

  // Persist last visited channel per community
  useEffect(() => {
    if (!channel?.idHex) return;
    if (config.lastChannelByServer[lastChannelKey] === channel.idHex) return;
    updateConfig((prev) => ({
      ...prev,
      lastChannelByServer: {
        ...prev.lastChannelByServer,
        [lastChannelKey]: channel.idHex,
      },
    }));
  }, [channel?.idHex, config.lastChannelByServer, lastChannelKey, updateConfig]);

  // Permissions & write guards
  const ownerHex = folded?.ownerHex ?? community?.owner ?? "";
  const roster = folded?.roster;
  const iAmOwner = Boolean(user && ownerHex && user.pubkey === ownerHex);
  const iAmAdminOrOwner = Boolean(
    user && (iAmOwner || (roster ? badgeOf(roster, user.pubkey) === "admin" : false)),
  );
  const canManageChannels = Boolean(
    user && folded && isAuthorized(folded.roster, user.pubkey, ownerHex, Permissions.MANAGE_CHANNELS),
  );
  const viewerIsStaff = Boolean(user && folded && isStaff(folded.roster, user.pubkey, ownerHex));
  const communityPaused = Boolean(activePause && !viewerIsStaff);

  const canModerateMessages = Boolean(
    user &&
      folded &&
      channel &&
      (folded.rankedRoster
        ? (channelPermissions(
            folded.roster,
            ownerHex,
            user.pubkey,
            channel.idHex,
            channel.isPrivate,
          ) &
            Permissions.MANAGE_MESSAGES) !==
          0n
        : isAuthorizedIn(
            folded.roster,
            user.pubkey,
            ownerHex,
            channel.idHex,
            Permissions.MANAGE_MESSAGES,
          )),
  );

  const timedOut = Boolean(
    user && timeoutRunning(guestbookTimeouts.get(user.pubkey), clockNowMs()),
  );
  const canPost = useCanPost(community, channel?.idHex);
  const sendDenied = Boolean(user && channel && !sendsIn(folded, channel.idHex, user.pubkey));
  const restrictedChannel = Boolean(
    folded && channel && !everyoneSends(folded.roster, channel.idHex),
  );
  const canWrite = Boolean(
    user && channel && !dissolved && !excluded && !stranded && !timedOut && !communityPaused,
  );

  const focus = useMemo(
    () => (routeMessageId ? { messageId: routeMessageId } : undefined),
    [routeMessageId],
  );

  const {
    transport,
    span: timelineSpan,
    reactionsFor,
    allMessages,
    timerEntries,
    trustedAuthors,
  } = useTransport(community, channel, canWrite, canModerateMessages, channelIdHex, focus);

  // Disappearing messages hygiene
  const sweepIdHex = community?.idHex;
  useEffect(() => (sweepIdHex ? scheduleExpiredSweep(sweepIdHex) : undefined), [sweepIdHex]);

  const messageTimer = messageExpirationOf(folded?.metadata);
  const resolveMessageTimer = useCallback(async () => messageTimer, [messageTimer]);

  // Complete member list for the Members sheet & @-mentions
  const channelIds = useMemo(() => allChannels.map((c) => c.idHex), [allChannels]);
  const { byChannel: rumorsByChannel } = useCommunityRumors(community?.idHex, channelIds);
  const memberPubkeys = useMemo(() => {
    const obs = observedAuthors(rumorsByChannel, allMessages);
    const set = completeMemberlist(
      coalesced,
      obs,
      folded?.banned ?? new Set(),
      folded?.bannedAt,
      refound,
    );
    if (ownerHex) set.add(ownerHex);
    return [...set];
  }, [rumorsByChannel, allMessages, coalesced, folded?.banned, folded?.bannedAt, refound, ownerHex]);

  // Timeline entries & unread divider
  const mixedEntries = useMemo(() => {
    const merged = mergeChannelTimeline(transport.messages, [], timerEntries);
    const to = timelineSpan?.to;
    if (!timelineSpan || to === undefined) return merged;
    const { from } = timelineSpan;
    return merged.filter(
      (entry) => entry.type === "chat" || (entry.createdAt >= from && entry.createdAt <= to),
    );
  }, [transport.messages, timelineSpan, timerEntries]);

  const dividerEntries = useMemo(
    () =>
      mixedEntries.map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        author:
          entry.type === "chat"
            ? entry.message.pubkey
            : entry.type === "dm-timer"
              ? entry.author
              : "",
      })),
    [mixedEntries],
  );
  const newDividerId = useNewMessagesDivider(
    channel?.idHex ?? "",
    dividerEntries,
    user?.pubkey,
    transport.hasMore,
  );

  // Mark active channel read when visible
  const unreadByChannelRef = useRef(unreadByChannel);
  unreadByChannelRef.current = unreadByChannel;
  useEffect(() => {
    if (!user?.pubkey || !channel?.idHex || covered) return;
    if (!isDesktop && !routeChannelId) return;
    const latest = mixedEntries[mixedEntries.length - 1]?.createdAt ?? 0;
    const stamp = () => {
      if (document.visibilityState !== "visible") return;
      const badgeLatest = unreadByChannelRef.current[channel.idHex]?.latest ?? 0;
      markChannelRead(channel.idHex, Math.max(latest, badgeLatest));
    };
    stamp();
    document.addEventListener("visibilitychange", stamp);
    return () => document.removeEventListener("visibilitychange", stamp);
  }, [user?.pubkey, channel?.idHex, covered, isDesktop, routeChannelId, mixedEntries, markChannelRead]);

  // Inline search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => {
    setSearchOpen(false);
    setSearchQuery("");
  }, [channel?.idHex]);

  const filteredSearchMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return [...allMessages]
      .filter((m) => m.content.toLowerCase().includes(q))
      .reverse()
      .slice(0, 60);
  }, [allMessages, searchQuery]);

  // Timeline focus, replies, edits, and typing
  const { timelineRef, jumpToMessage, clearMessageFocus, activeId, toggleActive } =
    useTimelineFocus({
      messages: transport.messages,
      isLoading: Boolean(transport.isLoading),
      hasMore: transport.hasMore,
      loadOlder: transport.loadOlder,
      enabled: Boolean(channel) && !searchOpen,
      resetKey: channel?.idHex,
    });

  useEffect(() => {
    if (!routeMessageId || !channel) return;
    timelineRef.current?.scrollToMessage(routeMessageId, true);
  }, [routeMessageId, channel, transport.messages.length, timelineRef]);

  const messagesById = useMemo(() => {
    const map = new Map<string, ChatMsg>();
    for (const m of allMessages) map.set(m.id, m);
    return map;
  }, [allMessages]);
  const olderReplyParents = useConcordReplyParents(
    community,
    channel,
    transport.messages,
    messagesById,
  );

  const [replyTo, setReplyTo] = useState<ChatMsg | undefined>(undefined);
  useEffect(() => setReplyTo(undefined), [channel?.idHex]);

  const { editingId, startEditing, cancelEditing, handleEditSubmit, editLast } = useChatEditing({
    edit: (original, content) => transport.editMessage?.(original, content),
    messages: transport.messages,
    isPending: (id) => transport.sendStatusFor?.(id) !== undefined,
    self: user?.pubkey,
  });

  const { mutateAsync: send } = useSendMessage(community, channel);
  const publishTyping = useTypingPublisher(community, channel, allMessages);
  const typingPubkeys = useTyping(community, channel, allMessages);
  const recentAuthors = useMemo(() => authorsByRecency(transport.messages), [transport.messages]);

  const transportRef = useRef(transport);
  transportRef.current = transport;
  const composerCanSend = useCallback((): string | null => {
    if (communityPaused) {
      return t({
        id: "concordPage.paused.cantSend",
        defaultMessage: "This community is paused. A moderator must resume it before anyone can post.",
      });
    }
    if (timedOut) {
      return t({
        id: "concordPage.timedOut.cantSend",
        defaultMessage: "You're timed out, so you can't post here yet.",
      });
    }
    if (!canPost) {
      return sendDenied
        ? t({ id: "useChannel.cantSend", defaultMessage: "You can't send messages in this channel." })
        : t({
            id: "concordPage.composer.keyPending",
            defaultMessage: "Your key to post here is on its way.",
          });
    }
    return transportRef.current.canSend?.() ?? null;
  }, [communityPaused, timedOut, canPost, sendDenied]);

  const handleSend = useCallback(
    async (content: string, tags: string[][]) => {
      const isReply = Boolean(replyTo);
      const extraTags = tags.filter(
        ([name]) => name !== "h" && name !== "e" && (isReply || name !== "q"),
      );
      await send({ content, extraTags });
      setReplyTo(undefined);
      clearMessageFocus();
    },
    [replyTo, send, clearMessageFocus],
  );

  // Sync status indicators
  const channelScope = channel ? `c2:${channel.idHex}` : undefined;
  const channelTopic = useSyncTopicState(channelScope);
  const channelTaskRunning = useSyncTaskInScope(channelScope);
  const channelSyncing = Boolean(
    channelScope && (channelTopic.status === "pending" || channelTaskRunning),
  );
  const gateResolving = Boolean(
    !channel && (communityListLoading || (baseCommunity && !folded)),
  );
  const [channelSyncFailed, setChannelSyncFailed] = useState(false);
  useEffect(() => setChannelSyncFailed(false), [channelScope]);
  useEffect(() => {
    if (channelTopic.status === "error") setChannelSyncFailed(true);
    else if (channelTopic.status === "settled") setChannelSyncFailed(false);
  }, [channelTopic.status]);

  const membershipResolved = Boolean(
    listData && !listData.decryptFailed && !communityListLoading,
  );
  const noAccess = Boolean(!baseCommunity && membershipResolved);

  // Ensure boot gate opens even when no channel timeline is mounted (e.g. mobile channel list)
  useEffect(() => {
    if (channel && (isDesktop || Boolean(routeChannelId))) return;
    const frame = requestAnimationFrame(() => markBootPainted());
    return () => cancelAnimationFrame(frame);
  }, [channel, isDesktop, routeChannelId]);

  // Community actions: Leave, Invite, Members, Create Channel
  const { leave, isLeaving, createChannel, isAddingChannel } = useCommunityManagement(community);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);
  const [newChannelOpen, setNewChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");

  const handleLeave = async () => {
    try {
      await leave();
      setLeaveConfirmOpen(false);
      navigateTo("/communities");
    } catch (e) {
      toast({
        title: t({ id: "concordPage.leave.failed", defaultMessage: "Couldn't leave" }),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  const handleCreateChannel = async () => {
    const name = newChannelName.trim().replace(/^#+/, "");
    if (!name) return;
    try {
      const { channelIdHex: createdId } = await createChannel({ name });
      setNewChannelName("");
      setNewChannelOpen(false);
      navigateTo(buildCommunityPath(communityId, createdId));
    } catch (e) {
      toast({
        title: "Não foi possível criar o canal",
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    }
  };

  // Mobile hardware Back: channel -> channel list -> /communities
  const mobileInChannel = !isDesktop && Boolean(routeChannelId);
  useAndroidBack(() => {
    if (mobileInChannel) {
      navigateTo(buildCommunityPath(communityId));
      return true;
    }
    navigateTo("/communities");
    return true;
  }, !isDesktop);

  // Stable chat scope & permalink
  const appScope = useMemo<AppScope | undefined>(
    () => (community && channel ? { kind: "concord", community, channel } : undefined),
    [community, channel],
  );
  const permalink = useMemo<ChatRoute | undefined>(
    () =>
      community && channel
        ? { kind: "concord", communityId: community.idHex, channelId: channel.idHex }
        : undefined,
    [community, channel],
  );

  if (noAccess) {
    return <CommunityNoAccess communityId={communityId} />;
  }

  const communityLabel = community?.name || `Comunidade ${communityId.slice(0, 8)}`;
  const hasAnyUnread = Object.keys(unreadByChannel).length > 0;

  const channelListPane = (
    <aside
      aria-label="Canais da comunidade"
      className={cn(
        "flex flex-col min-h-0 bg-background sidebar:bg-chrome/40 sidebar:border-r sidebar:border-border",
        "w-full sidebar:w-72 xl:sidebar:w-80 shrink-0",
        mobileInChannel && "hidden sidebar:flex",
      )}
    >
      <header className="px-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-3 border-b border-border flex items-center gap-2 shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full size-9 shrink-0"
          aria-label="Voltar para Comunidades"
          onClick={() => navigateTo("/communities")}
        >
          <ChevronLeft className="size-5" />
        </Button>

        <span className="size-9 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center justify-center shrink-0">
          {communityLabel.slice(0, 2).toUpperCase()}
        </span>

        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold truncate leading-tight">{communityLabel}</h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {memberPubkeys.length > 0 ? `${memberPubkeys.length} membros` : "Criptografada ponta-a-ponta"}
          </p>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full size-9 shrink-0"
          aria-label="Membros da comunidade"
          onClick={() => setMembersOpen(true)}
        >
          <Users className="size-4" />
        </Button>

        {!dissolved && !excluded && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full size-9 shrink-0"
            aria-label="Convidar pessoas"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="size-4" />
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full size-9 shrink-0"
              aria-label="Mais opções da comunidade"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52 rounded-xl">
            {hasAnyUnread && (
              <DropdownMenuItem onClick={markAllChannelsRead}>
                <CheckCheck className="size-4 mr-2" />
                Marcar tudo como lido
              </DropdownMenuItem>
            )}
            {canManageChannels && !dissolved && (
              <DropdownMenuItem onClick={() => setNewChannelOpen(true)}>
                <Plus className="size-4 mr-2" />
                Novo canal
              </DropdownMenuItem>
            )}
            {(hasAnyUnread || (canManageChannels && !dissolved)) && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setLeaveConfirmOpen(true)}
            >
              <LogOut className="size-4 mr-2" />
              Sair da comunidade
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {!folded && channels.length === 0 ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-2xl" />
          </div>
        ) : channels.length === 0 ? (
          <div className="py-10 px-4 text-center space-y-2">
            <p className="text-sm font-medium">Nenhum canal de texto disponível</p>
            <p className="text-xs text-muted-foreground">
              Os canais aparecerão aqui assim que a sincronização criptografada terminar.
            </p>
          </div>
        ) : (
          channels.map((c) => {
            const unread = unreadByChannel[c.idHex];
            const isSelected = Boolean(channel?.idHex === c.idHex && (isDesktop || mobileInChannel));
            return (
              <button
                key={c.idHex}
                type="button"
                onClick={() => {
                  const to = buildCommunityPath(communityId, c.idHex);
                  navigateTo(to, { replace: isDesktop && Boolean(routeChannelId) });
                }}
                className={cn(
                  "w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors",
                  isSelected
                    ? "bg-primary/15 text-primary font-semibold"
                    : unread
                      ? "bg-card hover:bg-secondary/70 text-foreground font-semibold border border-border/60"
                      : "hover:bg-secondary/60 text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-9 rounded-xl flex items-center justify-center shrink-0",
                    isSelected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground",
                  )}
                >
                  {c.isPrivate ? <Lock className="size-4" /> : <Hash className="size-4" />}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm">{c.name}</span>
                  </div>
                  {c.topic && (
                    <p className="truncate text-xs text-muted-foreground font-normal">{c.topic}</p>
                  )}
                </div>

                {unread && (
                  <span
                    className={cn(
                      "shrink-0 rounded-full flex items-center justify-center",
                      unread.mention
                        ? "min-w-5 h-5 px-1.5 bg-primary text-primary-foreground text-[11px] font-bold"
                        : "size-2.5 bg-primary",
                    )}
                    aria-label="Mensagens não lidas"
                  >
                    {unread.mention ? "@" : null}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );

  const chatPane = (
    <main
      ref={(el) => {
        composerBoundsRef.current = el;
      }}
      className={cn(
        "flex flex-1 flex-col min-w-0 min-h-0 bg-background",
        !mobileInChannel && "hidden sidebar:flex",
      )}
    >
      {channel ? (
        <>
          <header className="relative px-3 pt-[calc(0.65rem+env(safe-area-inset-top,0px))] pb-2.5 border-b border-border flex items-center gap-2 shrink-0 bg-background/95 backdrop-blur">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full size-9 shrink-0 sidebar:hidden"
              aria-label="Voltar aos canais"
              onClick={() => navigateTo(buildCommunityPath(communityId))}
            >
              <ChevronLeft className="size-5" />
            </Button>

            <span className="size-8 rounded-xl bg-secondary text-muted-foreground flex items-center justify-center shrink-0">
              {channel.isPrivate ? <Lock className="size-4" /> : <Hash className="size-4" />}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold truncate">{channel.name}</h2>
                <SyncStatusIndicator priorityScope={channelScope} />
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                {channel.topic || communityLabel}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full size-9 shrink-0"
              aria-label="Buscar mensagens"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="size-4" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full size-9 shrink-0"
              aria-label="Ver membros"
              onClick={() => setMembersOpen(true)}
            >
              <Users className="size-4" />
            </Button>

            {!dissolved && !excluded && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full size-9 shrink-0 hidden sm:inline-flex"
                aria-label="Convidar pessoas"
                onClick={() => setInviteOpen(true)}
              >
                <UserPlus className="size-4" />
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="rounded-full size-9 shrink-0 sidebar:hidden"
                  aria-label="Opções"
                >
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                {!dissolved && !excluded && (
                  <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                    <UserPlus className="size-4 mr-2" />
                    Convidar pessoas
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setLeaveConfirmOpen(true)}
                >
                  <LogOut className="size-4 mr-2" />
                  Sair da comunidade
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <ChatSearchBar
              open={searchOpen}
              value={searchQuery}
              onChange={setSearchQuery}
              onClose={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              placeholder={`Buscar em #${channel.name}…`}
            />
          </header>

          {searchOpen && searchQuery.trim().length > 0 ? (
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredSearchMessages.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma mensagem encontrada para &ldquo;{searchQuery}&rdquo;.
                </p>
              ) : (
                filteredSearchMessages.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                      jumpToMessage(msg.id);
                    }}
                    className="w-full rounded-xl border border-border bg-card hover:bg-secondary/60 p-3 text-left transition-colors"
                  >
                    <p className="text-sm line-clamp-3 break-words">{msg.content}</p>
                  </button>
                ))
              )}
            </div>
          ) : (
            <MessageTimeline
              transport={transport}
              entries={mixedEntries}
              newDividerId={newDividerId}
              renderEntry={(entry) =>
                entry.type === "dm-timer" ? (
                  <TimerNotice author={entry.author} seconds={entry.seconds} self={user?.pubkey} />
                ) : null
              }
              handleRef={timelineRef}
              syncing={channelSyncing || gateResolving}
              syncFailed={channelSyncFailed}
              className="flex-1 min-h-0"
              emptyState={
                channelDecodeDeadEnd(channel.idHex) ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    <FormattedMessage
                      id="concordPage.timeline.undecryptable"
                      defaultMessage="There are messages here, but they can't be decrypted with the keys this device holds yet. They should become readable once the next key update from the community reaches you."
                    />
                  </p>
                ) : (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    <FormattedMessage
                      id="concordPage.timeline.empty"
                      defaultMessage="No messages yet. Only members can read this channel."
                    />
                  </p>
                )
              }
              renderMessage={(msg, continuation) => {
                const replyId = getQuoteReplyToId(msg);
                return (
                  <CommunityMessageItem
                    key={msg.id}
                    event={msg}
                    title={subjectOf(msg)}
                    permalink={permalink}
                    reactions={reactionsFor(msg.id)}
                    zaps={transport.zapsFor?.(msg.id)}
                    onSendZap={config.zapsEnabled ? transport.sendZap : undefined}
                    onSendOnchainZap={config.zapsEnabled ? transport.sendOnchainZap : undefined}
                    poll={transport.pollFor?.(msg.id)}
                    calendar={transport.calendarFor?.(msg.id)}
                    replies={transport.threadRepliesFor?.(msg.id) ?? EMPTY_REPLIES}
                    continuation={continuation}
                    canWrite={transport.canWrite}
                    canModerate={transport.canModerate}
                    everyoneMention={Boolean(transport.mentionsEveryone?.(msg))}
                    sendStatus={transport.sendStatusFor?.(msg.id)}
                    active={activeId === msg.id}
                    onToggleActive={toggleActive}
                    onReply={canWrite && canPost ? setReplyTo : undefined}
                    replyToId={replyId}
                    replyParent={
                      replyId
                        ? messagesById.get(replyId) ?? olderReplyParents.get(replyId)
                        : undefined
                    }
                    onJumpToReply={jumpToMessage}
                    onDelete={transport.deleteMessage}
                    onRetry={transport.retry}
                    onDiscard={transport.discard}
                    isEditing={editingId === msg.id}
                    onEdit={canWrite && canPost ? startEditing : undefined}
                    onEditSubmit={handleEditSubmit}
                    onEditCancel={cancelEditing}
                  />
                );
              }}
            />
          )}

          {typingPubkeys.length > 0 && <TypingIndicator pubkeys={typingPubkeys} />}

          {dissolved ? (
            <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mt-1 rounded-2xl bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-center gap-3">
              <Trash2 className="size-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-destructive">
                  <FormattedMessage
                    id="concordPage.dissolved.title"
                    defaultMessage="This community was dissolved by its owner."
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    id="concordPage.dissolved.description"
                    defaultMessage="It's now read-only. You can still browse the history, or remove it from your list."
                  />
                </p>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="shrink-0 rounded-full"
                disabled={isLeaving}
                onClick={() => void handleLeave()}
              >
                {isLeaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FormattedMessage {...common.remove} />
                )}
              </Button>
            </div>
          ) : excluded ? (
            <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mt-1 rounded-2xl bg-muted/60 border border-border px-4 py-3 flex items-center gap-3">
              <Lock className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  <FormattedMessage
                    id="concordPage.excluded.title"
                    defaultMessage="You no longer have access to this community."
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    id="concordPage.excluded.description"
                    defaultMessage="A moderator rotated its keys without you. Your history stays readable; new messages won't. It reappears if you're re-invited, or you can leave."
                  />
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 rounded-full"
                disabled={isLeaving}
                onClick={() => void handleLeave()}
              >
                {isLeaving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FormattedMessage id="concordPage.excluded.leave" defaultMessage="Leave" />
                )}
              </Button>
            </div>
          ) : stranded ? (
            <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mt-1 rounded-2xl bg-muted/60 border border-border px-4 py-3 flex items-center gap-3">
              <Lock className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">
                  <FormattedMessage
                    id="concordPage.stranded.title"
                    defaultMessage="This invite link is out of date."
                  />
                </p>
                <p className="text-xs text-muted-foreground">
                  {canRecover
                    ? intl.formatMessage({
                        id: "concordPage.stranded.descriptionRecover",
                        defaultMessage:
                          "The community rotated its keys after this link was made, so you're on an older version and can't read new messages. This checks for updated keys automatically; you can also ask whoever invited you for a fresh invite, or ask a moderator to send you the current keys.",
                      })
                    : intl.formatMessage({
                        id: "concordPage.stranded.description",
                        defaultMessage:
                          "The community rotated its keys after this link was made, so you're on an older version and can't read new messages. Ask whoever invited you for a fresh invite, or ask a moderator to send you the current keys.",
                      })}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canRecover && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="rounded-full"
                    disabled={recoveryChecking}
                    onClick={() => void recoveryCheckNow()}
                  >
                    {recoveryChecking ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  disabled={isLeaving}
                  onClick={() => void handleLeave()}
                >
                  Sair
                </Button>
              </div>
            </div>
          ) : user && timedOut ? (
            <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mt-1 rounded-2xl bg-muted/60 border border-border px-4 py-3 flex items-center gap-3">
              <Lock className="size-5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                <FormattedMessage
                  id="concordPage.timedOut.banner"
                  defaultMessage="You're timed out until {until}. You can read, but not post."
                  values={{
                    until: intl.formatDate(
                      (guestbookTimeouts.get(user.pubkey)?.until ?? 0) * 1000,
                      { dateStyle: "medium", timeStyle: "short" },
                    ),
                  }}
                />
              </p>
            </div>
          ) : communityPaused ? (
            <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mt-1 rounded-2xl bg-muted/60 border border-border px-4 py-3 flex items-center gap-3">
              <Pause className="size-5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                <FormattedMessage
                  id="concordPage.paused.cantSend"
                  defaultMessage="This community is paused. A moderator must resume it before anyone can post."
                />
              </p>
            </div>
          ) : user && !canPost ? (
            <div className="mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom,0px))] mt-1 rounded-2xl bg-muted/60 border border-border px-4 py-3 flex items-center gap-3">
              <Lock className="size-5 shrink-0 text-muted-foreground" />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {sendDenied
                  ? intl.formatMessage({
                      id: "useChannel.cantSend",
                      defaultMessage: "You can't send messages in this channel.",
                    })
                  : intl.formatMessage({
                      id: "concordPage.composer.keyPending",
                      defaultMessage: "Your key to post here is on its way.",
                    })}
              </p>
            </div>
          ) : (
            <ChatComposer
              relayUrl="dm"
              groupId={channel.idHex}
              messages={[]}
              shareRoute={buildCommunityPath(communityId, channel.idHex)}
              mentionPubkeys={memberPubkeys}
              canMentionEveryone={transport.canMentionEveryone}
              mentionRoles={transport.mentionRoles}
              botCommands
              recentAuthors={recentAuthors}
              conversationRelays={community?.relays}
              placeholder={
                restrictedChannel
                  ? `Mensagem em #${channel.name} (restrito)`
                  : `Mensagem em #${channel.name}`
              }
              shareLabel={`${communityLabel} #${channel.name}`}
              sendOverride={handleSend}
              canSend={composerCanSend}
              onPollSubmit={transport.sendPoll}
              replyTo={replyTo}
              sealed
              onCancelReply={() => setReplyTo(undefined)}
              onJumpToReply={jumpToMessage}
              onTyping={publishTyping}
              encryptAttachments
              disappearingTimer={resolveMessageTimer}
              onEditLast={canWrite && canPost ? editLast : undefined}
              autoFocus={!isTouchDevice}
            />
          )}
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2">
          <Hash className="size-10 opacity-30" />
          <p className="text-sm font-medium">
            {gateResolving ? "Sincronizando canais criptografados…" : "Selecione um canal para conversar"}
          </p>
        </div>
      )}
    </main>
  );

  return (
    <CommunityNicknamesContext.Provider value={nicknames}>
      <ConcordMediaHold community={community} trusted={trustedAuthors}>
        <ComposerBoundsProvider value={composerBoundsRef}>
          <ChatScopeContext.Provider value={appScope}>
            <CustomEmojisProvider>
              <div className="flex flex-1 min-w-0 min-h-0 h-full bg-background">
                {channelListPane}
                {chatPane}
              </div>

              {inviteOpen && (
                <Suspense fallback={null}>
                  <InviteDialog
                    community={community}
                    open={inviteOpen}
                    onOpenChange={setInviteOpen}
                    canCreateLink={iAmAdminOrOwner}
                  />
                </Suspense>
              )}

              {membersOpen && (
                <Suspense fallback={null}>
                  <CommunityMembersSheet
                    open={membersOpen}
                    onOpenChange={setMembersOpen}
                    memberPubkeys={memberPubkeys}
                    ownerHex={ownerHex}
                    roster={roster}
                    nicknames={nicknames}
                  />
                </Suspense>
              )}

              <Dialog open={newChannelOpen} onOpenChange={setNewChannelOpen}>
                <DialogContent className="max-w-sm rounded-2xl space-y-4">
                  <DialogTitle className="text-base font-bold">Novo canal</DialogTitle>
                  <Input
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="ex: avisos, vendas, entregas"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCreateChannel();
                      }
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => setNewChannelOpen(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      className="rounded-full"
                      disabled={!newChannelName.trim() || isAddingChannel}
                      onClick={() => void handleCreateChannel()}
                    >
                      {isAddingChannel ? <Loader2 className="size-4 animate-spin" /> : "Criar canal"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <AlertDialog open={leaveConfirmOpen} onOpenChange={setLeaveConfirmOpen}>
                <AlertDialogContent className="rounded-2xl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sair de {communityLabel}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      A comunidade será removida da sua lista. Para voltar no futuro em comunidades privadas, será necessário um novo convite.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={isLeaving}
                      onClick={() => void handleLeave()}
                    >
                      {isLeaving ? <Loader2 className="size-4 animate-spin" /> : "Sair"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CustomEmojisProvider>
          </ChatScopeContext.Provider>
        </ComposerBoundsProvider>
      </ConcordMediaHold>
    </CommunityNicknamesContext.Provider>
  );
}

/**
 * Clean Signal-style Concord E2EE community view (`/cc/:communityId/:channelId?`).
 * Checks blocklist before mounting any community sync/stream hooks.
 */
export function CommunityScreen() {
  const { communityId, channelId, messageId } = useParams<{
    communityId: string;
    channelId?: string;
    messageId?: string;
  }>();
  const navigateTo = useStableNavigate();
  const isBlocked = useIsBlocked();

  if (!communityId) {
    return <Navigate to="/communities" replace />;
  }
  if (isBlocked(communityId)) {
    return <CommunityBlockedNotice onBack={() => navigateTo("/communities")} />;
  }

  return (
    <CommunityScreenContent
      key={communityId}
      communityId={communityId}
      routeChannelId={channelId}
      routeMessageId={messageId}
    />
  );
}
