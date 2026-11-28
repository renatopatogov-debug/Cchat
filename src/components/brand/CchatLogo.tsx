import { cn } from "@/lib/utils";

/** Clean Signal-blue Cchat brand mark (speech bubble + cryptographic node). */
export function CchatLogo({
  size = 72,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      role="img"
      aria-label="Cchat"
      className={cn("shrink-0 select-none", className)}
    >
      <rect width="128" height="128" rx="32" fill="#2C6BED" />
      <g transform="translate(8 8) scale(0.875)">
        <path
          d="M47.2 97.3 A40 40 0 1 0 30.7 80.8 L22.5 104.5 L47.2 97.3 Z"
          stroke="#FFFFFF"
          strokeWidth="8.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="66" cy="62" r="9.5" fill="#FFFFFF" />
      </g>
    </svg>
  );
}
