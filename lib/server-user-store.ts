import { compareSync, hashSync } from "bcryptjs";
import {
  currentPasswordIncorrectError,
  passwordTooLongError,
  passwordTooShortError,
  userNotFoundError
} from "@/lib/api-error-codes";
import { defaultFamilyPassword, maxPasswordLength, minPasswordLength } from "@/lib/auth-values";
import { userStoreFileName } from "@/lib/data-files";
import { familyUsers } from "@/lib/family-users";
import { createDefaultReminderSettings, sanitizeReminderSettings } from "@/lib/reminder-settings";
import { createManualDataBackup } from "@/lib/server-data-backup";
import { getJsonFileMtime, readJsonFile, writeJsonFile } from "@/lib/server-json-store";
import { hasDatabaseConfig } from "@/lib/server-db";
import { readPersistentState, userStateKey, writePersistentState } from "@/lib/server-state-store";
import type { ReminderSettings } from "@/lib/types";

type UserStore = {
  passwordHashes: Record<string, string>;
  reminderSettings: Record<string, ReminderSettings>;
};

const defaultUserStore: UserStore = {
  passwordHashes: getDefaultPasswordHashes(),
  reminderSettings: Object.fromEntries(familyUsers.map((user) => [user.id, createDefaultReminderSettings()]))
};

const globalUserStore = globalThis as typeof globalThis & {
  __superFamilyUserStore?: UserStore;
  __superFamilyUserStoreMtime?: number;
};

const store =
  globalUserStore.__superFamilyUserStore ??
  (globalUserStore.__superFamilyUserStore = hasDatabaseConfig()
    ? sanitizeUserStore(defaultUserStore)
    : sanitizeUserStore(readJsonFile(userStoreFileName, defaultUserStore)));
let loadedUserStoreMtime =
  globalUserStore.__superFamilyUserStoreMtime ?? (hasDatabaseConfig() ? 0 : getJsonFileMtime(userStoreFileName));
globalUserStore.__superFamilyUserStoreMtime = loadedUserStoreMtime;

export function findPrototypeUser(userId: string) {
  return familyUsers.find((user) => user.id === userId);
}

export async function validatePassword(userId: string, password: string) {
  await refreshUserStoreFromDisk();
  const passwordHash = store.passwordHashes[userId];
  const normalizedPassword = normalizePasswordInput(password);
  return passwordHash ? compareSync(normalizedPassword, passwordHash) : normalizedPassword === defaultFamilyPassword;
}

export async function getPasswordHashForAuth(userId: string) {
  await refreshUserStoreFromDisk();
  return store.passwordHashes[userId] ?? "";
}

export async function getDefaultPasswordUsers() {
  await refreshUserStoreFromDisk();
  return familyUsers.filter((user) => {
    const passwordHash = store.passwordHashes[user.id];
    if (!passwordHash) return true;
    try {
      return compareSync(defaultFamilyPassword, passwordHash);
    } catch {
      return false;
    }
  });
}

export async function changePassword(userId: string, currentPassword: string, nextPassword: string) {
  await refreshUserStoreFromDisk();
  const user = findPrototypeUser(userId);
  const normalizedNextPassword = normalizePasswordInput(nextPassword);
  if (!user) return { ok: false as const, status: 401, error: userNotFoundError };
  if (!(await validatePassword(userId, currentPassword))) {
    return { ok: false as const, status: 400, error: currentPasswordIncorrectError };
  }
  if (normalizedNextPassword.length < minPasswordLength) {
    return { ok: false as const, status: 400, error: passwordTooShortError };
  }
  if (normalizedNextPassword.length > maxPasswordLength) {
    return { ok: false as const, status: 400, error: passwordTooLongError };
  }

  await createManualDataBackup();
  store.passwordHashes[userId] = hashSync(normalizedNextPassword, 10);
  await persistUserStore();
  return { ok: true as const, user };
}

export async function getReminderSettings(userId: string) {
  await refreshUserStoreFromDisk();
  const user = findPrototypeUser(userId);
  if (!user) return null;
  ensureReminderSettings();
  return store.reminderSettings[userId] ?? createDefaultReminderSettings();
}

export async function updateReminderSettings(userId: string, settings: ReminderSettings) {
  await refreshUserStoreFromDisk();
  const user = findPrototypeUser(userId);
  if (!user) return { ok: false as const, status: 401, error: userNotFoundError };

  ensureReminderSettings();
  store.reminderSettings[userId] = sanitizeReminderSettings(settings);
  await persistUserStore();
  return { ok: true as const, settings: store.reminderSettings[userId] };
}

async function persistUserStore() {
  await writePersistentState(userStateKey, userStoreFileName, store);
  if (!hasDatabaseConfig()) {
    loadedUserStoreMtime = getJsonFileMtime(userStoreFileName);
    globalUserStore.__superFamilyUserStoreMtime = loadedUserStoreMtime;
  }
}

async function refreshUserStoreFromDisk() {
  if (hasDatabaseConfig()) {
    const nextStore = sanitizeUserStore(await readPersistentState(userStateKey, userStoreFileName, defaultUserStore));
    store.passwordHashes = nextStore.passwordHashes;
    store.reminderSettings = nextStore.reminderSettings;
    return;
  }
  const currentMtime = getJsonFileMtime(userStoreFileName);
  if (!currentMtime || currentMtime === loadedUserStoreMtime) return;
  const nextStore = sanitizeUserStore(readJsonFile(userStoreFileName, defaultUserStore));
  store.passwordHashes = nextStore.passwordHashes;
  store.reminderSettings = nextStore.reminderSettings;
  loadedUserStoreMtime = currentMtime;
  globalUserStore.__superFamilyUserStoreMtime = loadedUserStoreMtime;
}

function ensureReminderSettings() {
  store.reminderSettings ??= { ...defaultUserStore.reminderSettings };
  for (const user of familyUsers) {
    store.reminderSettings[user.id] = sanitizeReminderSettings(store.reminderSettings[user.id]);
  }
}

function sanitizeUserStore(value: unknown): UserStore {
  const passwordHashes = { ...defaultUserStore.passwordHashes };
  const reminderSettings = { ...defaultUserStore.reminderSettings };

  if (typeof value === "object" && value !== null) {
    const candidateHashes = (value as { passwordHashes?: unknown }).passwordHashes;
    const legacyPasswords = (value as { passwords?: unknown }).passwords;
    const candidateReminderSettings = (value as { reminderSettings?: unknown }).reminderSettings;

    if (typeof candidateHashes === "object" && candidateHashes !== null) {
      for (const user of familyUsers) {
        const passwordHash = (candidateHashes as Record<string, unknown>)[user.id];
        if (typeof passwordHash === "string" && passwordHash.startsWith("$2")) {
          passwordHashes[user.id] = passwordHash;
        } else if (typeof passwordHash === "string" && passwordHash.trim()) {
          passwordHashes[user.id] = hashSync(passwordHash, 10);
        } else {
          passwordHashes[user.id] = hashSync(defaultFamilyPassword, 10);
        }
      }
    } else if (typeof legacyPasswords === "object" && legacyPasswords !== null) {
      for (const user of familyUsers) {
        const password = (legacyPasswords as Record<string, unknown>)[user.id];
        passwordHashes[user.id] = typeof password === "string" && password.trim()
          ? hashSync(password, 10)
          : hashSync(defaultFamilyPassword, 10);
      }
    }

    if (typeof candidateReminderSettings === "object" && candidateReminderSettings !== null) {
      for (const user of familyUsers) {
        reminderSettings[user.id] = sanitizeReminderSettings(
          (candidateReminderSettings as Record<string, unknown>)[user.id]
        );
      }
    }
  }

  return { passwordHashes, reminderSettings };
}

function getDefaultPasswordHashes() {
  return Object.fromEntries(familyUsers.map((user) => [user.id, hashSync(defaultFamilyPassword, 10)]));
}

function normalizePasswordInput(password: string) {
  return password.trim();
}
