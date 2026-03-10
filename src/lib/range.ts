import type { ProviderFilter, RangeOption } from "@/lib/types";

export const RANGE_TO_DAYS: Record<RangeOption, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90
};

export const parseRange = (range: string | null): RangeOption => {
  if (range === "7d" || range === "30d" || range === "90d") {
    return range;
  }

  return "30d";
};

export const parseProviderFilter = (provider: string | null): ProviderFilter => {
  if (provider === "spotify" || provider === "apple" || provider === "all") {
    return provider;
  }

  return "all";
};

export const parseLimit = (value: string | null, fallback = 20, max = 100): number => {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
};

export const rangeStartIso = (range: RangeOption): string => {
  const days = RANGE_TO_DAYS[range];
  const now = Date.now();
  const start = new Date(now - days * 24 * 60 * 60 * 1000);

  return start.toISOString();
};
