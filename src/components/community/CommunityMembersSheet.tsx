import { Crown, Search, Shield, ShieldCheck, Users, X } from "lucide-react";
import { nip19 } from "nostr-tools";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { badgeOf, type CommunityRoles } from "@/concord/lib/roles";
import { useAuthor } from "@/hooks/useAuthor";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useOpenProfile } from "@/hooks/useOpenProfile";
import { FormattedMessage, useIntl } from "@/i18n";
import { getAvatarShape } from "@/lib/avatarShape";

function MemberRow({
  pubkey,
  nickname,
  roleLabel,
  roleTone,
  query,
  onSelect,
}: {
  pubkey: string;
  nickname: string | undefined;
  roleLabel: string | undefined;
  roleTone: "owner" | "admin" | "mod" | undefined;
  query: string;
  onSelect: (pubkey: string) => void;
}) {
  const author = useAuthor(pubkey);
  const meta = author.data?.metadata;
  const baseName = meta?.display_name || meta?.name || `${nip19.npubEncode(pubkey).slice(0, 12)}…`;
  const primaryName = nickname || baseName;
  const secondaryText = nickname && meta?.name ? `@${meta.name}` : meta?.nip05 || undefined;

  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery) {
    const haystack = `${primaryName} ${baseName} ${meta?.nip05 ?? ""} ${pubkey}`.toLowerCase();
    if (!haystack.includes(normalizedQuery)) return null;
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(pubkey)}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-secondary/70 transition-colors"
    >
      <Avatar shape={getAvatarShape(meta)} className="size-10 shrink-0">
        <AvatarImage src={meta?.picture} alt={primaryName} />
        <AvatarFallback className="text-xs font-semibold">
          {primaryName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{primaryName}</span>
          {roleLabel && (
            <span
              className={
                roleTone === "owner"
                  ? "inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500 shrink-0"
                  : roleTone === "admin"
                    ? "inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary shrink-0"
                    : "inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500 shrink-0"
              }
            >
              {roleTone === "owner" ? (
                <Crown className="size-3" />
              ) : roleTone === "admin" ? (
                <ShieldCheck className="size-3" />
              ) : (
                <Shield className="size-3" />
              )}
              {roleLabel}
            </span>
          )}
        </div>
        {secondaryText && (
          <p className="truncate text-xs text-muted-foreground">{secondaryText}</p>
        )}
      </div>
    </button>
  );
}

export function CommunityMembersSheet({
  open,
  onOpenChange,
  memberPubkeys,
  ownerHex,
  roster,
  nicknames,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberPubkeys: string[];
  ownerHex: string;
  roster: CommunityRoles | undefined;
  nicknames: ReadonlyMap<string, string>;
}) {
  const intl = useIntl();
  const isMobile = useIsMobile();
  const openProfile = useOpenProfile();
  const [query, setQuery] = useState("");

  const sortedMembers = useMemo(() => {
    const rankOf = (pk: string): number => {
      if (pk === ownerHex) return 0;
      const badge = roster ? badgeOf(roster, pk) : undefined;
      if (badge === "admin") return 1;
      if (badge === "moderator") return 2;
      return 3;
    };
    return [...memberPubkeys].sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b));
  }, [memberPubkeys, ownerHex, roster]);

  const handleSelectMember = (pubkey: string) => {
    onOpenChange(false);
    openProfile(nip19.npubEncode(pubkey));
  };

  const body = (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="px-4 pb-3 pt-1 shrink-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={intl.formatMessage({
              id: "cchat.members.searchPlaceholder",
              defaultMessage: "Search member…",
            })}
            className="h-10 rounded-xl pl-9 bg-secondary/50 border-border/60"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-6 space-y-0.5">
        {sortedMembers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            <FormattedMessage id="cchat.members.empty" defaultMessage="No members listed yet." />
          </p>
        ) : (
          sortedMembers.map((pubkey) => {
            const isOwner = pubkey === ownerHex;
            const badge = !isOwner && roster ? badgeOf(roster, pubkey) : undefined;
            const roleLabel = isOwner
              ? intl.formatMessage({ id: "cchat.members.roleOwner", defaultMessage: "Owner" })
              : badge === "admin"
                ? intl.formatMessage({ id: "cchat.members.roleAdmin", defaultMessage: "Admin" })
                : badge === "moderator"
                  ? intl.formatMessage({
                      id: "cchat.members.roleMod",
                      defaultMessage: "Moderator",
                    })
                  : undefined;
            const roleTone = isOwner
              ? "owner"
              : badge === "admin"
                ? "admin"
                : badge === "moderator"
                  ? "mod"
                  : undefined;
            return (
              <MemberRow
                key={pubkey}
                pubkey={pubkey}
                nickname={nicknames.get(pubkey)}
                roleLabel={roleLabel}
                roleTone={roleTone}
                query={query}
                onSelect={handleSelectMember}
              />
            );
          })
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[88dvh] max-h-[88dvh] rounded-t-2xl bg-background flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 shrink-0">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <DrawerTitle className="text-base font-bold">
                <FormattedMessage
                  id="cchat.members.title"
                  defaultMessage="Members ({count})"
                  values={{ count: memberPubkeys.length }}
                />
              </DrawerTitle>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full size-9"
                aria-label={intl.formatMessage({
                  id: "cchat.members.closeAria",
                  defaultMessage: "Close",
                })}
              >
                <X className="size-5" />
              </Button>
            </DrawerClose>
          </div>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <Users className="size-5 text-primary" />
            <DialogTitle className="text-base font-bold">
              <FormattedMessage
                id="cchat.members.title"
                defaultMessage="Members ({count})"
                values={{ count: memberPubkeys.length }}
              />
            </DialogTitle>
          </div>
        </div>
        {body}
      </DialogContent>
    </Dialog>
  );
}
