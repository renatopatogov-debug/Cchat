import { CchatLogo } from "@/components/brand/CchatLogo";
import { useIntl } from "@/i18n";

/** Full-screen branded splash for boot-time waits (cold deep link, route chunks). */
export function BootSplash() {
  const intl = useIntl();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background"
      role="status"
      aria-label={intl.formatMessage({ id: "bootSplash.loading", defaultMessage: "Loading" })}
    >
      <CchatLogo size={88} />
    </div>
  );
}

/**
 * The same wait with no mark, for when the destination (welcome screen) draws
 * the crest itself; otherwise the draw would restart.
 */
export function BlankSplash() {
  const intl = useIntl();
  return <div className="fixed inset-0 z-50 bg-background" role="status" aria-label={intl.formatMessage({ id: "bootSplash.loading", defaultMessage: "Loading" })} />;
}

export default BootSplash;
