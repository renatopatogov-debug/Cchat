import { MessageCircle, Users, Wallet } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { useIntl } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Clean Signal-style bottom tab bar with 3 top-level tabs:
 * 1. Conversas (/dm — includes integrated Bluetooth Mesh)
 * 2. Carteira (/wallet — BRZ, QR v2 & delivery escrow)
 * 3. Grupos (/communities — encrypted E2EE groups & call channels)
 */
export function SignalBottomNav({
  unreadCount = 0,
  className,
}: {
  unreadCount?: number;
  className?: string;
}) {
  const intl = useIntl();
  const { pathname } = useLocation();

  const items = [
    {
      to: "/dm",
      label: intl.formatMessage({ id: "cchat.nav.chats", defaultMessage: "Chats" }),
      icon: MessageCircle,
      active: pathname.startsWith("/dm") || pathname.startsWith("/mesh"),
      badge: unreadCount > 0 ? unreadCount : undefined,
    },
    {
      to: "/wallet",
      label: intl.formatMessage({ id: "cchat.nav.wallet", defaultMessage: "Wallet" }),
      icon: Wallet,
      active: pathname.startsWith("/wallet"),
    },
    {
      to: "/communities",
      label: intl.formatMessage({ id: "cchat.nav.groups", defaultMessage: "Groups" }),
      icon: Users,
      active:
        pathname.startsWith("/communities") ||
        pathname.startsWith("/create") ||
        pathname.startsWith("/c/") ||
        pathname.startsWith("/cc/") ||
        pathname.startsWith("/s/"),
    },
  ];

  return (
    <nav
      aria-label={intl.formatMessage({ id: "cchat.nav.bottomAria", defaultMessage: "Main navigation" })}
      className={cn(
        "sidebar:hidden shrink-0 border-t border-border bg-background/95 backdrop-blur px-3 pt-1.5 pb-[calc(env(safe-area-inset-bottom,0px)+0.45rem)] flex items-center justify-around z-30",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex flex-col items-center gap-0.5 px-4 py-1 rounded-2xl transition-colors",
              item.active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex items-center justify-center px-4 py-0.5 rounded-full transition-colors",
                item.active && "bg-primary/15",
              )}
            >
              <Icon className="size-5" />
            </span>
            <span className="text-[11px] leading-tight">{item.label}</span>
            {item.badge !== undefined && (
              <span className="absolute top-0.5 right-3 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
