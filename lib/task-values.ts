import type { Priority, TaskCategory, TaskStatus, TaskTimeBucket } from "@/lib/types";

export const familyCategory = "family" satisfies TaskCategory;
export const personalCategory = "personal" satisfies TaskCategory;
export const childStudyCategory = "child_study" satisfies TaskCategory;

export const urgentPriority = "urgent" satisfies Priority;
export const importantPriority = "important" satisfies Priority;
export const normalPriority = "normal" satisfies Priority;

export const todoStatus = "todo" satisfies TaskStatus;
export const doneStatus = "done" satisfies TaskStatus;
export const pendingRewardStatus = "pending_reward" satisfies TaskStatus;

export const overdueTimeBucket = "overdue" satisfies TaskTimeBucket;
export const pastTimeBucket = "past" satisfies TaskTimeBucket;
export const todayTimeBucket = "today" satisfies TaskTimeBucket;
export const tomorrowTimeBucket = "tomorrow" satisfies TaskTimeBucket;
export const dayAfterTimeBucket = "day_after" satisfies TaskTimeBucket;
export const weekTimeBucket = "week" satisfies TaskTimeBucket;

export const taskCategoryValues = [
  familyCategory,
  personalCategory,
  childStudyCategory
] as const satisfies readonly TaskCategory[];

export const taskPriorityValues = [
  urgentPriority,
  importantPriority,
  normalPriority
] as const satisfies readonly Priority[];

export const taskStatusValues = [
  todoStatus,
  doneStatus,
  pendingRewardStatus
] as const satisfies readonly TaskStatus[];

export const taskTimeBucketValues = [
  overdueTimeBucket,
  pastTimeBucket,
  todayTimeBucket,
  tomorrowTimeBucket,
  dayAfterTimeBucket,
  weekTimeBucket
] as const satisfies readonly TaskTimeBucket[];
