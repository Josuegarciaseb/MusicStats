import crypto from "node:crypto";

import { getServerConfig } from "@/lib/config";
import { signPayload, verifyPayload } from "@/lib/crypto";
import type { Provider } from "@/lib/types";

interface OAuthStatePayload {
  provider: Provider;
  nonce: string;
  issuedAt: string;
}

export const createOAuthState = (provider: Provider): string => {
  const payload: OAuthStatePayload = {
    provider,
    nonce: crypto.randomBytes(8).toString("hex"),
    issuedAt: new Date().toISOString()
  };

  return signPayload(payload);
};

export const validateOAuthState = (state: string, provider: Provider): boolean => {
  const payload = verifyPayload<OAuthStatePayload>(state);

  if (!payload) {
    return false;
  }

  if (payload.provider !== provider || !payload.issuedAt) {
    return false;
  }

  const issuedAtMs = Date.parse(payload.issuedAt);

  if (!Number.isFinite(issuedAtMs)) {
    return false;
  }

  const maxAgeMs = getServerConfig().oauthStateTtlMinutes * 60 * 1000;
  return Date.now() - issuedAtMs <= maxAgeMs;
};
