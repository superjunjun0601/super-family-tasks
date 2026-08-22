import { getTodayDate } from "@/lib/calendar-utils";
import { doneStatus } from "@/lib/task-values";
import type { Task } from "@/lib/types";

export const completedTaskRetentionDays = 15;

export function shouldMoveCompletedTaskToTrash(task: Pick<Task, "completedAt" | "status">) {
  if (task.status !== doneStatus || !task.completedAt) return false;

  const completedAt = new Date(task.completedAt);
  if (Number.isNaN(completedAt.getTime())) return false;

  const cutoff = new Date(getTodayDate());
  cutoff.setDate(cutoff.getDate() - completedTaskRetentionDays);
  return completedAt < cutoff;
}

export function shouldKeepTaskInTimeline(task: Pick<Task, "completedAt" | "status">) {
  return !shouldMoveCompletedTaskToTrash(task);
}
