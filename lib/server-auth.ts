import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authCookieName, authCookieVersion, authSecretPlaceholderSnippet, localDevAuthSecret } from "@/lib/auth-values";
import { familyUsers } from "@/lib/family-users";
import { getPasswordHashForAuth } from "@/lib/server-user-store";

export const AUTH_COOKIE_NAME = authCookieName;
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const AUTH_COOKIE_VERSION = authCookieVersion;

export async function getCurrentUserId(_request?: Request) {
  const cookieUserId = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  const userId = await verifyAuthCookieValue(cookieUserId);
  return familyUsers.some((user) => user.id === userId) ? userId : "";
}

export function findFamilyUser(userId: string) {
  return familyUsers.find((user) => user.id === userId);
}

export async function createAuthCookieValue(userId: string) {
  return `${AUTH_COOKIE_VERSION}.${userId}.${await signUserId(userId)}`;
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production"
  };
}

export function getClearAuthCookieOptions() {
  return {
    ...getAuthCookieOptions(),
    maxAge: 0
  };
}

export function hasConfiguredAuthSecret() {
  const authSecret = getAuthSecret();
  return Boolean(authSecret && authSecret !== localDevAuthSecret && !authSecret.includes(authSecretPlaceholderSnippet));
}

async function verifyAuthCookieValue(value?: string) {
  if (!value) return "";
  const [version, userId, signature] = value.split(".");
  if (version !== AUTH_COOKIE_VERSION || !userId || !signature) return "";
  if (!familyUsers.some((user) => user.id === userId)) return "";
  return signaturesMatch(signature, await signUserId(userId)) ? userId : "";
}

async function signUserId(userId: string) {
  return createHmac("sha256", getAuthSecret())
    .update(`${userId}:${await getPasswordHashForAuth(userId)}`)
    .digest("base64url");
}

function signaturesMatch(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);
  return firstBuffer.length === secondBuffer.length && timingSafeEqual(firstBuffer, secondBuffer);
}

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || localDevAuthSecret;
}
