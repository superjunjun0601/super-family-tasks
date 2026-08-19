import { parseDateOnly } from "@/lib/date-utils";
import {
  commentTooLongError,
  emptyCommentError,
  noPermissionError,
  taskNotChildTaskError,
  taskNotFoundError,
  taskNotPendingRewardError,
  userNotFoundError
} from "@/lib/api-error-codes";
import { childUserId, dadUserId, familyUsers, momUserId } from "@/lib/family-users";
import { tasks as seedTasks } from "@/lib/mock-data";
import { addDays, getTodayDate, toInputDate } from "@/lib/calendar-utils";
import { taskStoreFileName } from "@/lib/data-files";
import { hasOwnerId, isChildTask, isTaskOwner } from "@/lib/task-helpers";
import { formatDateLabel, formatDateTimeLabel, normalizeTaskTiming } from "@/lib/task-time-label";
import { tasksChangedEventType } from "@/lib/server-event-types";
import { publishServerEvent } from "@/lib/server-events";
import { getJsonFileMtime, readJsonFile, writeJsonFile } from "@/lib/server-json-store";
import { hasDatabaseConfig } from "@/lib/server-db";
import { readPersistentState, taskStateKey, writePersistentState } from "@/lib/server-state-store";
import { maxCommentLength, maxRepeatWeekday, maxRepeatWeekdays, maxRewardStars, minRepeatWeekday, minRewardStars } from "@/lib/task-limits";
import { seriesTaskUpdateScope, singleTaskUpdateScope, type TaskUpdateScope } from "@/lib/task-update-scope";
import {
  childStudyCategory,
  doneStatus,
  pendingRewardStatus,
  taskCategoryValues,
  taskPriorityValues,
  taskStatusValues,
  todoStatus,
} from "@/lib/task-values";
import type { FamilyUser, Task, TaskDraft, TaskStatus } from "@/lib/types";

type TaskMutationResult =
  | { ok: true; task: Task }
  | { ok: false; status: number; error: string };

type TaskStore = {
  tasks: Task[];
  trashTasks: Task[];
};

const globalTaskStore = globalThis as typeof globalThis & {
  __superFamilyTaskStore?: TaskStore;
  __superFamilyTaskStoreMtime?: number;
};

const defaultTaskStore: TaskStore = {
  tasks: seedTasks.map((task) => ({ ...task })),
  trashTasks: []
};

const store =
  globalTaskStore.__superFamilyTaskStore ??
  (globalTaskStore.__superFamilyTaskStore = sanitizeTaskStore(readJsonFile(taskStoreFileName, defaultTaskStore)));
let loadedTaskStoreMtime = globalTaskStore.__superFamilyTaskStoreMtime ?? getJsonFileMtime(taskStoreFileName);
globalTaskStore.__superFamilyTaskStoreMtime = loadedTaskStoreMtime;

export async function listTasks() {
  await refreshTaskStoreFromDisk();
  return store.tasks;
}

export async function listVisibleTasks(currentUserId: string) {
  await refreshTaskStoreFromDisk();
  return store.tasks.filter((task) => canViewTask(task, currentUserId));
}

export async function listTrashTasks() {
  await refreshTaskStoreFromDisk();
  return store.trashTasks;
}

export async function listVisibleTrashTasks(currentUserId: string) {
  await refreshTaskStoreFromDisk();
  return store.trashTasks.filter((task) => canManageTask(task, currentUserId));
}

export async function getVisibleTask(taskId: string, currentUserId: string) {
  await refreshTaskStoreFromDisk();
  const task = findTask(taskId);
  return task && canViewTask(task, currentUserId) ? task : null;
}

export async function createTask(draft: TaskDraft, currentUserId = momUserId): Promise<Task> {
  await refreshTaskStoreFromDisk();
  const task = normalizeTaskTiming({
    id: crypto.randomUUID(),
    title: draft.title.trim(),
    note: draft.note.trim(),
    createdById: currentUserId,
    category: draft.category,
    owners: familyUsers.filter((user) => draft.ownerIds.includes(user.id)),
    priority: draft.priority,
    taskTimeLabel: draft.taskTimeLabel,
    taskDate: draft.taskDate,
    dueLabel: draft.dueLabel,
    dueDate: draft.dueDate,
    remindLabel: draft.remindLabel,
    reminderDays: draft.reminderDays,
    repeatLabel: draft.repeatLabel,
    repeatWeekdays: draft.repeatWeekdays,
    repeatUntil: draft.repeatUntil,
    rewardStars: draft.rewardStars,
    status: todoStatus
  });

  store.tasks = [task, ...store.tasks];
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return task;
}

export async function updateTask(
  taskId: string,
  draft: TaskDraft,
  currentUserId = momUserId,
  updateScope: TaskUpdateScope = singleTaskUpdateScope
): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const task = findTask(taskId);
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (!canManageTask(task, currentUserId)) return { ok: false, status: 403, error: noPermissionError };

  const updatedTask = applyDraftToTask(task, draft, false);

  if (updateScope === seriesTaskUpdateScope && task.repeatWeekdays?.length) {
    const seriesId = task.repeatSeriesId ?? task.id;
    const sourceDate = task.taskDate ?? task.dueDate;
    const seriesTasks = store.tasks.filter((item) => isSameEditableSeriesTask(item, taskId, seriesId, sourceDate));
    if (seriesTasks.some((item) => !canManageTask(item, currentUserId))) {
      return { ok: false, status: 403, error: noPermissionError };
    }

    store.tasks = store.tasks.map((item) => {
      if (item.id === taskId) return updatedTask;
      if (!isSameEditableSeriesTask(item, taskId, seriesId, sourceDate)) return item;
      return applyDraftToTask(item, draft, true);
    });
  } else {
    store.tasks = store.tasks.map((item) => (item.id === taskId ? updatedTask : item));
  }

  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true, task: updatedTask };
}

export async function deleteTask(taskId: string, currentUserId = momUserId): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const task = findTask(taskId);
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (!canManageTask(task, currentUserId)) return { ok: false, status: 403, error: noPermissionError };

  store.tasks = store.tasks.filter((item) => item.id !== taskId);
  store.trashTasks = [task, ...store.trashTasks];
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true, task };
}

export async function restoreTask(taskId: string, currentUserId = momUserId): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const task = store.trashTasks.find((item) => item.id === taskId);
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (!canManageTask(task, currentUserId)) return { ok: false, status: 403, error: noPermissionError };

  store.trashTasks = store.trashTasks.filter((item) => item.id !== taskId);
  store.tasks = [task, ...store.tasks];
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true, task };
}

export async function clearTrash(currentUserId = momUserId) {
  await refreshTaskStoreFromDisk();
  const currentUser = findUser(currentUserId);
  if (!currentUser) return { ok: false as const, status: 401, error: userNotFoundError };

  store.trashTasks =
    currentUser.role === momUserId
      ? []
      : store.trashTasks.filter((task) => !canManageTask(task, currentUserId));
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true as const };
}

export async function setTaskStatus(taskId: string, status: TaskStatus, currentUserId?: string): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const task = findTask(taskId);
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (currentUserId && !canViewTask(task, currentUserId)) {
    return { ok: false, status: 403, error: noPermissionError };
  }
  if (task.status === status) return { ok: true, task };

  const previousStatus = task.status;
  const completedBy = status === todoStatus ? undefined : task.completedBy ?? findUser(currentUserId ?? "") ?? undefined;
  const completedAt = status === todoStatus ? undefined : task.completedAt ?? new Date().toISOString();
  const nextTask = normalizeTaskTiming({
    ...task,
    completedAt,
    completedBy,
    rewardedAt: status === todoStatus ? undefined : task.rewardedAt,
    rewardedBy: status === todoStatus ? undefined : task.rewardedBy,
    repeatSeriesId: task.repeatWeekdays?.length ? task.repeatSeriesId ?? task.id : undefined,
    status
  });
  store.tasks = store.tasks.map((item) => (item.id === taskId ? nextTask : item));
  if (status === doneStatus) createNextRepeatTask(nextTask);
  if (status === todoStatus && previousStatus === doneStatus) removeGeneratedRepeatTask(taskId);
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true, task: nextTask };
}

export async function completeTask(taskId: string, currentUserId?: string): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const task = findTask(taskId);
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (currentUserId && !canViewTask(task, currentUserId)) {
    return { ok: false, status: 403, error: noPermissionError };
  }
  if (task.status !== todoStatus) return { ok: true, task };
  return setTaskStatus(taskId, isChildTask(task) ? pendingRewardStatus : doneStatus, currentUserId);
}

export async function confirmReward(taskId: string, currentUserId = momUserId): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const currentUser = findUser(currentUserId);
  if (currentUser?.role !== momUserId && currentUser?.role !== dadUserId) {
    return { ok: false, status: 403, error: noPermissionError };
  }
  const task = findTask(taskId);
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (!isChildTask(task)) return { ok: false, status: 400, error: taskNotChildTaskError };
  if (task.status === doneStatus) return { ok: true, task };
  if (task.status !== pendingRewardStatus) {
    return { ok: false, status: 400, error: taskNotPendingRewardError };
  }

  const rewardedAt = new Date().toISOString();
  const nextTask = normalizeTaskTiming({
    ...task,
    completedAt: task.completedAt ?? rewardedAt,
    rewardedAt,
    rewardedBy: currentUser,
    repeatSeriesId: task.repeatWeekdays?.length ? task.repeatSeriesId ?? task.id : undefined,
    status: doneStatus
  });
  store.tasks = store.tasks.map((item) => (item.id === taskId ? nextTask : item));
  createNextRepeatTask(nextTask);
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true, task: nextTask };
}

export async function addComment(taskId: string, content: string, currentUserId = momUserId): Promise<TaskMutationResult> {
  await refreshTaskStoreFromDisk();
  const task = findTask(taskId);
  const currentUser = findUser(currentUserId);
  const trimmedContent = content.trim();
  if (!task) return { ok: false, status: 404, error: taskNotFoundError };
  if (!currentUser) return { ok: false, status: 401, error: userNotFoundError };
  if (!canViewTask(task, currentUserId)) return { ok: false, status: 403, error: noPermissionError };
  if (!trimmedContent) return { ok: false, status: 400, error: emptyCommentError };
  if (trimmedContent.length > maxCommentLength) return { ok: false, status: 400, error: commentTooLongError };
  const createdAt = new Date().toISOString();

  const nextTask = {
    ...task,
    comments: [
      ...(task.comments ?? []),
      {
        id: crypto.randomUUID(),
        author: currentUser,
        content: trimmedContent,
        createdAt,
        createdAtLabel: formatDateTimeLabel(createdAt)
      }
    ]
  };
  store.tasks = store.tasks.map((item) => (item.id === taskId ? nextTask : item));
  await persistTaskStore();
  publishServerEvent(tasksChangedEventType);
  return { ok: true, task: nextTask };
}

function applyDraftToTask(task: Task, draft: TaskDraft, preserveDates: boolean) {
  return normalizeTaskTiming({
    ...task,
    title: draft.title.trim(),
    note: draft.note.trim(),
    category: draft.category,
    owners: familyUsers.filter((user) => draft.ownerIds.includes(user.id)),
    priority: draft.priority,
    taskTimeLabel: preserveDates ? task.taskTimeLabel : draft.taskTimeLabel,
    taskDate: preserveDates ? task.taskDate : draft.taskDate,
    dueLabel: preserveDates ? task.dueLabel : draft.dueLabel,
    dueDate: preserveDates ? task.dueDate : draft.dueDate,
    remindLabel: draft.remindLabel,
    reminderDays: draft.reminderDays,
    repeatLabel: draft.repeatLabel,
    repeatWeekdays: draft.repeatWeekdays,
    repeatUntil: draft.repeatUntil,
    repeatGeneratedFromId: preserveDates ? task.repeatGeneratedFromId : undefined,
    repeatSeriesId: draft.repeatWeekdays?.length ? task.repeatSeriesId : undefined,
    rewardStars: draft.rewardStars
  });
}

function isSameEditableSeriesTask(task: Task, sourceTaskId: string, seriesId: string, sourceDate?: string) {
  if (task.status === doneStatus) return false;
  if (!(task.id === sourceTaskId || task.id === seriesId || task.repeatSeriesId === seriesId)) return false;
  if (!sourceDate) return true;
  const taskDate = task.taskDate ?? task.dueDate;
  return !taskDate || taskDate >= sourceDate;
}

async function persistTaskStore() {
  await writePersistentState(taskStateKey, taskStoreFileName, store);
  loadedTaskStoreMtime = getJsonFileMtime(taskStoreFileName);
  globalTaskStore.__superFamilyTaskStoreMtime = loadedTaskStoreMtime;
}

async function refreshTaskStoreFromDisk() {
  if (hasDatabaseConfig()) {
    const nextStore = sanitizeTaskStore(await readPersistentState(taskStateKey, taskStoreFileName, defaultTaskStore));
    store.tasks = nextStore.tasks;
    store.trashTasks = nextStore.trashTasks;
    return;
  }
  const currentMtime = getJsonFileMtime(taskStoreFileName);
  if (!currentMtime || currentMtime === loadedTaskStoreMtime) return;
  const nextStore = sanitizeTaskStore(readJsonFile(taskStoreFileName, defaultTaskStore));
  store.tasks = nextStore.tasks;
  store.trashTasks = nextStore.trashTasks;
  loadedTaskStoreMtime = currentMtime;
  globalTaskStore.__superFamilyTaskStoreMtime = loadedTaskStoreMtime;
}

function sanitizeTaskStore(value: unknown): TaskStore {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return defaultTaskStore;

  return {
    tasks: value.tasks.map(sanitizeTask).filter((task): task is Task => Boolean(task)),
    trashTasks: Array.isArray(value.trashTasks)
      ? value.trashTasks.map(sanitizeTask).filter((task): task is Task => Boolean(task))
      : []
  };
}

function sanitizeTask(value: unknown): Task | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (!isTaskCategory(value.category) || !isPriority(value.priority) || !isTaskStatus(value.status)) return null;
  if (!Array.isArray(value.owners)) return null;

  const owners = value.owners.filter(isFamilyUser);
  if (value.category === childStudyCategory && !hasOwnerId(owners, childUserId)) {
    const childUser = findUser(childUserId);
    if (childUser) owners.push(childUser);
  }
  if (!owners.length) return null;

  const normalizedCategory = hasOwnerId(owners, childUserId) ? childStudyCategory : value.category;

  return normalizeTaskTiming({
    id: value.id,
    title: value.title,
    note: typeof value.note === "string" ? value.note : "",
    createdById: typeof value.createdById === "string" ? value.createdById : undefined,
    category: normalizedCategory,
    owners,
    priority: value.priority,
    taskTimeLabel: typeof value.taskTimeLabel === "string" ? value.taskTimeLabel : undefined,
    taskDate: typeof value.taskDate === "string" ? value.taskDate : undefined,
    dueLabel: typeof value.dueLabel === "string" ? value.dueLabel : "",
    dueDate: typeof value.dueDate === "string" ? value.dueDate : undefined,
    remindLabel: typeof value.remindLabel === "string" ? value.remindLabel : undefined,
    reminderDays: typeof value.reminderDays === "number" ? value.reminderDays : undefined,
    repeatLabel: typeof value.repeatLabel === "string" ? value.repeatLabel : undefined,
    repeatWeekdays: Array.isArray(value.repeatWeekdays)
      ? value.repeatWeekdays.filter((day): day is number => typeof day === "number" && day >= minRepeatWeekday && day <= maxRepeatWeekday)
      : undefined,
    repeatUntil: typeof value.repeatUntil === "string" ? value.repeatUntil : undefined,
    repeatSeriesId: typeof value.repeatSeriesId === "string" ? value.repeatSeriesId : undefined,
    repeatGeneratedFromId: typeof value.repeatGeneratedFromId === "string" ? value.repeatGeneratedFromId : undefined,
    rewardStars:
      hasOwnerId(owners, childUserId) && typeof value.rewardStars === "number" && value.rewardStars >= minRewardStars
        ? Math.min(value.rewardStars, maxRewardStars)
        : undefined,
    rewardedBy: isFamilyUser(value.rewardedBy) ? value.rewardedBy : undefined,
    rewardedAt: typeof value.rewardedAt === "string" ? value.rewardedAt : undefined,
    status: value.status,
    completedBy: isFamilyUser(value.completedBy) ? value.completedBy : undefined,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : undefined,
    comments: Array.isArray(value.comments)
      ? value.comments.filter((comment) => {
          return (
            isRecord(comment) &&
            typeof comment.id === "string" &&
            isFamilyUser(comment.author) &&
            typeof comment.content === "string" &&
            typeof comment.createdAtLabel === "string"
          );
        }).map((comment) => ({
          ...comment,
          createdAt: isRecord(comment) && typeof comment.createdAt === "string" ? comment.createdAt : undefined
        })) as Task["comments"]
      : undefined
  });
}

function findTask(taskId: string) {
  return store.tasks.find((task) => task.id === taskId);
}

function findUser(userId: string): FamilyUser | undefined {
  return familyUsers.find((user) => user.id === userId);
}

function canManageTask(task: Task, currentUserId: string) {
  const currentUser = findUser(currentUserId);
  return currentUser?.role === momUserId || task.createdById === currentUserId;
}

function canViewTask(task: Task, currentUserId: string) {
  const currentUser = findUser(currentUserId);
  if (!currentUser) return false;
  if (currentUser.role === childUserId) return isTaskOwner(task, currentUserId);
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFamilyUser(value: unknown): value is FamilyUser {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.role === momUserId || value.role === dadUserId || value.role === childUserId)
  );
}

function isTaskCategory(value: unknown): value is Task["category"] {
  return taskCategoryValues.includes(value as Task["category"]);
}

function isPriority(value: unknown): value is Task["priority"] {
  return taskPriorityValues.includes(value as Task["priority"]);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return taskStatusValues.includes(value as TaskStatus);
}

function createNextRepeatTask(task: Task) {
  if (!task.repeatWeekdays?.length) return;
  const baseDate = parseDateOnly(task.taskDate || task.dueDate);
  if (!baseDate) return;

  const nextTaskDate = getNextRepeatDate(baseDate, task.repeatWeekdays);
  const repeatUntilDate = parseDateOnly(task.repeatUntil);
  if (repeatUntilDate && nextTaskDate.getTime() > repeatUntilDate.getTime()) return;

  const nextTaskDateValue = toInputDate(nextTaskDate);
  const seriesId = task.repeatSeriesId ?? task.id;
  const alreadyExists = store.tasks.some((item) => {
    return item.id !== task.id && item.repeatSeriesId === seriesId && item.taskDate === nextTaskDateValue;
  });
  if (alreadyExists) return;

  const taskDate = parseDateOnly(task.taskDate);
  const dueDate = parseDateOnly(task.dueDate);
  const dueOffsetDays = taskDate && dueDate ? Math.round((dueDate.getTime() - taskDate.getTime()) / 86400000) : 0;
  const nextDueDate = addDays(nextTaskDate, dueOffsetDays);

  const nextTask = normalizeTaskTiming({
    ...task,
    id: crypto.randomUUID(),
    comments: undefined,
    dueDate: toInputDate(nextDueDate),
    dueLabel: formatDateLabel(nextDueDate),
    overdue: false,
    repeatGeneratedFromId: task.id,
    repeatSeriesId: seriesId,
    status: todoStatus,
    completedAt: undefined,
    completedBy: undefined,
    rewardedAt: undefined,
    rewardedBy: undefined,
    taskDate: nextTaskDateValue,
    taskTimeLabel: formatDateLabel(nextTaskDate),
    timeBucket: undefined
  });

  store.tasks = [nextTask, ...store.tasks];
}

function removeGeneratedRepeatTask(sourceTaskId: string) {
  store.tasks = store.tasks.filter((task) => {
    const isGeneratedNextTask = task.repeatGeneratedFromId === sourceTaskId;
    const isUntouched = task.status === todoStatus && !task.comments?.length;
    return !(isGeneratedNextTask && isUntouched);
  });
}

function getNextRepeatDate(baseDate: Date, repeatWeekdays: number[]) {
  let nextDate = getNextWeekdayAfter(baseDate, repeatWeekdays);
  const today = getTodayDate();
  while (nextDate.getTime() < today.getTime()) {
    nextDate = getNextWeekdayAfter(nextDate, repeatWeekdays);
  }
  return nextDate;
}

function getNextWeekdayAfter(date: Date, repeatWeekdays: number[]) {
  const sortedWeekdays = [...new Set(repeatWeekdays)].sort((first, second) => first - second);
  for (let offset = 1; offset <= maxRepeatWeekdays; offset += 1) {
    const nextDate = addDays(date, offset);
    const weekday = nextDate.getDay() === 0 ? maxRepeatWeekday : nextDate.getDay();
    if (sortedWeekdays.includes(weekday)) return nextDate;
  }
  return addDays(date, 1);
}
