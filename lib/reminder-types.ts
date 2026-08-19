export const overdueReminderType = "overdue";
export const dueSoonReminderType = "due_soon";
export const rewardPendingReminderType = "reward_pending";

export const reminderTypes = [
  overdueReminderType,
  dueSoonReminderType,
  rewardPendingReminderType
] as const;

export type ReminderType = (typeof reminderTypes)[number];
