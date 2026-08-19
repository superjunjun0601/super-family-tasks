import { z } from "zod";
import {
  invalidRepeatUntilError,
  invalidTaskDateError,
  invalidTaskDateRangeError,
  invalidTaskDraftError,
  invalidTaskOwnersError
} from "@/lib/api-error-codes";
import { parseDateOnly } from "@/lib/date-utils";
import { childUserId, familyUserIds, familyUsers } from "@/lib/family-users";
import {
  maxReminderDays,
  maxRepeatWeekday,
  maxRepeatWeekdays,
  maxRewardStars,
  minReminderDays,
  minRepeatWeekday,
  minRewardStars,
  taskNoteMaxLength,
  taskRepeatLabelMaxLength,
  taskShortLabelMaxLength,
  taskTitleMaxLength
} from "@/lib/task-limits";
import {
  childStudyCategory,
  familyCategory,
  normalPriority,
  taskCategoryValues,
  taskPriorityValues
} from "@/lib/task-values";
import type { TaskDraft } from "@/lib/types";

const userIds = familyUsers.map((user) => user.id);

const taskDraftSchema = z.object({
  title: z.string().trim().min(1).max(taskTitleMaxLength),
  note: z.string().trim().max(taskNoteMaxLength).optional().default(""),
  category: z.enum(taskCategoryValues).default(familyCategory),
  ownerIds: z.array(z.enum(familyUserIds)).min(1),
  priority: z.enum(taskPriorityValues).default(normalPriority),
  taskTimeLabel: z.string().trim().min(1).max(taskShortLabelMaxLength),
  taskDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueLabel: z.string().trim().min(1).max(taskShortLabelMaxLength),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  remindLabel: z.string().trim().max(taskShortLabelMaxLength).optional(),
  reminderDays: z.number().int().min(minReminderDays).max(maxReminderDays).optional(),
  repeatLabel: z.string().trim().max(taskRepeatLabelMaxLength).optional(),
  repeatWeekdays: z.array(z.number().int().min(minRepeatWeekday).max(maxRepeatWeekday)).max(maxRepeatWeekdays).optional(),
  repeatUntil: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  rewardStars: z.number().int().min(minRewardStars).max(maxRewardStars).optional()
});

export function parseTaskDraft(input: unknown): { ok: true; draft: TaskDraft } | { ok: false; error: string } {
  const result = taskDraftSchema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: invalidTaskDraftError };
  }

  const draft = result.data;
  const ownerIds = Array.from(
    new Set(draft.category === childStudyCategory ? [...draft.ownerIds, childUserId] : draft.ownerIds)
  ).filter((id) => userIds.includes(id));
  if (!ownerIds.length) return { ok: false, error: invalidTaskOwnersError };
  if (!isValidInputDate(draft.taskDate) || !isValidInputDate(draft.dueDate)) {
    return { ok: false, error: invalidTaskDateError };
  }
  if (draft.repeatUntil && !isValidInputDate(draft.repeatUntil)) {
    return { ok: false, error: invalidRepeatUntilError };
  }
  if (draft.taskDate > draft.dueDate) return { ok: false, error: invalidTaskDateRangeError };
  if (draft.repeatWeekdays?.length && draft.repeatUntil && draft.repeatUntil < draft.taskDate) {
    return { ok: false, error: invalidRepeatUntilError };
  }

  return {
    ok: true,
    draft: {
      ...draft,
      category: ownerIds.includes(childUserId) ? childStudyCategory : draft.category,
      ownerIds,
      reminderDays: draft.reminderDays || undefined,
      repeatLabel: draft.repeatWeekdays?.length ? draft.repeatLabel : undefined,
      repeatWeekdays: draft.repeatWeekdays?.length ? Array.from(new Set(draft.repeatWeekdays)).sort() : undefined,
      repeatUntil: draft.repeatWeekdays?.length ? draft.repeatUntil : undefined,
      rewardStars: ownerIds.includes(childUserId) ? draft.rewardStars : undefined
    }
  };
}

export function applyDraftPermission(draft: TaskDraft, currentUserId: string): TaskDraft {
  const currentUser = familyUsers.find((user) => user.id === currentUserId);
  if (currentUser?.role !== childUserId) return draft;

  return {
    ...draft,
    category: childStudyCategory,
    ownerIds: [childUserId],
    rewardStars: undefined
  };
}

function isValidInputDate(value: string) {
  return Boolean(parseDateOnly(value));
}
