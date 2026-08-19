import { parseDateOnly } from "@/lib/date-utils";
import { getTodayDate } from "@/lib/calendar-utils";
import { getTaskTimeBucket } from "@/lib/task-time-label";
import { weekTimeBucket } from "@/lib/task-values";
import type { Task, TaskTimeBucket } from "@/lib/types";

export function getTasksForTimeBucket(tasks: Task[], bucket: TaskTimeBucket) {
  return tasks
    .filter((task) => (bucket === weekTimeBucket ? isTaskInCurrentWeek(task) : getTaskTimeBucket(task) === bucket))
    .sort(compareTasksByDate);
}

export function sortTasksByDate(tasks: Task[]) {
  return [...tasks].sort(compareTasksByDate);
}

function compareTasksByDate(firstTask: Task, secondTask: Task) {
  return getTaskSortTime(firstTask) - getTaskSortTime(secondTask);
}

function getTaskSortTime(task: Task) {
  const date = parseDateOnly(task.taskDate || task.dueDate);
  return date?.getTime() ?? Number.MAX_SAFE_INTEGER;
}

function isTaskInCurrentWeek(task: Task) {
  const date = parseDateOnly(task.dueDate || task.taskDate);
  if (!date) return getTaskTimeBucket(task) === weekTimeBucket;

  const today = getTodayDate();
  const dayDiff = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (dayDiff <= 2) return false;

  const todayWeekday = today.getDay() || 7;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - todayWeekday + 1);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return date.getTime() >= weekStart.getTime() && date.getTime() <= weekEnd.getTime();
}
