import { maxFailedLoginAttempts } from "@/lib/auth-values";
import { familyUserIds } from "@/lib/family-users";
import { hasDatabaseConfig, prisma } from "@/lib/server-db";

type LoginAttemptRecord = {
  blockedUntil: number;
  failedAt: number[];
};

const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const BLOCK_DURATION_MS = 60 * 1000;
const MAX_TRACKED_LOGIN_KEYS = 1000;
const PRUNE_INTERVAL_MS = 60 * 1000;
let lastPrunedAt = 0;

const globalLoginAttempts = globalThis as typeof globalThis & {
  __superFamilyLoginAttempts?: Map<string, LoginAttemptRecord>;
};

const loginAttempts =
  globalLoginAttempts.__superFamilyLoginAttempts ??
  (globalLoginAttempts.__superFamilyLoginAttempts = new Map<string, LoginAttemptRecord>());

export async function getLoginBlockStatus(request: Request, userId: string) {
  if (hasDatabaseConfig()) {
    const record = await prisma.loginAttempt.findUnique({ where: { key: getLoginAttemptKey(request, userId) } });
    if (!record) return { blocked: false as const, retryAfterSeconds: 0 };
    const now = Date.now();
    const blockedUntil = record.blockedUntil?.getTime() ?? 0;
    return blockedUntil > now
      ? { blocked: true as const, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000)) }
      : { blocked: false as const, retryAfterSeconds: 0 };
  }
  pruneLoginAttempts();
  const record = loginAttempts.get(getLoginAttemptKey(request, userId));
  if (!record) return { blocked: false as const, retryAfterSeconds: 0 };

  const now = Date.now();
  if (record.blockedUntil > now) {
    return {
      blocked: true as const,
      retryAfterSeconds: Math.max(1, Math.ceil((record.blockedUntil - now) / 1000))
    };
  }

  return { blocked: false as const, retryAfterSeconds: 0 };
}

export async function recordFailedLogin(request: Request, userId: string) {
  if (hasDatabaseConfig()) {
    const key = getLoginAttemptKey(request, userId);
    const now = Date.now();
    const existing = await prisma.loginAttempt.findUnique({ where: { key } });
    const previousFailedAt = Array.isArray(existing?.failedAt)
      ? existing.failedAt.filter((value): value is number => typeof value === "number")
      : [];
    const failedAt = [...previousFailedAt, now].filter((timestamp) => now - timestamp <= ATTEMPT_WINDOW_MS);
    const blockedUntil = failedAt.length >= maxFailedLoginAttempts ? now + BLOCK_DURATION_MS : existing?.blockedUntil?.getTime() ?? 0;
    await prisma.loginAttempt.upsert({
      where: { key },
      create: {
        key,
        blockedUntil: blockedUntil > now ? new Date(blockedUntil) : null,
        failedAt
      },
      update: {
        blockedUntil: blockedUntil > now ? new Date(blockedUntil) : null,
        failedAt
      }
    });
    return {
      blocked: blockedUntil > now,
      retryAfterSeconds: blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0
    };
  }
  pruneLoginAttempts();
  const key = getLoginAttemptKey(request, userId);
  const now = Date.now();
  const record = loginAttempts.get(key) ?? { blockedUntil: 0, failedAt: [] };
  const failedAt = [...record.failedAt, now].filter((timestamp) => now - timestamp <= ATTEMPT_WINDOW_MS);
  const blockedUntil = failedAt.length >= maxFailedLoginAttempts ? now + BLOCK_DURATION_MS : record.blockedUntil;

  loginAttempts.set(key, { blockedUntil, failedAt });

  return {
    blocked: blockedUntil > now,
    retryAfterSeconds: blockedUntil > now ? Math.ceil((blockedUntil - now) / 1000) : 0
  };
}

export async function clearFailedLogins(request: Request, userId: string) {
  if (hasDatabaseConfig()) {
    await prisma.loginAttempt.deleteMany({ where: { key: getLoginAttemptKey(request, userId) } });
    return;
  }
  loginAttempts.delete(getLoginAttemptKey(request, userId));
}

function pruneLoginAttempts() {
  const now = Date.now();
  if (now - lastPrunedAt < PRUNE_INTERVAL_MS && loginAttempts.size <= MAX_TRACKED_LOGIN_KEYS) return;
  lastPrunedAt = now;

  for (const [key, record] of loginAttempts) {
    const hasRecentFailure = record.failedAt.some((timestamp) => now - timestamp <= ATTEMPT_WINDOW_MS);
    const isBlocked = record.blockedUntil > now;
    if (!hasRecentFailure && !isBlocked) loginAttempts.delete(key);
  }

  if (loginAttempts.size <= MAX_TRACKED_LOGIN_KEYS) return;
  const oldestKeys = [...loginAttempts.entries()]
    .sort((first, second) => {
      const firstLatest = Math.max(first[1].blockedUntil, ...first[1].failedAt);
      const secondLatest = Math.max(second[1].blockedUntil, ...second[1].failedAt);
      return firstLatest - secondLatest;
    })
    .slice(0, loginAttempts.size - MAX_TRACKED_LOGIN_KEYS)
    .map(([key]) => key);

  for (const key of oldestKeys) loginAttempts.delete(key);
}

function getLoginAttemptKey(request: Request, userId: string) {
  return `${getClientIp(request)}:${getLoginAttemptUserBucket(userId)}`;
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "local";
}

function getLoginAttemptUserBucket(userId: string) {
  return familyUserIds.includes(userId as (typeof familyUserIds)[number]) ? userId : "unknown";
}
