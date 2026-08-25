import { getTodayDate } from "@/lib/calendar-utils";
import { parseDateOnly } from "@/lib/date-utils";
import { childStudyCategory, doneStatus } from "@/lib/task-values";
import type { Task } from "@/lib/types";

type RewardTask = Pick<Task, "category" | "dueDate" | "rewardStars" | "taskDate"> & Partial<Pick<Task, "status">>;

export function isOverdueLearningRewardTask(task: RewardTask) {
  if (task.category !== childStudyCategory) return false;
  const referenceDate = parseDateOnly(task.dueDate || task.taskDate);
  if (!referenceDate) return false;
  return referenceDate.getTime() < getTodayDate().getTime();
}

export function getEffectiveRewardStars(task: RewardTask) {
  const rewardStars = Math.max(0, Math.floor(task.rewardStars ?? 0));
  if (!rewardStars) return 0;
  if (task.status === doneStatus) return rewardStars;
  if (!isOverdueLearningRewardTask(task)) return rewardStars;
  return Math.max(1, Math.ceil(rewardStars / 2));
}

export function isRewardReducedForOverdueLearningTask(task: RewardTask) {
  return getEffectiveRewardStars(task) < Math.max(0, Math.floor(task.rewardStars ?? 0));
}
