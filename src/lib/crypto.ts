import crypto from "node:crypto";

import { getServerConfig } from "@/lib/config";

const ALGORITHM = "aes-256-gcm";

const getEncryptionKey = (): Buffer => {
  const { appEncryptionKey } = getServerConfig();
  return crypto.createHash("sha256").update(appEncryptionKey).digest();
};

export const encryptValue = (value: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${encrypted.toString("base64")}.${tag.toString("base64")}`;
};

export const decryptValue = (payload: string | null | undefined): string | null => {
  if (!payload) {
    return null;
  }

  const [ivRaw, encryptedRaw, tagRaw] = payload.split(".");

  if (!ivRaw || !encryptedRaw || !tagRaw) {
    throw new Error("Encrypted value is malformed.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivRaw, "base64")
  );

  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
};

const toBase64Url = (input: Buffer | string): string =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (input: string): Buffer => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
};

export const signPayload = <T extends object>(payload: T): string => {
  const key = getEncryptionKey();
  const body = toBase64Url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", key).update(body).digest();

  return `${body}.${toBase64Url(signature)}`;
};

export const verifyPayload = <T extends object>(token: string): T | null => {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", getEncryptionKey()).update(body).digest();
  const actual = fromBase64Url(signature);

  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return null;
  }

  const json = fromBase64Url(body).toString("utf8");

  return JSON.parse(json) as T;
};

