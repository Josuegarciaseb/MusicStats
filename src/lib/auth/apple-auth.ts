import { ensureProviderConfigured } from "@/lib/config";
import { saveAppleConnection } from "@/lib/connections";
import { ApiError } from "@/lib/errors";
import { createAppleDeveloperToken } from "@/lib/apple";

export const getAppleDeveloperToken = (): string => {
  ensureProviderConfigured("apple");
  return createAppleDeveloperToken();
};

export const connectAppleMusicToken = (musicUserToken: string): void => {
  ensureProviderConfigured("apple");

  if (!musicUserToken?.trim()) {
    throw new ApiError("musicUserToken is required.", 400);
  }

  saveAppleConnection(musicUserToken.trim());
};
