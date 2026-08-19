export type UserRole = "mom" | "dad" | "child";
export type TaskCategory = "family" | "personal" | "child_study";
export type Priority = "urgent" | "important" | "normal";
export type TaskStatus = "todo" | "done" | "pending_reward";
export type TaskTimeBucket = "overdue" | "past" | "today" | "tomorrow" | "day_after" | "week";

export type FamilyUser = {
  id: string;
  name: string;
  role: UserRole;
};

export type TaskComment = {
  id: string;
  author: FamilyUser;
  content: string;
  createdAt?: string;
  createdAtLabel: string;
};

export type Task = {
  id: string;
  title: string;
  note: string;
  createdById?: string;
  category: TaskCategory;
  owners: FamilyUser[];
  priority: Priority;
  taskTimeLabel?: string;
  taskDate?: string;
  dueLabel: string;
  dueDate?: string;
  remindLabel?: string;
  reminderDays?: number;
  repeatLabel?: string;
  repeatWeekdays?: number[];
  repeatUntil?: string;
  repeatSeriesId?: string;
  repeatGeneratedFromId?: string;
  rewardStars?: number;
  rewardedBy?: FamilyUser;
  rewardedAt?: string;
  status: TaskStatus;
  completedBy?: FamilyUser;
  completedAt?: string;
  overdue?: boolean;
  timeBucket?: TaskTimeBucket;
  comments?: TaskComment[];
};

export type TaskDraft = {
  title: string;
  note: string;
  category: TaskCategory;
  ownerIds: string[];
  priority: Priority;
  taskTimeLabel?: string;
  taskDate?: string;
  dueLabel: string;
  dueDate?: string;
  remindLabel?: string;
  reminderDays?: number;
  repeatLabel?: string;
  repeatWeekdays?: number[];
  repeatUntil?: string;
  rewardStars?: number;
};

export type ReminderSettings = {
  siteRemindersEnabled: boolean;
  overdueRemindersEnabled: boolean;
  rewardRemindersEnabled: boolean;
  dailyDigestEnabled: boolean;
};
