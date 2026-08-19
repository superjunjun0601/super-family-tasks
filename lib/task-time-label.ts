import { getTodayDate } from "@/lib/calendar-utils";
import { parseDateOnly } from "@/lib/date-utils";
import { maxRepeatWeekdays } from "@/lib/task-limits";
import {
  dayAfterTimeBucket,
  doneStatus,
  overdueTimeBucket,
  pastTimeBucket,
  pendingRewardStatus,
  todayTimeBucket,
  tomorrowTimeBucket,
  weekTimeBucket
} from "@/lib/task-values";
import type { Task, TaskDraft, TaskTimeBucket } from "@/lib/types";

export const repeatWeekdayOptions = [
  { label: "周一", shortLabel: "一", value: 1 },
  { label: "周二", shortLabel: "二", value: 2 },
  { label: "周三", shortLabel: "三", value: 3 },
  { label: "周四", shortLabel: "四", value: 4 },
  { label: "周五", shortLabel: "五", value: 5 },
  { label: "周六", shortLabel: "六", value: 6 },
  { label: "周日", shortLabel: "日", value: 7 }
] as const;

export const repeatWeekdayValues: number[] = repeatWeekdayOptions.map((weekday) => weekday.value);

export function getDraftTimeRangeLabel(draft: Pick<TaskDraft, "dueLabel" | "taskTimeLabel">) {
  const startLabel = draft.taskTimeLabel || draft.dueLabel;
  const endLabel = draft.dueLabel || draft.taskTimeLabel;
  if (!startLabel && !endLabel) return "待填写";
  if (!startLabel || startLabel === endLabel) return endLabel || startLabel;
  return `${startLabel} 到 ${endLabel}`;
}

export function getTaskTimeRangeLabel(task: Pick<Task, "dueDate" | "dueLabel" | "status" | "taskTimeLabel">) {
  const overdueDays = getOverdueDays(task.dueDate);
  if (task.status !== doneStatus && overdueDays > 0) return `${task.dueLabel || task.taskTimeLabel || "待填写"}，逾期 ${overdueDays} 天`;
  const startLabel = task.taskTimeLabel || task.dueLabel;
  const endLabel = task.dueLabel || task.taskTimeLabel;
  if (!startLabel && !endLabel) return "待填写";
  if (!startLabel || startLabel === endLabel) return endLabel || startLabel;
  return `${startLabel} 到 ${endLabel}`;
}

export function normalizeTaskTiming<T extends Pick<Task, "dueDate" | "status" | "taskDate" | "timeBucket">>(task: T): T & {
  overdue: boolean;
  timeBucket: TaskTimeBucket;
} {
  const timeBucket = getTaskTimeBucket(task);
  return {
    ...task,
    overdue: timeBucket === overdueTimeBucket,
    timeBucket
  };
}

export function getTaskTimeBucket(task: Pick<Task, "dueDate" | "status" | "taskDate" | "timeBucket">): TaskTimeBucket {
  const referenceDate = parseDateOnly(task.dueDate || task.taskDate);
  if (!referenceDate) return task.timeBucket ?? todayTimeBucket;

  const today = getTodayDate();
  const dayDiff = Math.round((referenceDate.getTime() - today.getTime()) / 86400000);
  if (dayDiff < 0) return task.status === doneStatus ? pastTimeBucket : overdueTimeBucket;
  if (dayDiff === 0) return todayTimeBucket;
  if (dayDiff === 1) return tomorrowTimeBucket;
  if (dayDiff === 2) return dayAfterTimeBucket;
  if (dayDiff <= 6) return weekTimeBucket;
  return task.timeBucket ?? weekTimeBucket;
}

export function shouldRemindToday(task: Pick<Task, "dueDate" | "reminderDays" | "status">) {
  if (task.status === doneStatus || task.status === pendingRewardStatus) return false;
  if (!task.dueDate || !task.reminderDays) return false;
  const dueDate = parseDateOnly(task.dueDate);
  if (!dueDate) return false;

  const today = getTodayDate();
  const dayDiff = Math.round((dueDate.getTime() - today.getTime()) / 86400000);
  return dayDiff >= 0 && dayDiff <= task.reminderDays;
}

export function getOverdueDays(date?: string) {
  if (!date) return 0;
  const parsedDate = parseDateOnly(date);
  if (!parsedDate) return 0;
  const today = getTodayDate();
  return Math.max(0, Math.round((today.getTime() - parsedDate.getTime()) / 86400000));
}

export function isPastDate(date?: string) {
  return getOverdueDays(date) > 0;
}

export function getRepeatDisplayLabel(repeatLabel?: string, repeatUntil?: string) {
  if (!repeatLabel) return "";
  if (!repeatUntil) return repeatLabel;
  return `${repeatLabel}，至 ${formatDateLabel(repeatUntil)}`;
}

export function getReminderLabel(days: number) {
  if (!days) return "";
  return `提前 ${days} 天每天提醒`;
}

export function getRepeatLabel(selectedWeekdays: number[]) {
  if (selectedWeekdays.length === maxRepeatWeekdays) return "每天重复";
  return `每周${selectedWeekdays.map((weekday) => getRepeatWeekdayShortLabel(weekday)).join("、")}`;
}

export function getRepeatWeekdayValue(char: string): number | undefined {
  if (char === "天") return repeatWeekdayOptions[repeatWeekdayOptions.length - 1]?.value;
  return repeatWeekdayOptions.find((weekday) => weekday.shortLabel === char)?.value;
}

function getRepeatWeekdayShortLabel(value: number) {
  return repeatWeekdayOptions.find((weekday) => weekday.value === value)?.shortLabel ?? "";
}

export function formatDateLabel(date: string | Date, weekdayStyle: "周" | "星期" = "周") {
  const parsedDate = typeof date === "string" ? parseDateOnly(date) : date;
  if (!parsedDate || Number.isNaN(parsedDate.getTime())) return String(date);
  const weekdays =
    weekdayStyle === "星期"
      ? ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]
      : ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日 ${weekdays[parsedDate.getDay()]}`;
}

export function formatDateTimeLabel(date?: string | Date) {
  if (!date) return "刚刚";
  const parsedDate = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(parsedDate.getTime())) return typeof date === "string" ? date : String(date);
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const hour = String(parsedDate.getHours()).padStart(2, "0");
  const minute = String(parsedDate.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

export function getCommentTimeLabel(comment: Pick<NonNullable<Task["comments"]>[number], "createdAt" | "createdAtLabel">) {
  return comment.createdAt ? formatDateTimeLabel(comment.createdAt) : comment.createdAtLabel;
}
