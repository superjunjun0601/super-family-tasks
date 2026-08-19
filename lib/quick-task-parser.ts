import { addDays, getNextWeekday, getTodayDate, toInputDate } from "@/lib/calendar-utils";
import { childUserId, dadUserId, momUserId } from "@/lib/family-users";
import { maxReminderDays, maxRewardStars, taskTitleMaxLength } from "@/lib/task-limits";
import { getReminderLabel, getRepeatLabel, getRepeatWeekdayValue, repeatWeekdayValues } from "@/lib/task-time-label";
import { childStudyCategory, familyCategory, importantPriority, normalPriority, personalCategory, urgentPriority } from "@/lib/task-values";
import type { FamilyUser, Task, TaskDraft } from "@/lib/types";

export function parseQuickTask(text: string, currentUser: FamilyUser, defaultOwnerId?: FamilyUser["id"]): TaskDraft {
  const normalizedText = text.trim().replace(/^例如[:：]\s*/, "");
  const ownerIds = getQuickOwnerIds(normalizedText, currentUser, defaultOwnerId);
  const hasChildOwner = ownerIds.includes(childUserId);
  const rewardMatch = normalizedText.match(/奖励\s*(\d+)\s*朵|(\d+)\s*朵小红花/);
  const rewardStars =
    hasChildOwner && currentUser.role !== childUserId && rewardMatch
      ? Math.min(maxRewardStars, Number(rewardMatch?.[1] ?? rewardMatch?.[2] ?? 1))
      : undefined;
  const dueLabel = getQuickDueLabel(normalizedText);
  const dueDate = getQuickDateValue(normalizedText);
  const reminderDays = getQuickReminderDays(normalizedText);
  const remindLabel = getQuickRemindLabel(normalizedText, reminderDays);
  const repeatWeekdays = getQuickRepeatWeekdays(normalizedText);
  const repeatLabel = getQuickRepeatLabel(normalizedText, repeatWeekdays);
  const priority = /紧急|马上|必须|逾期|今天/.test(normalizedText)
    ? urgentPriority
    : /重要|记得|别忘/.test(normalizedText)
      ? importantPriority
      : normalPriority;

  return {
    title: getQuickTitle(normalizedText),
    note: normalizedText,
    category: getQuickCategory(normalizedText, ownerIds, currentUser),
    ownerIds,
    priority,
    taskTimeLabel: dueLabel,
    taskDate: dueDate,
    dueLabel,
    dueDate,
    remindLabel,
    reminderDays,
    repeatLabel,
    repeatWeekdays,
    rewardStars
  };
}

function getQuickCategory(text: string, ownerIds: string[], currentUser: FamilyUser): Task["category"] {
  if (ownerIds.includes(childUserId)) return childStudyCategory;
  if (/个人|自己|我的/.test(text) && ownerIds.length === 1 && ownerIds[0] === currentUser.id) return personalCategory;
  return familyCategory;
}

function getQuickOwnerIds(text: string, currentUser: FamilyUser, defaultOwnerId?: FamilyUser["id"]) {
  const ownerIds: string[] = [];
  if (/妈妈/.test(text)) ownerIds.push(momUserId);
  if (/爸爸/.test(text)) ownerIds.push(dadUserId);
  if (/小柚子|柚子|宝宝|宝贝|孩子/.test(text)) ownerIds.push(childUserId);
  if (!ownerIds.length) {
    if (defaultOwnerId) return [defaultOwnerId];
    return currentUser.role === childUserId ? [childUserId] : [currentUser.id];
  }
  return ownerIds;
}

function getQuickDueLabel(text: string) {
  const timeMatch = text.match(/(今天|明天|后天|周[一二三四五六日天]|本周[一二三四五六日天]?|周末)(早上|上午|中午|下午|晚上|夜里)?\s*([0-2]?\d[:：点][0-5]?\d?)?/);
  if (!timeMatch) return "今天";
  return timeMatch[1];
}

function getQuickDateValue(text: string) {
  const dateMatch = text.match(/今天|明天|后天|本周[一二三四五六日天]?|周[一二三四五六日天]|周末/);
  const token = dateMatch?.[0] ?? "今天";
  const today = getTodayDate();
  if (token === "今天") return toInputDate(today);
  if (token === "明天") return toInputDate(addDays(today, 1));
  if (token === "后天") return toInputDate(addDays(today, 2));
  if (token === "周末") return toInputDate(getNextWeekday(today, 6));
  const weekdayMatch = token.match(/[一二三四五六日天]/);
  if (!weekdayMatch) return toInputDate(today);
  const weekdayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7
  };
  return toInputDate(getNextWeekday(today, weekdayMap[weekdayMatch[0]] ?? 1));
}

function getQuickReminderDays(text: string) {
  const beforeMatch = text.match(/提前\s*(\d+)\s*天/);
  if (!beforeMatch) return undefined;
  const days = Number(beforeMatch[1]);
  return days > 0 ? Math.min(days, maxReminderDays) : undefined;
}

function getQuickRemindLabel(text: string, reminderDays?: number) {
  if (reminderDays) return getReminderLabel(reminderDays);
  if (/提醒/.test(text)) return "按最晚完成日期前提醒";
  return undefined;
}

function getQuickRepeatWeekdays(text: string) {
  if (/每天|每日/.test(text)) return [...repeatWeekdayValues];
  const weeklyMatch = text.match(/每周([一二三四五六日天、，和]+)/);
  if (!weeklyMatch) return undefined;
  const weekdays = Array.from(weeklyMatch[1])
    .map(getRepeatWeekdayValue)
    .filter((weekday): weekday is number => Boolean(weekday));
  return [...new Set(weekdays)].sort((first, second) => first - second);
}

function getQuickRepeatLabel(text: string, repeatWeekdays?: number[]) {
  if (/每天|每日/.test(text)) return "每天重复";
  if (repeatWeekdays?.length) {
    return getRepeatLabel(repeatWeekdays);
  }
  if (/重复/.test(text)) return "重复任务";
  return undefined;
}

function getQuickTitle(text: string) {
  const withoutReward = text.replace(/奖励\s*\d+\s*朵/g, "").replace(/\d+\s*朵小红花/g, "");
  const withoutReminder = withoutReward.replace(/提前\s*\d+\s*天提醒/g, "").replace(/提醒/g, "");
  const withoutTime = withoutReminder.replace(/(今天|明天|后天|周[一二三四五六日天]|本周[一二三四五六日天]?|周末)(早上|上午|中午|下午|晚上|夜里)?\s*([0-2]?\d[:：点][0-5]?\d?)?/g, "");
  const compact = withoutTime.replace(/^(妈妈|爸爸|小柚子|柚子|宝宝|宝贝|孩子)/, "").replace(/[，。,.]/g, " ").trim();
  return (compact || text.trim()).slice(0, taskTitleMaxLength);
}
