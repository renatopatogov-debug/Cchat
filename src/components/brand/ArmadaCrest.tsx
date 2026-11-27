import { useIntl } from "@/i18n";
import { APP_NAME } from "@/lib/platform";

/**
 * Cchat Signal-inspired brand mark: rounded blue speech-bubble with center node.
 * Preserves the exact component signatures & i18n IDs expected across onboarding
 * and BootSplash so all existing callers and i18n checks continue passing.
 */

export const CCHAT_BUBBLE_PATH =
  "M47.2 97.3 A40 40 0 1 0 30.7 80.8 L22.5 104.5 L47.2 97.3 Z";

// Exported for ArmadaWreck.tsx compatibility so typechecking remains 100% green.
export const SAIL = CCHAT_BUBBLE_PATH;
export const CARET = "M56.5 62 A9.5 9.5 0 1 0 75.5 62 A9.5 9.5 0 1 0 56.5 62 Z";
export const WAVES = [
  "M32 108 H96",
  "M40 115 H88",
  "M48 122 H80",
];

export function ArmadaCrest({
  size = 112,
  className = "",
  loop = false,
}: {
  size?: number;
  className?: string;
  loop?: boolean;
}) {
  const intl = useIntl();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label={intl.formatMessage({ id: "armadaCrest.logo", defaultMessage: "{app} logo" }, { app: APP_NAME })}
      className={`relative drop-shadow-[0_10px_28px_rgba(44,107,237,0.32)] ${className}`}
    >
      <rect width="128" height="128" rx="32" fill="#2C6BED" />
      <g transform="translate(8 8) scale(0.875)">
        <path
          d={CCHAT_BUBBLE_PATH}
          stroke="#FFFFFF"
          strokeWidth={8.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={66}
          cy={62}
          r={9.5}
          fill="#FFFFFF"
          className={loop ? "animate-pulse" : undefined}
        />
      </g>
    </svg>
  );
}

export function ArmadaKey({ size = 112, className = "" }: { size?: number; className?: string }) {
  const intl = useIntl();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label={intl.formatMessage({ id: "armadaCrest.secretKey", defaultMessage: "Secret key" })}
      className={`relative drop-shadow-[0_10px_28px_rgba(44,107,237,0.28)] ${className}`}
    >
      <rect width="128" height="128" rx="32" fill="#2C6BED" />
      <circle cx="54" cy="56" r="16" stroke="#FFFFFF" strokeWidth="8" />
      <path
        d="M66 68 L94 96 M84 86 L92 78"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArmadaIdentity({ size = 112, className = "" }: { size?: number; className?: string }) {
  const intl = useIntl();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label={intl.formatMessage({ id: "armadaCrest.profileIdentity", defaultMessage: "Profile identity" })}
      className={`relative drop-shadow-[0_10px_28px_rgba(44,107,237,0.28)] ${className}`}
    >
      <rect width="128" height="128" rx="32" fill="#2C6BED" />
      <circle cx="64" cy="48" r="15" stroke="#FFFFFF" strokeWidth="8" />
      <path
        d="M36 96 C36 78 92 78 92 96"
        stroke="#FFFFFF"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArmadaCrestKeyframes() {
  return (
    <style>{`
      @keyframes armada-caret {
        0%, 49% { opacity: 1; }
        50%, 100% { opacity: 0; }
      }
      @keyframes armada-line-in {
        from { opacity: 0; transform: translateY(3px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (prefers-reduced-motion: reduce) {
        [class*="animate-[armada-"] { animation: none !important; }
      }
      html[data-reduce-motion] [class*="animate-[armada-"] { animation: none !important; }
    `}</style>
  );
}
