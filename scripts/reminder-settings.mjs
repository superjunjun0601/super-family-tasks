export const defaultReminderSettings = {
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
];

export const siteRemindersEnabledKey = reminderSettingKeys[0];
export const overdueRemindersEnabledKey = reminderSettingKeys[1];
export const rewardRemindersEnabledKey = reminderSettingKeys[2];
export const dailyDigestEnabledKey = reminderSettingKeys[3];
