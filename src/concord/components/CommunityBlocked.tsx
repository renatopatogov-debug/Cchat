import { ShieldOff } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { FormattedMessage } from "@/i18n";

/**
 * Shown when a group/community is on the local/configured blocklist (`blocklistStore.ts`).
 */
export function CommunityBlocked() {
  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <div className="size-14 rounded-2xl bg-destructive/15 text-destructive flex items-center justify-center">
        <ShieldOff className="size-7" />
      </div>
      <h1 className="text-lg font-bold tracking-tight text-foreground max-w-md">
        <FormattedMessage id="communityBlocked.title" defaultMessage="This community is unavailable in Armada" />
      </h1>
      <Button asChild variant="secondary" className="rounded-full">
        <Link to="/communities">
          <FormattedMessage id="cchat.common.backToGroups" defaultMessage="Back to groups" />
        </Link>
      </Button>
    </div>
  );
}
