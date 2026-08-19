import type { ReminderSettings } from "@/lib/types";

export const defaultReminderSettings: Readonly<ReminderSettings> = {
  dailyDigestEnabled: false,
  overdueRemindersEnabled: true,
  rewardRemindersEnabled: true,
  siteRemindersEnabled: true
};

export const reminderSettingKeys = [
  "siteRemindersEnabled",
  "overdueRemindersEnabled",
  "rewardRemindersEnabled",
  "dailyDigestEnabled"
] as const satisfies readonly (keyof ReminderSettings)[];

export const siteRemindersEnabledKey = reminderSettingKeys[0];
export const overdueRemindersEnabledKey = reminderSettingKeys[1];
export const rewardRemindersEnabledKey = reminderSettingKeys[2];
export const dailyDigestEnabledKey = reminderSettingKeys[3];

export function createDefaultReminderSettings(): ReminderSettings {
  return { ...defaultReminderSettings };
}

export function sanitizeReminderSettings(value: unknown): ReminderSettings {
  const defaults = defaultReminderSettings;
  if (!value || typeof value !== "object") return createDefaultReminderSettings();
  const candidate = value as Partial<Record<keyof ReminderSettings, unknown>>;
  return {
    dailyDigestEnabled:
      typeof candidate.dailyDigestEnabled === "boolean" ? candidate.dailyDigestEnabled : defaults.dailyDigestEnabled,
    overdueRemindersEnabled:
      typeof candidate.overdueRemindersEnabled === "boolean"
        ? candidate.overdueRemindersEnabled
        : defaults.overdueRemindersEnabled,
    rewardRemindersEnabled:
      typeof candidate.rewardRemindersEnabled === "boolean"
        ? candidate.rewardRemindersEnabled
        : defaults.rewardRemindersEnabled,
    siteRemindersEnabled:
      typeof candidate.siteRemindersEnabled === "boolean" ? candidate.siteRemindersEnabled : defaults.siteRemindersEnabled
  };
}

export function parseReminderSettingsUpdate(value: unknown): ReminderSettings | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const settings = candidate.reminderSettings && typeof candidate.reminderSettings === "object"
    ? (candidate.reminderSettings as Record<string, unknown>)
    : candidate;

  if (!reminderSettingKeys.every((key) => typeof settings[key] === "boolean")) return null;

  return {
    dailyDigestEnabled: settings.dailyDigestEnabled as boolean,
    overdueRemindersEnabled: settings.overdueRemindersEnabled as boolean,
    rewardRemindersEnabled: settings.rewardRemindersEnabled as boolean,
    siteRemindersEnabled: settings.siteRemindersEnabled as boolean
  };
}
