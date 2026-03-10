import { describe, expect, it } from "vitest";

import { canonicalKeyForTrack, sanitizeTrackInput } from "@/lib/sync/normalize";

describe("normalize helpers", () => {
  it("deduplicates by isrc across providers", () => {
    const spotifyKey = canonicalKeyForTrack({
      provider: "spotify",
      providerTrackId: "abc",
      isrc: "USUM71703861",
      name: "Track A",
      artistNames: ["Artist A"],
      durationMs: 200000
    });

    const appleKey = canonicalKeyForTrack({
      provider: "apple",
      providerTrackId: "xyz",
      isrc: "USUM71703861",
      name: "Different title",
      artistNames: ["Different Artist"],
      durationMs: 123000
    });

    expect(spotifyKey).toBe(appleKey);
    expect(spotifyKey).toBe("isrc:usum71703861");
  });

  it("falls back to normalized name + primary artist + duration", () => {
    const first = canonicalKeyForTrack({
      provider: "spotify",
      providerTrackId: "1",
      name: "Cancion de Amor",
      artistNames: ["Cafe Tacvba"],
      durationMs: 242111
    });

    const second = canonicalKeyForTrack({
      provider: "apple",
      providerTrackId: "2",
      name: "Cancion   de   amor",
      artistNames: ["Café Tacvba"],
      durationMs: 242400
    });

    expect(first).toBe(second);
    expect(first.startsWith("fallback:")).toBe(true);
  });

  it("sanitizes missing values safely", () => {
    const sanitized = sanitizeTrackInput({
      provider: "spotify",
      providerTrackId: "",
      name: "",
      artistNames: [],
      durationMs: Number.NaN
    });

    expect(sanitized.providerTrackId.startsWith("unknown-")).toBe(true);
    expect(sanitized.name).toBe("Unknown Track");
    expect(sanitized.artistNames[0]).toBe("Unknown Artist");
    expect(sanitized.durationMs).toBe(0);
  });
});
