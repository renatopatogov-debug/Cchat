/**
 * Platform and OS detection helpers shared with `src/lib/releases.ts`.
 */

export type DownloadOs = "linux" | "windows" | "macos" | "android" | "ios";

export interface DownloadPlatform {
  os: DownloadOs;
  name: string;
}

export const DOWNLOAD_PLATFORMS: DownloadPlatform[] = [
  { os: "linux", name: "Linux" },
  { os: "windows", name: "Windows" },
  { os: "macos", name: "macOS" },
  { os: "android", name: "Android" },
  { os: "ios", name: "iPhone & iPad" },
];

/** Shell command to run a downloaded AppImage file. */
export function installCommand(filename: string): string | undefined {
  if (/\.AppImage$/i.test(filename)) return `chmod +x ${filename} && ./${filename}`;
  return undefined;
}

/** Whether the package format is distributed via a system repository (.deb/.flatpak). */
export function isRepublishedPackage(filename: string): boolean {
  return /\.(deb|flatpak)$/i.test(filename);
}

/**
 * Guess the visitor's OS from a user-agent. Order matters: Android UAs contain
 * "Linux" and iOS "like Mac OS X". A touch-capable "Macintosh" is iPadOS 13+.
 */
export function detectOs(ua: string, touchPoints = 0): DownloadOs | undefined {
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/macintosh|mac os x/i.test(ua)) return touchPoints > 1 ? "ios" : "macos";
  if (/windows|win32|win64/i.test(ua)) return "windows";
  if (/cros|linux|x11/i.test(ua)) return "linux";
  return undefined;
}

export function detectCurrentOs(): DownloadOs | undefined {
  if (typeof navigator === "undefined") return undefined;
  return detectOs(navigator.userAgent, navigator.maxTouchPoints ?? 0);
}
