import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_PLATFORMS,
  detectOs,
  installCommand,
  isRepublishedPackage,
} from "@/lib/downloads";

/** Real user-agent strings, since the ordering bugs only show up in real ones. */
const UA = {
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  chromeos: "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

describe("detectOs", () => {
  it("reads Android before the Linux its user-agent also claims", () => {
    expect(detectOs(UA.androidPhone)).toBe("android");
  });

  it("reads iOS before the 'like Mac OS X' its user-agent also claims", () => {
    expect(detectOs(UA.iphone)).toBe("ios");
  });

  it("tells an iPad in desktop mode from a Mac by its touchscreen", () => {
    expect(detectOs(UA.ipadDesktopMode, 5)).toBe("ios");
    expect(detectOs(UA.mac, 0)).toBe("macos");
  });

  it("recognizes the desktop platforms", () => {
    expect(detectOs(UA.windows)).toBe("windows");
    expect(detectOs(UA.linux)).toBe("linux");
    expect(detectOs(UA.chromeos)).toBe("linux");
  });

  it("returns undefined rather than guessing at an unknown agent", () => {
    expect(detectOs("some-crawler/1.0")).toBeUndefined();
    expect(detectOs("")).toBeUndefined();
  });
});

describe("download platforms", () => {
  it("covers every detectable OS exactly once", () => {
    const seen = DOWNLOAD_PLATFORMS.map((p) => p.os);
    expect(new Set(seen).size).toBe(seen.length);
    for (const os of ["linux", "windows", "macos", "android", "ios"]) {
      expect(seen).toContain(os);
    }
  });
});

describe("installCommand & isRepublishedPackage", () => {
  it("writes chmod +x against the versioned AppImage filename", () => {
    expect(installCommand("Cchat-v1.2.3.AppImage")).toBe("chmod +x Cchat-v1.2.3.AppImage && ./Cchat-v1.2.3.AppImage");
    expect(installCommand("Cchat-v1.2.3.deb")).toBeUndefined();
    expect(installCommand("Cchat-v1.2.3.apk")).toBeUndefined();
  });

  it("treats .deb and .flatpak as repository-served formats", () => {
    expect(isRepublishedPackage("Cchat-v1.2.3.deb")).toBe(true);
    expect(isRepublishedPackage("Cchat-v1.2.3.flatpak")).toBe(true);
    expect(isRepublishedPackage("Cchat-v1.2.3.AppImage")).toBe(false);
    expect(isRepublishedPackage("Cchat-v1.2.3.apk")).toBe(false);
  });
});
