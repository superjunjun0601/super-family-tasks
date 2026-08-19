"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Mic,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  WandSparkles,
  X
} from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { SectionHeader } from "@/components/section-header";
import { TaskDetailSheet } from "@/components/task-detail-sheet";
import { TaskFormSheet } from "@/components/task-form-sheet";
import { TaskCard } from "@/components/task-card";
import {
  authChangePasswordApiPath,
  authLoginApiPath,
  authLogoutApiPath,
  backupsApiPath,
  healthApiPath,
  meApiPath,
  petApiPath,
  petFeedApiPath,
  settingsApiPath,
  taskApiPath,
  taskCommentsApiPath,
  taskCompleteApiPath,
  taskConfirmRewardApiPath,
  taskRestoreApiPath,
  taskUncompleteApiPath,
  tasksApiPath,
  trashApiPath
} from "@/lib/api-paths";
import { getTodayDate } from "@/lib/calendar-utils";
import { apiRequest, isUnauthorizedError } from "@/lib/client-api";
import { defaultFamilyPassword, maxPasswordLength, minPasswordLength } from "@/lib/auth-values";
import {
  getLoginErrorMessage,
  getPasswordSaveErrorMessage,
  getPetFeedErrorMessage,
  getTaskSaveErrorMessage
} from "@/lib/client-error-messages";
import { createClientId } from "@/lib/client-id";
import {
  formatBackupFileSummary,
  formatStorageTime,
  getBackupFileWarning,
  getBackupWarning
} from "@/lib/data-safety-labels";
import { parseDateOnly } from "@/lib/date-utils";
import { childUserId, dadUserId, familyUsers, momUserId } from "@/lib/family-users";
import {
  babyPage,
  homePage,
  listPage,
  mePage,
  remindersPage,
  settingsPage,
  trashPage,
  type MainPage
} from "@/lib/main-pages";
import { getPetStats, type PetStats } from "@/lib/pet-stats";
import {
  createDefaultReminderSettings,
  overdueRemindersEnabledKey,
  rewardRemindersEnabledKey,
  siteRemindersEnabledKey
} from "@/lib/reminder-settings";
import { taskCategoryLabels, taskPriorityLabels } from "@/lib/task-labels";
import { taskNoteMaxLength } from "@/lib/task-limits";
import {
  childStudyCategory,
  doneStatus,
  familyCategory,
  dayAfterTimeBucket,
  normalPriority,
  pendingRewardStatus,
  personalCategory,
  overdueTimeBucket,
  todayTimeBucket,
  todoStatus,
  tomorrowTimeBucket,
  weekTimeBucket,
  urgentPriority
} from "@/lib/task-values";
import { getTaskOwnerNames, isChildTask, isTaskOwner } from "@/lib/task-helpers";
import { sortTasksByDate } from "@/lib/task-listing";
import {
  formatDateLabel,
  formatDateTimeLabel,
  getDraftTimeRangeLabel,
  getTaskTimeBucket,
  getTaskTimeRangeLabel,
  shouldRemindToday
} from "@/lib/task-time-label";
import { singleTaskUpdateScope, type TaskUpdateScope } from "@/lib/task-update-scope";
import { parseQuickTask } from "@/lib/quick-task-parser";
import type { FamilyUser, ReminderSettings, Task, TaskDraft, TaskStatus, TaskTimeBucket } from "@/lib/types";

type PetStoreState = {
  fedFlowers: number;
  updatedAt?: string;
};

type FlowerRewardEvent = {
  id: string;
  giverName: string;
  reason: string;
  stars: number;
  timeLabel: string;
};

type StorageFileStatus = {
  backupExists: boolean;
  exists: boolean;
  latestSnapshotAt: string | null;
  latestUsableSource: string;
  readable: boolean;
  snapshotCount: number;
  updatedAt: string | null;
};

type HealthResponse = {
  auth?: {
    defaultPasswordUsers?: Array<{
      id: string;
      name: string;
    }>;
    secretConfigured: boolean;
  };
  dataDir?: string;
  dataDirConfigured?: boolean;
  dataDirWritable?: boolean;
  manualBackups?: {
    count: number;
    latestCopiedFiles: string[];
    latestCreatedAt: string | null;
    latestDirName: string | null;
    pruneSuggested?: boolean;
  };
  ok: boolean;
  service: string;
  storage?: {
    pet: StorageFileStatus;
    tasks: StorageFileStatus;
    users: StorageFileStatus;
  };
};

type BackupResponse = {
  backup: {
    copiedFiles: string[];
    createdAt: string;
    dirName: string;
    path: string;
  };
};

type ListOwnerFilter = "all" | typeof momUserId | typeof dadUserId;
type ListStatusFilter = typeof todoStatus | typeof doneStatus;
type QuickCreateTarget = "current_user" | typeof childUserId;
type HomeGroupKey = typeof overdueTimeBucket | typeof todayTimeBucket | typeof tomorrowTimeBucket | typeof dayAfterTimeBucket | typeof weekTimeBucket | "month" | "after_month";
type CreationResult = {
  message: string;
  title: string;
  tone: "danger" | "success";
};

const monthHomeGroup = "month" satisfies HomeGroupKey;
const afterMonthHomeGroup = "after_month" satisfies HomeGroupKey;

const homeGroups: { key: HomeGroupKey; label: string; title: string }[] = [
  { key: overdueTimeBucket, label: "逾期", title: "逾期任务" },
  { key: todayTimeBucket, label: "今日", title: "今日任务" },
  { key: tomorrowTimeBucket, label: "明日", title: "明日任务" },
  { key: dayAfterTimeBucket, label: "后天", title: "后天任务" },
  { key: weekTimeBucket, label: "本周", title: "本周任务" },
  { key: monthHomeGroup, label: "本月", title: "本月任务" },
  { key: afterMonthHomeGroup, label: "本月后", title: "本月后任务" }
];

const ownerFilters: { key: ListOwnerFilter; label: string }[] = [
  { key: "all", label: "全部负责人" },
  { key: momUserId, label: "妈妈" },
  { key: dadUserId, label: "爸爸" }
];

const statusFilters: { key: ListStatusFilter; label: string }[] = [
  { key: todoStatus, label: "未完成" },
  { key: doneStatus, label: "已完成" }
];

export default function HomePage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [hasCheckedStoredLogin, setHasCheckedStoredLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState<FamilyUser>(familyUsers[0]);
  const [activePage, setActivePage] = useState<MainPage>(homePage);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trashTasks, setTrashTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [quickDraft, setQuickDraft] = useState<TaskDraft | null>(null);
  const [isQuickCreating, setIsQuickCreating] = useState(false);
  const [quickCreateTarget, setQuickCreateTarget] = useState<QuickCreateTarget>("current_user");
  const [creationResult, setCreationResult] = useState<CreationResult | null>(null);
  const [rewardConfirmTaskId, setRewardConfirmTaskId] = useState<string | null>(null);
  const [isFeedPetConfirmOpen, setIsFeedPetConfirmOpen] = useState(false);
  const [isFlowerHistoryOpen, setIsFlowerHistoryOpen] = useState(false);
  const [petState, setPetState] = useState<PetStoreState>({ fedFlowers: 0 });
  const [isFeedingPet, setIsFeedingPet] = useState(false);
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => createDefaultReminderSettings());
  const [hasServerStateError, setHasServerStateError] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "danger" | "success" } | null>(null);
  const [loginNotice, setLoginNotice] = useState("");
  const [pendingTaskIds, setPendingTaskIds] = useState<Set<string>>(() => new Set());
  const pendingTaskIdsRef = useRef<Set<string>>(new Set());
  const isMountedRef = useRef(false);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const childTasks = useMemo(
    () => tasks.filter(isChildTask),
    [tasks]
  );
  const adultTasks = useMemo(
    () => tasks.filter((task) => !isChildTask(task)),
    [tasks]
  );
  const myTasks = useMemo(
    () =>
        (currentUser.role === childUserId ? childTasks : adultTasks).filter(
        (task) => isTaskOwner(task, currentUser.id) && task.status !== doneStatus
      ),
    [adultTasks, childTasks, currentUser.id, currentUser.role]
  );
  const overdueReminderTasks = useMemo(
    () =>
      [...adultTasks, ...childTasks].filter(
        (task) =>
          task.status !== doneStatus &&
          getTaskTimeBucket(task) === overdueTimeBucket &&
          isTaskOwner(task, currentUser.id)
      ),
    [adultTasks, childTasks, currentUser.id]
  );
  const dueSoonReminderTasks = useMemo(
    () =>
      [...adultTasks, ...childTasks].filter(
        (task) => shouldRemindToday(task) && isTaskOwner(task, currentUser.id)
      ),
    [adultTasks, childTasks, currentUser.id]
  );
  const pendingRewardTasks = useMemo(
    () => childTasks.filter((task) => task.status === pendingRewardStatus && currentUser.role !== childUserId),
    [childTasks, currentUser.role]
  );
  const visibleOverdueReminderTasks =
    reminderSettings.siteRemindersEnabled && reminderSettings.overdueRemindersEnabled ? overdueReminderTasks : [];
  const visibleDueSoonReminderTasks = reminderSettings.siteRemindersEnabled ? dueSoonReminderTasks : [];
  const visiblePendingRewardTasks =
    reminderSettings.siteRemindersEnabled && reminderSettings.rewardRemindersEnabled ? pendingRewardTasks : [];
  const reminderCount =
    visibleOverdueReminderTasks.length + visibleDueSoonReminderTasks.length + visiblePendingRewardTasks.length;
  const petStats = useMemo(() => getPetStats(childTasks, petState.fedFlowers), [childTasks, petState.fedFlowers]);
  const flowerRewardEvents = useMemo(() => getFlowerRewardEvents(childTasks), [childTasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId);
  const editingTask = tasks.find((task) => task.id === editingTaskId);
  const rewardConfirmTask = tasks.find((task) => task.id === rewardConfirmTaskId);
  const changeActivePage = useCallback(
    (page: MainPage) => {
      if (currentUser.role === childUserId && page !== babyPage && page !== mePage) {
        setActivePage(babyPage);
        return;
      }
      setActivePage(page);
    },
    [currentUser.role]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resetLocalSessionState = useCallback(() => {
    setTasks([]);
    setTrashTasks([]);
    setSelectedTaskId(null);
    setEditingTaskId(null);
    setIsCreating(false);
    setQuickDraft(null);
    setIsQuickCreating(false);
    setQuickCreateTarget("current_user");
    setRewardConfirmTaskId(null);
    setIsFeedPetConfirmOpen(false);
    setIsFlowerHistoryOpen(false);
    setPetState({ fedFlowers: 0 });
    setIsFeedingPet(false);
    pendingTaskIdsRef.current = new Set();
    setPendingTaskIds(new Set());
    setHasServerStateError(false);
  }, []);

  const handleSessionExpired = useCallback(() => {
    if (!isMountedRef.current) return;
    resetLocalSessionState();
    setIsLoggedIn(false);
    setCurrentUser(familyUsers[0]);
    setReminderSettings(createDefaultReminderSettings());
    setActivePage(homePage);
    setLoginNotice("登录已过期，请重新选择身份并输入密码。");
  }, [resetLocalSessionState]);

  const loadServerState = useCallback(async () => {
    try {
      const [tasksData, trashData] = await Promise.all([
        apiRequest<{ tasks: Task[] }>(tasksApiPath),
        apiRequest<{ tasks: Task[] }>(trashApiPath)
      ]);
      if (!isMountedRef.current) return;
      setHasServerStateError(false);
      setTasks(tasksData.tasks);
      setTrashTasks(trashData.tasks);
    } catch (error) {
      if (!isMountedRef.current) return;
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      setHasServerStateError(true);
    }

    try {
      const petData = await apiRequest<{ pet: PetStoreState }>(petApiPath);
      if (!isMountedRef.current) return;
      setPetState(petData.pet);
    } catch (error) {
      if (isUnauthorizedError(error)) handleSessionExpired();
      // Pet progress should not block the task list.
    }
  }, [handleSessionExpired]);

  const loadReminderSettings = useCallback(async () => {
    try {
      const data = await apiRequest<{ reminderSettings: ReminderSettings }>(settingsApiPath);
      setReminderSettings(data.reminderSettings);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      setReminderSettings(createDefaultReminderSettings());
    }
  }, [handleSessionExpired]);

  useEffect(() => {
    let ignore = false;
    async function restoreLogin() {
      try {
        const data = await apiRequest<{ user: FamilyUser }>(meApiPath);
        if (ignore) return;
        setCurrentUser(data.user);
        setActivePage(data.user.role === childUserId ? babyPage : homePage);
        setIsLoggedIn(true);
        loadReminderSettings();
      } catch {
        // No active login cookie; show the login screen.
      } finally {
        if (!ignore) setHasCheckedStoredLogin(true);
      }
    }

    restoreLogin();
    return () => {
      ignore = true;
    };
  }, [loadReminderSettings]);

  useEffect(() => {
    if (currentUser.role === childUserId && activePage !== babyPage && activePage !== mePage) {
      setActivePage(babyPage);
    }
  }, [activePage, currentUser.role]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let ignore = false;
    void loadServerState();

    return () => {
      ignore = true;
    };
  }, [currentUser.id, isLoggedIn, loadServerState]);

  useEffect(() => {
    if (!isLoggedIn) return;
    let ignore = false;

    const refreshCurrentState = () => {
      if (ignore || document.visibilityState === "hidden") return;
      void loadServerState();
      void loadReminderSettings();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshCurrentState();
    };

    const periodicRefreshTimer = window.setInterval(refreshCurrentState, 30 * 1000);
    window.addEventListener("focus", refreshCurrentState);
    window.addEventListener("online", refreshCurrentState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      ignore = true;
      window.clearInterval(periodicRefreshTimer);
      window.removeEventListener("focus", refreshCurrentState);
      window.removeEventListener("online", refreshCurrentState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isLoggedIn, loadReminderSettings, loadServerState]);

  function replaceTask(nextTask: Task) {
    setTasks((current) => current.map((task) => (task.id === nextTask.id ? nextTask : task)));
  }

  function setTaskPending(taskId: string, isPending: boolean) {
    const nextRef = new Set(pendingTaskIdsRef.current);
    if (isPending) {
      nextRef.add(taskId);
    } else {
      nextRef.delete(taskId);
    }
    pendingTaskIdsRef.current = nextRef;
    setPendingTaskIds((current) => {
      const next = new Set(current);
      if (isPending) {
        next.add(taskId);
      } else {
        next.delete(taskId);
      }
      return next;
    });
  }

  function showNotice(message: string, tone: "danger" | "success" = "danger") {
    setNotice({ message, tone });
  }

  function openFullCreate(target: QuickCreateTarget = "current_user") {
    setQuickCreateTarget(target);
    setQuickDraft(target === childUserId ? createChildTaskDraft() : null);
    setIsQuickCreating(false);
    setIsCreating(true);
  }

  function openQuickCreate(target: QuickCreateTarget = "current_user") {
    setQuickCreateTarget(target);
    setQuickDraft(null);
    setIsCreating(false);
    setIsQuickCreating(true);
  }

  function requestConfirmReward(taskId: string) {
    if (pendingTaskIdsRef.current.has(taskId)) return;
    if (!tasks.some((task) => task.id === taskId)) return;
    setRewardConfirmTaskId(taskId);
  }

  function requestFeedPet() {
    if (isFeedingPet) return;
    if (petStats.flowers <= 0) {
      showNotice("小红花不够啦，先完成任务攒一点。");
      return;
    }
    setIsFeedPetConfirmOpen(true);
  }

  async function toggleTask(taskId: string) {
    if (pendingTaskIdsRef.current.has(taskId)) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTaskPending(taskId, true);
    const shouldRestoreTodo = task.status === doneStatus || task.status === pendingRewardStatus;
    const nextStatus: TaskStatus = shouldRestoreTodo ? todoStatus : isChildTask(task) ? pendingRewardStatus : doneStatus;
    replaceTask({ ...task, status: nextStatus });

    try {
      const data = await apiRequest<{ task: Task }>(
        shouldRestoreTodo ? taskUncompleteApiPath(taskId) : taskCompleteApiPath(taskId),
        {
        method: "POST"
        }
      );
      replaceTask(data.task);
      void loadServerState();
    } catch (error) {
      replaceTask(task);
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice("任务状态更新失败，请稍后再试。");
    } finally {
      setTaskPending(taskId, false);
    }
  }

  async function confirmReward(taskId: string) {
    if (pendingTaskIdsRef.current.has(taskId)) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    setTaskPending(taskId, true);
    replaceTask({ ...task, status: doneStatus });

    try {
      const data = await apiRequest<{ task: Task }>(taskConfirmRewardApiPath(taskId), {
        method: "POST"
      });
      replaceTask(data.task);
      setRewardConfirmTaskId(null);
      showNotice(
        task.rewardStars ? `已给小柚子 ${task.rewardStars} 朵小红花。` : "任务已确认完成。",
        "success"
      );
      void loadServerState();
    } catch (error) {
      replaceTask(task);
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice(task.rewardStars ? "小红花确认失败，请稍后再试。" : "任务确认失败，请稍后再试。");
    } finally {
      setTaskPending(taskId, false);
    }
  }

  async function feedPet() {
    if (isFeedingPet) return;
    if (petStats.flowers <= 0) {
      showNotice("小红花不够啦，先完成任务攒一点。");
      return;
    }

    const previousPetState = petState;
    setIsFeedingPet(true);
    setPetState((current) => ({ ...current, fedFlowers: current.fedFlowers + 1 }));

    try {
      const data = await apiRequest<{ pet: PetStoreState }>(petFeedApiPath, {
        method: "POST"
      });
      setPetState(data.pet);
      setIsFeedPetConfirmOpen(false);
      showNotice("已喂小精灵 1 朵小红花。", "success");
    } catch (error) {
      setPetState(previousPetState);
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice(getPetFeedErrorMessage(error));
    } finally {
      setIsFeedingPet(false);
    }
  }

  async function saveReminderSettings(nextSettings: ReminderSettings) {
    const previousSettings = reminderSettings;
    setReminderSettings(nextSettings);
    try {
      const data = await apiRequest<{ reminderSettings: ReminderSettings }>(settingsApiPath, {
        body: { reminderSettings: nextSettings },
        method: "PUT"
      });
      setReminderSettings(data.reminderSettings);
    } catch (error) {
      setReminderSettings(previousSettings);
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice("提醒设置保存失败，请稍后再试。");
    }
  }

  async function addComment(taskId: string, content: string) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    const optimisticTask = {
      ...task,
      comments: [
        ...(task.comments ?? []),
        {
          id: createClientId(),
          author: currentUser,
          content,
          createdAt: new Date().toISOString(),
          createdAtLabel: "刚刚"
        }
      ]
    };
    replaceTask(optimisticTask);

    try {
      const data = await apiRequest<{ task: Task }>(taskCommentsApiPath(taskId), {
        body: { content },
        method: "POST"
      });
      replaceTask(data.task);
    } catch (error) {
      replaceTask(task);
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice("评论发送失败，请稍后再试。");
    }
  }

  async function createTask(draft: TaskDraft) {
    try {
      const data = await apiRequest<{ task: Task }>(tasksApiPath, {
        body: draft,
        method: "POST"
      });
      setTasks((current) => [data.task, ...current]);
      setIsCreating(false);
      setIsQuickCreating(false);
      setQuickDraft(null);
      setQuickCreateTarget("current_user");
      setCreationResult({
        title: "新建成功",
        message: "任务已放进清单，需要看详情时点开任务卡片。",
        tone: "success"
      });
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      setCreationResult({
        title: "新建失败",
        message: getTaskSaveErrorMessage(error, "任务保存失败，请稍后再试。", currentUser.role === childUserId),
        tone: "danger"
      });
    }
  }

  async function updateTask(taskId: string, draft: TaskDraft, updateScope: TaskUpdateScope = singleTaskUpdateScope) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    try {
      const data = await apiRequest<{ task: Task }>(taskApiPath(taskId), {
        body: { ...draft, updateScope },
        method: "PUT"
      });
      replaceTask(data.task);
      setEditingTaskId(null);
      setSelectedTaskId(taskId);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice(getTaskSaveErrorMessage(error, "任务修改失败，请确认当前账号有权限。", currentUser.role === childUserId));
    }
  }

  async function deleteTask(taskId: string) {
    const confirmed = window.confirm("删除后会进入回收站，确定删除这条任务吗？");
    if (!confirmed) return;
    const deletedTask = tasks.find((task) => task.id === taskId);
    if (!deletedTask) return;

    setTrashTasks((current) => [deletedTask, ...current]);
    setTasks((current) => current.filter((task) => task.id !== taskId));
    setSelectedTaskId(null);

    try {
      await apiRequest<{ task: Task }>(taskApiPath(taskId), {
        method: "DELETE"
      });
      showNotice("任务已放入回收站。", "success");
    } catch (error) {
      setTrashTasks((current) => current.filter((task) => task.id !== taskId));
      setTasks((current) => [deletedTask, ...current]);
      if (isUnauthorizedError(error)) {
        handleSessionExpired();
        return;
      }
      showNotice("删除失败，请确认当前账号有权限。");
    }
  }

  if (!hasCheckedStoredLogin) {
    return (
      <main className="app-shell grid min-h-screen place-items-center px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,var(--primary),#7bbdaf)] font-extrabold text-white shadow-soft">
            超
          </div>
          <p className="text-[14px] font-bold text-[var(--muted)]">正在打开家庭清单...</p>
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        notice={loginNotice}
        onLogin={async (userId, password) => {
          const data = await apiRequest<{ user: FamilyUser }>(authLoginApiPath, {
            body: { password, userId },
            method: "POST"
          });
          const user = data.user;
          resetLocalSessionState();
          setCurrentUser(user);
          setActivePage(user.role === childUserId ? babyPage : homePage);
          setHasServerStateError(false);
          setIsLoggedIn(true);
          setLoginNotice("");
          loadReminderSettings();
          return true;
        }}
      />
    );
  }

  return (
    <main className="app-shell app-shell-with-nav">
      {hasServerStateError ? (
        <div className="mx-4 pt-4">
          <div
            className="flex items-center justify-between gap-3 rounded-2xl border border-[#f5c6bd] bg-[#fde7e2] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#9f332b]"
            role="alert"
          >
            <span className="min-w-0 flex-1">任务数据暂时没连上，当前页面可能不是最新。</span>
            <button
              className="h-9 flex-none rounded-xl border border-[#e9a99f] bg-[#fffaf1] px-3 text-[13px] font-extrabold text-[#9f332b]"
              onClick={() => {
                void loadServerState();
                void loadReminderSettings();
              }}
              type="button"
            >
              重新同步
            </button>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="mx-4 pt-3">
          <div
            aria-live={notice.tone === "success" ? "polite" : "assertive"}
            className={[
              "rounded-2xl border px-3.5 py-3 text-[13px] font-bold leading-relaxed shadow-soft",
              notice.tone === "success"
                ? "border-[rgba(79,157,143,0.24)] bg-[rgba(221,239,234,0.92)] text-[#1e655a]"
                : "border-[#f5c6bd] bg-[#fde7e2] text-[#9f332b]"
            ].join(" ")}
            role={notice.tone === "success" ? "status" : "alert"}
          >
            {notice.message}
          </div>
        </div>
      ) : null}
      {activePage === homePage ? (
        <HomePanel
          currentUser={currentUser}
          pendingTaskIds={pendingTaskIds}
          tasks={adultTasks}
          reminderCount={reminderCount}
          onConfirmReward={requestConfirmReward}
          onCreate={() => openFullCreate()}
          onOpenReminders={() => changeActivePage(remindersPage)}
          onOpen={setSelectedTaskId}
          onToggle={toggleTask}
        />
      ) : null}
      {activePage === remindersPage ? (
        <RemindersPanel
          currentUser={currentUser}
          dueSoonTasks={visibleDueSoonReminderTasks}
          overdueTasks={visibleOverdueReminderTasks}
          pendingTaskIds={pendingTaskIds}
          pendingRewardTasks={visiblePendingRewardTasks}
          onBack={() => changeActivePage(homePage)}
          onConfirmReward={requestConfirmReward}
          onOpen={setSelectedTaskId}
          onToggle={toggleTask}
        />
      ) : null}
      {activePage === listPage ? (
        <ListPanel
          currentUser={currentUser}
          pendingTaskIds={pendingTaskIds}
          tasks={adultTasks}
          onConfirmReward={requestConfirmReward}
          onCreate={() => openFullCreate()}
          onOpen={setSelectedTaskId}
          onToggle={toggleTask}
        />
      ) : null}
      {activePage === babyPage ? (
        <BabyPanel
          currentUser={currentUser}
          pendingTaskIds={pendingTaskIds}
          tasks={childTasks}
          petStats={petStats}
          isFeedingPet={isFeedingPet}
          onFeedPet={requestFeedPet}
          onConfirmReward={requestConfirmReward}
          onCreate={() => openFullCreate(childUserId)}
          onOpen={setSelectedTaskId}
          onToggle={toggleTask}
        />
      ) : null}
      {activePage === mePage ? (
        <MePanel
          currentUser={currentUser}
          flowerRewardEvents={flowerRewardEvents}
          pendingTaskIds={pendingTaskIds}
          petStats={petStats}
          tasks={myTasks}
          onConfirmReward={requestConfirmReward}
          onLogout={async () => {
            try {
              await apiRequest<{ ok: true }>(authLogoutApiPath, {
                method: "POST"
              });
            } catch {
              // Local logout should still work if the API is temporarily unavailable.
            }
            resetLocalSessionState();
            setIsLoggedIn(false);
            setCurrentUser(familyUsers[0]);
            setReminderSettings(createDefaultReminderSettings());
            setActivePage(homePage);
          }}
          onOpen={setSelectedTaskId}
          onOpenFlowerHistory={() => setIsFlowerHistoryOpen(true)}
          onTrash={() => changeActivePage(trashPage)}
          onSettings={() => changeActivePage(settingsPage)}
          onToggle={toggleTask}
        />
      ) : null}
      {activePage === settingsPage ? (
        <SettingsPanel
          currentUser={currentUser}
          reminderSettings={reminderSettings}
          onBack={() => changeActivePage(mePage)}
          onReminderSettingsChange={saveReminderSettings}
          onSessionExpired={handleSessionExpired}
        />
      ) : null}
      {activePage === trashPage ? (
        <TrashPanel
          currentUser={currentUser}
          tasks={trashTasks}
          onBack={() => changeActivePage(mePage)}
          onClear={async () => {
            const confirmed = window.confirm("清空前会自动备份，但页面里不能直接撤回。确定清空回收站吗？");
            if (!confirmed) return;
            const previousTrashTasks = trashTasks;
            setTrashTasks([]);
            try {
              await apiRequest<{ ok: true }>(trashApiPath, {
                method: "DELETE"
              });
              showNotice("回收站已清空，系统已自动备份。", "success");
            } catch (error) {
              setTrashTasks(previousTrashTasks);
              if (isUnauthorizedError(error)) {
                handleSessionExpired();
                return;
              }
              showNotice("清空回收站失败，请稍后再试。");
            }
          }}
          onRestore={async (taskId) => {
            const restoredTask = trashTasks.find((task) => task.id === taskId);
            if (!restoredTask) return;
            setTrashTasks((current) => current.filter((task) => task.id !== taskId));
            setTasks((current) => [restoredTask, ...current]);
            changeActivePage(mePage);
            try {
              const data = await apiRequest<{ task: Task }>(taskRestoreApiPath(taskId), {
                method: "POST"
              });
              setTasks((current) => current.map((task) => (task.id === taskId ? data.task : task)));
              showNotice("任务已恢复。", "success");
            } catch (error) {
              setTasks((current) => current.filter((task) => task.id !== taskId));
              setTrashTasks((current) => [restoredTask, ...current]);
              if (isUnauthorizedError(error)) {
                handleSessionExpired();
                return;
              }
              showNotice("恢复任务失败，请确认当前账号有权限。");
            }
          }}
        />
      ) : null}

      <BottomNav activePage={activePage} role={currentUser.role} onChange={changeActivePage} />
      {selectedTask ? (
        <TaskDetailSheet
          currentUser={currentUser}
          isActionPending={pendingTaskIds.has(selectedTask.id)}
          task={selectedTask}
          onAddComment={addComment}
          onConfirmReward={requestConfirmReward}
          onClose={() => setSelectedTaskId(null)}
          onDelete={deleteTask}
          onEdit={(task) => {
            setSelectedTaskId(null);
            setEditingTaskId(task.id);
          }}
          onToggle={toggleTask}
        />
      ) : null}
      {isQuickCreating ? (
        <QuickCreateSheet
          currentUser={currentUser}
          target={quickCreateTarget}
          onClose={() => {
            setIsQuickCreating(false);
            setQuickDraft(null);
            setQuickCreateTarget("current_user");
          }}
          onEditFull={(draft) => {
            setQuickDraft(draft);
            setIsQuickCreating(false);
            setIsCreating(true);
          }}
          onSubmit={(draft) => {
            void createTask(draft);
            setIsQuickCreating(false);
            setQuickCreateTarget("current_user");
          }}
        />
      ) : null}
      {isCreating ? (
        <TaskFormSheet
          currentUser={currentUser}
          initialDraft={quickDraft ?? undefined}
          mode="create"
          onClose={() => {
            setIsCreating(false);
            setQuickDraft(null);
            setQuickCreateTarget("current_user");
          }}
          onQuickCreate={() => openQuickCreate(quickCreateTarget)}
          onSubmit={(draft) => {
            setQuickDraft(null);
            void createTask(draft);
          }}
        />
      ) : null}
      {editingTask ? (
        <TaskFormSheet
          currentUser={currentUser}
          initialTask={editingTask}
          mode="edit"
          onClose={() => setEditingTaskId(null)}
          onSubmit={(draft, updateScope) => updateTask(editingTask.id, draft, updateScope)}
        />
      ) : null}
      {creationResult ? (
        <CreationResultSheet
          message={creationResult.message}
          title={creationResult.title}
          tone={creationResult.tone}
          onClose={() => setCreationResult(null)}
        />
      ) : null}
      {rewardConfirmTask ? (
        <RewardConfirmSheet
          isPending={pendingTaskIds.has(rewardConfirmTask.id)}
          task={rewardConfirmTask}
          onCancel={() => setRewardConfirmTaskId(null)}
          onConfirm={() => {
            void confirmReward(rewardConfirmTask.id);
          }}
        />
      ) : null}
      {isFeedPetConfirmOpen ? (
        <FeedPetConfirmSheet
          isPending={isFeedingPet}
          petStats={petStats}
          onCancel={() => setIsFeedPetConfirmOpen(false)}
          onConfirm={() => {
            void feedPet();
          }}
        />
      ) : null}
      {isFlowerHistoryOpen ? (
        <FlowerHistorySheet
          events={flowerRewardEvents}
          petStats={petStats}
          onClose={() => setIsFlowerHistoryOpen(false)}
        />
      ) : null}
    </main>
  );
}

function createChildTaskDraft(): TaskDraft {
  return {
    title: "",
    note: "",
    category: childStudyCategory,
    ownerIds: [childUserId],
    priority: normalPriority,
    dueLabel: ""
  };
}

function getFlowerRewardEvents(tasks: Task[]): FlowerRewardEvent[] {
  return tasks
    .filter((task) => task.status === doneStatus && Boolean(task.rewardStars))
    .map((task) => {
      const rewardedAt = task.rewardedAt ?? task.completedAt;
      return {
        id: task.id,
        giverName: getRewardGiverName(task),
        reason: task.title,
        stars: task.rewardStars ?? 0,
        timeLabel: rewardedAt ? formatDateTimeLabel(rewardedAt) : task.dueLabel || "时间未记录"
      };
    })
    .sort((left, right) => getRewardSortTime(right.id, tasks) - getRewardSortTime(left.id, tasks));
}

function getRewardSortTime(taskId: string, tasks: Task[]) {
  const task = tasks.find((item) => item.id === taskId);
  const date = task?.rewardedAt ?? task?.completedAt ?? task?.dueDate ?? task?.taskDate;
  if (!date) return 0;
  const timestamp = new Date(date).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getRewardGiverName(task: Task) {
  if (task.rewardedBy) return task.rewardedBy.name;
  if (task.completedBy && task.completedBy.role !== childUserId) return task.completedBy.name;

  const creator = familyUsers.find((user) => user.id === task.createdById);
  if (creator && creator.role !== childUserId) return creator.name;
  return "爸爸妈妈";
}

function getCircularPosition(index: number, selectedIndex: number, total: number) {
  const offset = (index - selectedIndex + total) % total;
  if (offset === 0) return "center";
  if (offset === 1) return "right";
  return "left";
}

function LoginScreen({
  notice,
  onLogin
}: {
  notice?: string;
  onLogin: (userId: string, password: string) => Promise<boolean>;
}) {
  const [selectedUserId, setSelectedUserId] = useState(familyUsers[0].id);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const passwordInputId = useId();
  const selectedIndex = familyUsers.findIndex((user) => user.id === selectedUserId);

  return (
    <main className="app-shell px-5 pb-7 pt-12">
      <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-[linear-gradient(145deg,var(--primary),#7bbdaf)] font-extrabold text-white shadow-soft">
        超
      </div>
      <h1 className="mb-2.5 text-[31px] font-extrabold leading-tight tracking-normal">
        超人家族
        <br />
        任务清单
      </h1>
      <p className="mb-8 text-[15px] leading-relaxed text-[var(--muted)]">
        家庭任务、小柚子学习计划和小红花奖励，先安安静静地放在一个地方。
      </p>

      <form
        className="login-panel"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          setIsSubmitting(true);
          try {
            await onLogin(selectedUserId, password);
          } catch (loginError) {
            setError(getLoginErrorMessage(loginError));
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div className="login-picker" role="radiogroup" aria-label="选择登录身份">
          <div className="login-avatar-orbit">
            {familyUsers.map((user, index) => {
              const isSelected = selectedUserId === user.id;
              const position = getCircularPosition(index, selectedIndex, familyUsers.length);
              return (
                <button
                  aria-checked={isSelected}
                  className={[
                    "login-avatar-choice",
                    `login-avatar-choice-${position}`,
                    isSelected ? "login-avatar-choice-selected" : ""
                  ].join(" ")}
                  key={user.id}
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setPassword("");
                    setError("");
                  }}
                  role="radio"
                  type="button"
                >
                  <RoleAvatar role={user.role} />
                  <span>{user.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mb-3.5 grid gap-2">
          <label className="text-[13px] text-[var(--muted)]" htmlFor={passwordInputId}>密码</label>
          <span className="login-password-field">
            <input
              autoComplete="current-password"
              id={passwordInputId}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              type={showPassword ? "text" : "password"}
            />
            <button
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPassword((current) => !current)}
              type="button"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </div>
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : notice ? (
          <p className="login-error" role="alert">
            {notice}
          </p>
        ) : null}
        <button
          className="login-submit-button"
          disabled={isSubmitting || !password.trim()}
          type="submit"
        >
          {isSubmitting ? "登录中..." : "登录"}
        </button>
        <p className="login-hint">
          选择身份后输入对应密码。
        </p>
      </form>
    </main>
  );
}

function PageTopbar({
  eyebrow,
  title,
  action
}: {
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-[18px] flex items-center justify-between gap-3">
      <div>
        <p className="mb-0.5 text-[13px] text-[var(--muted)]">{eyebrow}</p>
        <h2 className="text-[25px] font-extrabold leading-tight tracking-normal">{title}</h2>
      </div>
      {action}
    </div>
  );
}

function QuickAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="新建任务"
      className="grid h-[42px] w-[42px] place-items-center rounded-[13px] border border-transparent bg-[var(--primary)] text-white shadow-soft"
      onClick={onClick}
      type="button"
    >
      <Plus size={22} />
    </button>
  );
}

function CreationResultSheet({
  message,
  onClose,
  title,
  tone
}: {
  message: string;
  onClose: () => void;
  title: string;
  tone: "danger" | "success";
}) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(36,48,47,0.24)] px-5 backdrop-blur-sm">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-[min(100%,360px)] rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-[0_18px_48px_rgba(61,50,36,0.2)]"
        role="dialog"
      >
        <div
          className={[
            "mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[14px]",
            tone === "success" ? "bg-[var(--primary-soft)] text-[#1e655a]" : "bg-[#fde7e2] text-[#9f332b]"
          ].join(" ")}
        >
          {tone === "success" ? <Check size={22} strokeWidth={3} /> : <X size={22} strokeWidth={3} />}
        </div>
        <h2 className="text-[19px] font-extrabold leading-tight" id={titleId}>{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">{message}</p>
        <button
          className={[
            "mt-4 h-11 w-full rounded-xl border font-bold",
            tone === "success"
              ? "border-transparent bg-[var(--primary)] text-white"
              : "border-[#f5c6bd] bg-[#fde7e2] text-[#9f332b]"
          ].join(" ")}
          onClick={onClose}
          type="button"
        >
          知道了
        </button>
      </section>
    </div>
  );
}

function RewardConfirmSheet({
  isPending,
  onCancel,
  onConfirm,
  task
}: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  task: Task;
}) {
  const titleId = useId();
  const rewardCount = task.rewardStars ?? 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(36,48,47,0.24)] px-5 backdrop-blur-sm">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-[min(100%,372px)] rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_48px_rgba(61,50,36,0.2)]"
        role="dialog"
      >
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-[#fff4dc] text-[#a5601f]">
          <WandSparkles size={22} strokeWidth={2.7} />
        </div>
        <h2 className="text-[19px] font-extrabold leading-tight" id={titleId}>确认完成奖励</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
          {rewardCount > 0
            ? `确认「${task.title}」后，会给小柚子 ${rewardCount} 朵小红花。`
            : `确认「${task.title}」后，任务会标记为已完成。`}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            className="h-11 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)] disabled:opacity-45"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            再看看
          </button>
          <button
            className="h-11 rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white disabled:opacity-45"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "确认中..." : rewardCount > 0 ? `确认并发 ${rewardCount} 朵` : "确认完成"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FeedPetConfirmSheet({
  isPending,
  onCancel,
  onConfirm,
  petStats
}: {
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  petStats: PetStats;
}) {
  const titleId = useId();
  const remainingFlowers = Math.max(0, petStats.flowers - 1);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(36,48,47,0.24)] px-5 backdrop-blur-sm">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-[min(100%,372px)] rounded-[22px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_18px_48px_rgba(61,50,36,0.2)]"
        role="dialog"
      >
        <div className="mb-3 grid h-11 w-11 place-items-center rounded-[14px] bg-[#eee8ff] text-[#5d42ae]">
          <WandSparkles size={22} strokeWidth={2.7} />
        </div>
        <h2 className="text-[19px] font-extrabold leading-tight" id={titleId}>喂小精灵吗？</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[var(--muted)]">
          这次会消耗 1 朵小红花。现在有 {petStats.flowers} 朵，喂完还剩 {remainingFlowers} 朵。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <button
            className="h-11 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)] disabled:opacity-45"
            disabled={isPending}
            onClick={onCancel}
            type="button"
          >
            先不喂
          </button>
          <button
            className="h-11 rounded-xl border border-transparent bg-[linear-gradient(135deg,#9a7bea,#f2b56b)] font-bold text-white shadow-soft disabled:opacity-45"
            disabled={isPending || petStats.flowers <= 0}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "喂养中..." : "确认喂养"}
          </button>
        </div>
      </section>
    </div>
  );
}

function FlowerHistorySheet({
  events,
  onClose,
  petStats
}: {
  events: FlowerRewardEvent[];
  onClose: () => void;
  petStats: PetStats;
}) {
  const titleId = useId();

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(36,48,47,0.24)] px-4 pb-4 pt-12 backdrop-blur-sm sm:items-center sm:px-5">
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="max-h-[82dvh] w-[min(100%,420px)] overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_18px_48px_rgba(61,50,36,0.2)]"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-4">
          <div>
            <p className="text-[13px] font-bold text-[#a5601f]">现在有 {petStats.flowers} 朵小红花</p>
            <h2 className="mt-0.5 text-[19px] font-extrabold leading-tight" id={titleId}>小红花通知</h2>
          </div>
          <button
            aria-label="关闭小红花通知"
            className="grid h-10 w-10 flex-none place-items-center rounded-xl border border-[var(--border)] bg-[#fffaf1] text-[var(--muted)]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(82dvh-82px)] overflow-y-auto px-4 py-3">
          {events.length ? (
            <div className="grid gap-2.5">
              {events.map((event) => (
                <article
                  className="rounded-[16px] border border-[rgba(231,222,210,0.78)] bg-[rgba(255,250,241,0.72)] p-3"
                  key={event.id}
                >
                  <div className="mb-1.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-extrabold text-[var(--text)]">
                        {event.giverName}送你 {event.stars} 朵小红花
                      </h3>
                      <p className="mt-0.5 text-[12px] font-semibold text-[var(--faint)]">{event.timeLabel}</p>
                    </div>
                    <span className="flex-none rounded-[11px] bg-[#fff4dc] px-2.5 py-1 text-[13px] font-extrabold text-[#a5601f]">
                      +{event.stars}
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-[var(--muted)]">原因：{event.reason}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[rgba(231,222,210,0.9)] bg-[rgba(255,250,241,0.62)] px-4 py-8 text-center">
              <p className="text-[15px] font-extrabold text-[var(--text)]">还没有收到小红花</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">
                完成任务后，爸爸妈妈确认奖励，这里就会出现记录。
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function QuickCreateSheet({
  currentUser,
  target,
  onClose,
  onEditFull,
  onSubmit
}: {
  currentUser: FamilyUser;
  target: QuickCreateTarget;
  onClose: () => void;
  onEditFull: (draft: TaskDraft) => void;
  onSubmit: (draft: TaskDraft) => void;
}) {
  const isChildUser = currentUser.role === childUserId;
  const defaultsToChild = isChildUser || target === childUserId;
  const starterText =
    defaultsToChild
      ? "例如：今天小柚子练字一页"
      : "例如：明天爸爸买牛奶，提前3天提醒";
  const [text, setText] = useState(starterText);
  const [hasEditedText, setHasEditedText] = useState(false);
  const quickCreateTitleId = useId();
  const quickTextInputId = useId();
  const effectiveText = hasEditedText ? text : "";
  const draft = useMemo(
    () => parseQuickTask(effectiveText, currentUser, defaultsToChild ? childUserId : undefined),
    [currentUser, defaultsToChild, effectiveText]
  );
  const ownerNames = familyUsers
    .filter((user) => draft.ownerIds.includes(user.id))
    .map((user) => user.name)
    .join("、");
  const canSave =
    draft.title.trim() &&
    draft.taskDate &&
    draft.dueDate &&
    draft.taskTimeLabel?.trim() &&
    draft.dueLabel.trim() &&
    draft.ownerIds.length;

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-[rgba(36,48,47,0.24)] px-3 pt-10 backdrop-blur-sm">
      <section
        aria-labelledby={quickCreateTitleId}
        aria-modal="true"
        className="bottom-sheet-safe mt-auto max-h-[90vh] w-[min(100%,430px)] overflow-y-auto rounded-t-[26px] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[0_-18px_42px_rgba(61,50,36,0.18)]"
        role="dialog"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[13px] text-[var(--muted)]">快捷新增</p>
            <h2 className="text-[22px] font-extrabold leading-tight" id={quickCreateTitleId}>说一句，先生成卡片</h2>
          </div>
          <button
            aria-label="关闭快捷新增"
            className="grid h-10 w-10 place-items-center rounded-[13px] border border-[var(--border)] bg-[#fffaf1]"
            onClick={onClose}
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <div className="mb-3 rounded-2xl border border-[rgba(79,157,143,0.22)] bg-[rgba(221,239,234,0.5)] p-3.5">
          <label className="mb-2 flex items-center gap-2 text-[13px] font-bold text-[#1e655a]" htmlFor={quickTextInputId}>
            <Mic size={16} />
            一句话内容
          </label>
          <textarea
            className="form-input min-h-[96px] resize-none bg-[var(--surface)] py-3 leading-relaxed"
            id={quickTextInputId}
            maxLength={taskNoteMaxLength}
            value={text}
            onFocus={() => {
              if (!hasEditedText && text === starterText) {
                setText("");
              }
            }}
            onChange={(event) => {
              setHasEditedText(true);
              setText(event.target.value);
            }}
          />
        </div>

        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[rgba(255,250,241,0.76)] p-3.5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--primary-soft)] text-[#1e655a]">
                <WandSparkles size={17} />
              </span>
              <strong className="text-[15px]">待确认任务卡</strong>
            </div>
            <span className="text-[12px] text-[var(--muted)]">可继续编辑</span>
          </div>
          <div className="task-card shadow-none">
            <h3 className="mb-1.5 text-[16px] font-bold leading-snug">{draft.title || "还没有识别到标题"}</h3>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--muted)]">
              {draft.note || "没有备注。"}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {!isChildUser ? (
                <span className="chip chip-primary">
                  {taskCategoryLabels[draft.category]}
                </span>
              ) : null}
              <span className={draft.priority === urgentPriority ? "chip chip-danger" : "chip"}>
                {taskPriorityLabels[draft.priority]}
              </span>
              {!isChildUser ? <span className="chip">负责人：{ownerNames}</span> : null}
              <span className="chip">完成时间：{getDraftTimeRangeLabel(draft)}</span>
              {!isChildUser && draft.repeatLabel ? <span className="chip">{draft.repeatLabel}</span> : null}
              {draft.rewardStars ? <span className="chip chip-warm">奖励 {draft.rewardStars} 朵</span> : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            className="min-h-12 rounded-xl border border-[var(--border)] bg-[#fffaf1] font-bold text-[var(--text)]"
            onClick={() => onEditFull(draft)}
            type="button"
          >
            完整编辑
          </button>
          <button
            className="min-h-12 rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white disabled:opacity-45"
            disabled={!canSave}
            onClick={() => onSubmit(draft)}
            type="button"
          >
            确认保存
          </button>
        </div>
      </section>
    </div>
  );
}

function ReminderButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      aria-label="查看提醒"
      className={[
        "relative grid h-[42px] w-[42px] place-items-center rounded-[13px] border shadow-soft",
        count
          ? "border-[#f5c6bd] bg-[#fde7e2] text-[#9f332b]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      <Bell size={20} />
      {count ? (
        <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#fbf7ef] bg-[var(--danger)] px-1 text-[11px] font-extrabold leading-none text-white">
          {count}
        </span>
      ) : null}
    </button>
  );
}

function HomePanel({
  currentUser,
  pendingTaskIds,
  tasks,
  reminderCount,
  onConfirmReward,
  onCreate,
  onOpenReminders,
  onOpen,
  onToggle
}: {
  currentUser: FamilyUser;
  pendingTaskIds: Set<string>;
  tasks: Task[];
  reminderCount: number;
  onConfirmReward: (id: string) => void;
  onCreate: () => void;
  onOpenReminders: () => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const availableTasks = tasks.filter((task) => task.status !== doneStatus);
  const groupedTasks = homeGroups
    .map((group) => ({
      ...group,
      tasks: getTasksForHomeGroup(availableTasks, group.key)
    }))
    .filter((group) => group.tasks.length > 0);

  return (
    <section className="px-4 pt-[18px]">
      <PageTopbar
        eyebrow={formatDateLabel(getTodayDate(), "星期")}
        title="今天先看最要紧的"
        action={
          <div className="flex items-center gap-2">
            <ReminderButton count={reminderCount} onClick={onOpenReminders} />
            <QuickAddButton onClick={onCreate} />
          </div>
        }
      />

      {groupedTasks.length ? (
        <div className="grid gap-[18px]">
          {groupedTasks.map((group) => (
            <section key={group.key}>
              <SectionHeader title={group.title} count={group.tasks.length} />
              <div className="grid gap-[11px]">
                {group.tasks.map((task) => (
                  <TaskCard
                    currentUser={currentUser}
                    isActionPending={pendingTaskIds.has(task.id)}
                    key={task.id}
                    task={task}
                    onConfirmReward={onConfirmReward}
                    onOpen={onOpen}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,253,248,0.78)] p-5 text-center shadow-soft">
          <h3 className="mb-1.5 text-[16px] font-bold">最近暂时没有任务</h3>
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            可以点右上角快速新增，先把想到的事情放进来。
          </p>
        </div>
      )}
    </section>
  );
}

function getTasksForHomeGroup(tasks: Task[], groupKey: HomeGroupKey) {
  return sortTasksByDate(tasks.filter((task) => getHomeGroupKey(task) === groupKey));
}

function getHomeGroupKey(task: Pick<Task, "dueDate" | "status" | "taskDate" | "timeBucket">): HomeGroupKey {
  const timeBucket = getTaskTimeBucket(task);
  if (
    timeBucket === overdueTimeBucket ||
    timeBucket === todayTimeBucket ||
    timeBucket === tomorrowTimeBucket ||
    timeBucket === dayAfterTimeBucket
  ) {
    return timeBucket;
  }

  const taskDate = parseDateOnly(task.dueDate || task.taskDate);
  if (!taskDate) return afterMonthHomeGroup;

  const today = getTodayDate();
  const todayWeekday = today.getDay() || 7;
  const weekEnd = new Date(today);
  weekEnd.setDate(today.getDate() + (7 - todayWeekday));
  if (taskDate.getTime() <= weekEnd.getTime()) return weekTimeBucket;

  const isSameMonth =
    taskDate.getFullYear() === today.getFullYear() &&
    taskDate.getMonth() === today.getMonth();
  return isSameMonth ? monthHomeGroup : afterMonthHomeGroup;
}

function EmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,253,248,0.78)] p-5 text-center shadow-soft">
      <h3 className="mb-1.5 text-[16px] font-bold">{title}</h3>
      <p className="text-[14px] leading-relaxed text-[var(--muted)]">{description}</p>
    </div>
  );
}

function ListPanel({
  currentUser,
  pendingTaskIds,
  tasks,
  onConfirmReward,
  onCreate,
  onOpen,
  onToggle
}: {
  currentUser: FamilyUser;
  pendingTaskIds: Set<string>;
  tasks: Task[];
  onConfirmReward: (id: string) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<ListOwnerFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ListStatusFilter>(todoStatus);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTasks = sortTasksByDate(
    tasks.filter((task) => {
      const matchesQuery =
        !normalizedQuery ||
        task.title.toLowerCase().includes(normalizedQuery) ||
        task.note.toLowerCase().includes(normalizedQuery);
      const matchesOwner = ownerFilter === "all" || isTaskOwner(task, ownerFilter);
      const matchesStatus = statusFilter === doneStatus ? task.status === doneStatus : task.status !== doneStatus;

      return matchesQuery && matchesOwner && matchesStatus;
    })
  );
  const timelineGroups = groupTasksByTimelineDate(visibleTasks);

  return (
    <section className="px-4 pt-[18px]">
      <PageTopbar eyebrow="全部清单" title="按时间看全局" action={<QuickAddButton onClick={onCreate} />} />
      <div className="mb-3 grid gap-2">
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
          <input
            className="h-[42px] w-full rounded-[13px] border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 outline-none"
            placeholder="搜索标题或备注"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="grid gap-1.5 rounded-[13px] border border-[rgba(231,222,210,0.72)] bg-[rgba(255,253,248,0.58)] p-1.5">
          <div className="flex gap-1.5 overflow-x-auto">
            {ownerFilters.map((filter) => (
              <FilterChip
                active={ownerFilter === filter.key}
                key={filter.key}
                label={filter.label}
                onClick={() => setOwnerFilter(filter.key)}
              />
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {statusFilters.map((filter) => (
              <FilterChip
                active={statusFilter === filter.key}
                key={filter.key}
                label={filter.label}
                onClick={() => setStatusFilter(filter.key)}
              />
            ))}
          </div>
        </div>
      </div>

      {timelineGroups.length ? (
        <div className="relative grid gap-[15px] pl-4 before:absolute before:left-[5px] before:bottom-2 before:top-3 before:w-px before:bg-[rgba(79,157,143,0.18)]">
          {timelineGroups.map((group) => (
            <section className="relative" key={group.key}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="absolute -left-[13px] top-[7px] h-[9px] w-[9px] rounded-full border-2 border-[var(--bg)] bg-[var(--primary)]" />
                <h2 className="text-[15px] font-extrabold leading-tight text-[var(--text)]">{group.label}</h2>
                <span className="text-[12px] font-bold text-[var(--muted)]">{group.tasks.length} 项</span>
              </div>
              <div className="grid gap-[10px]">
                {group.tasks.map((task) => (
                  <TaskCard
                    currentUser={currentUser}
                    isActionPending={pendingTaskIds.has(task.id)}
                    key={task.id}
                    task={task}
                    onConfirmReward={onConfirmReward}
                    onOpen={onOpen}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,253,248,0.78)] p-5 text-center shadow-soft">
          <h3 className="mb-1.5 text-[16px] font-bold">没有匹配的任务</h3>
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            换个关键词，或者清掉筛选条件再看看。
          </p>
        </div>
      )}
    </section>
  );
}

function groupTasksByTimelineDate(tasks: Task[]) {
  const groups = new Map<string, { key: string; label: string; tasks: Task[] }>();

  for (const task of tasks) {
    const date = task.taskDate || task.dueDate;
    const key = date || "unscheduled";
    const label = date ? formatDateLabel(date) : "未设置日期";
    const group = groups.get(key);
    if (group) {
      group.tasks.push(task);
    } else {
      groups.set(key, { key, label, tasks: [task] });
    }
  }

  return Array.from(groups.values());
}

function RemindersPanel({
  currentUser,
  pendingTaskIds,
  dueSoonTasks,
  overdueTasks,
  pendingRewardTasks,
  onBack,
  onConfirmReward,
  onOpen,
  onToggle
}: {
  currentUser: FamilyUser;
  pendingTaskIds: Set<string>;
  dueSoonTasks: Task[];
  overdueTasks: Task[];
  pendingRewardTasks: Task[];
  onBack: () => void;
  onConfirmReward: (id: string) => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const totalCount = overdueTasks.length + dueSoonTasks.length + pendingRewardTasks.length;

  return (
    <section className="px-4 pt-[18px]">
      <div className="mb-[18px] flex items-center gap-3">
        <button
          aria-label="返回首页"
          className="grid h-[42px] w-[42px] place-items-center rounded-[13px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-soft"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[13px] text-[var(--muted)]">站内提醒</p>
          <h2 className="text-[25px] font-extrabold leading-tight tracking-normal">需要看一下</h2>
        </div>
        {totalCount ? (
          <span className="grid min-h-9 min-w-9 place-items-center rounded-full bg-[#fde7e2] px-2 text-[14px] font-extrabold text-[#9f332b]">
            {totalCount}
          </span>
        ) : null}
      </div>

      {totalCount ? (
        <div className="grid gap-[18px]">
          <ReminderSection
            accent="danger"
            count={overdueTasks.length}
            description="这些任务已经超过最晚完成时间，会一直留在这里，直到完成。"
            title="逾期提醒"
          >
            {overdueTasks.map((task) => (
              <TaskCard
                currentUser={currentUser}
                isActionPending={pendingTaskIds.has(task.id)}
                key={task.id}
                task={task}
                onConfirmReward={onConfirmReward}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </ReminderSection>

          <ReminderSection
            accent="primary"
            count={dueSoonTasks.length}
            description="根据最晚完成时间和提前提醒设置，今天需要看一下。"
            title="今日提醒"
          >
            {dueSoonTasks.map((task) => (
              <TaskCard
                currentUser={currentUser}
                isActionPending={pendingTaskIds.has(task.id)}
                key={task.id}
                task={task}
                onConfirmReward={onConfirmReward}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </ReminderSection>

          <ReminderSection
            accent="magic"
            count={pendingRewardTasks.length}
            description="小柚子勾选完成后，爸爸或妈妈确认一下；有奖励的任务会同时发小红花。"
            title="待确认小柚子任务"
          >
            {pendingRewardTasks.map((task) => (
              <TaskCard
                currentUser={currentUser}
                isActionPending={pendingTaskIds.has(task.id)}
                key={task.id}
                task={task}
                onConfirmReward={onConfirmReward}
                onOpen={onOpen}
                onToggle={onToggle}
              />
            ))}
          </ReminderSection>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,253,248,0.78)] p-5 text-center shadow-soft">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[#1e655a]">
            <Bell size={21} />
          </div>
          <h3 className="mb-1.5 text-[16px] font-bold">现在没有新的提醒</h3>
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            逾期任务和小柚子任务确认，后面都会集中出现在这里。
          </p>
        </div>
      )}
    </section>
  );
}

function ReminderSection({
  accent,
  children,
  count,
  description,
  title
}: {
  accent: "danger" | "magic" | "primary";
  children: React.ReactNode;
  count: number;
  description: string;
  title: string;
}) {
  return (
    <section
      className={[
        "rounded-[18px] border p-3 shadow-soft",
        accent === "danger"
          ? "border-[#f5c6bd] bg-[rgba(253,231,226,0.44)]"
          : accent === "primary"
            ? "border-[rgba(79,157,143,0.26)] bg-[rgba(221,239,234,0.48)]"
          : "border-[#ddd2ff] bg-[rgba(238,232,255,0.42)]"
      ].join(" ")}
    >
      <div className="mb-3 flex items-start justify-between gap-3 px-1">
        <div>
          <h3
            className={[
              "text-[17px] font-extrabold leading-snug",
              accent === "danger" ? "text-[#9f332b]" : accent === "primary" ? "text-[#1e655a]" : "text-[#5d42ae]"
            ].join(" ")}
          >
            {title}
          </h3>
          <p className="mt-1 text-[13px] leading-relaxed text-[var(--muted)]">{description}</p>
        </div>
        <span
          className={[
            "grid min-h-7 min-w-7 flex-none place-items-center rounded-full px-2 text-[13px] font-extrabold",
            accent === "danger" ? "bg-[#fde7e2] text-[#9f332b]" : accent === "primary" ? "bg-[var(--primary-soft)] text-[#1e655a]" : "bg-[#eee8ff] text-[#5d42ae]"
          ].join(" ")}
        >
          {count}
        </span>
      </div>
      {count ? <div className="grid gap-[11px]">{children}</div> : null}
    </section>
  );
}

function FilterChip({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={[
        "h-8 flex-none rounded-[10px] border px-3 text-[13px] font-bold",
        active
          ? "border-[rgba(79,157,143,0.28)] bg-[rgba(221,239,234,0.76)] text-[#1e7f64]"
          : "border-transparent bg-transparent text-[#87918e]"
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function BabyPanel({
  currentUser,
  pendingTaskIds,
  tasks,
  petStats,
  isFeedingPet,
  onFeedPet,
  onConfirmReward,
  onCreate,
  onOpen,
  onToggle
}: {
  currentUser: FamilyUser;
  pendingTaskIds: Set<string>;
  tasks: Task[];
  petStats: PetStats;
  isFeedingPet: boolean;
  onFeedPet: () => void;
  onConfirmReward: (id: string) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const sortedTasks = sortTasksByDate(tasks);

  return (
    <section className="px-4 pt-[18px]">
      <PageTopbar
        eyebrow="小柚子空间"
        title="小精灵今天很期待"
        action={<QuickAddButton onClick={onCreate} />}
      />
      <div className="mb-4 rounded-[22px] border border-[rgba(154,123,234,0.22)] bg-[linear-gradient(140deg,#eee8ff_0%,#fff7df_52%,#ddefea_100%)] p-[18px] shadow-soft">
        <h3 className="mb-1.5 text-[16px] font-bold leading-snug">梦幻小精灵</h3>
        <p className="text-[14px] leading-relaxed text-[var(--muted)]">
          喂一朵小红花，它会变得更开心。
        </p>
        <MagicSprite />
        <div className="mb-3 rounded-[15px] border border-[rgba(255,255,255,0.74)] bg-[rgba(255,253,248,0.56)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3 text-[13px]">
            <span className="font-bold text-[#5d42ae]">等级 {petStats.level}</span>
            <span className="text-[var(--muted)]">距离下一级还差 {petStats.nextLevelIn} 朵</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[rgba(154,123,234,0.16)]">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#9a7bea,#f2b56b,#71c3b6)]"
              style={{ width: `${petStats.levelProgress}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            [String(petStats.flowers), "小红花"],
            [String(petStats.level), "等级"],
            [String(petStats.happiness), "开心值"]
          ].map(([value, label]) => (
            <div
              className="rounded-[13px] border border-[rgba(231,222,210,0.75)] bg-[rgba(255,253,248,0.72)] p-2.5"
              key={label}
            >
              <strong className="mb-0.5 block text-lg">{value}</strong>
              <span className="text-[12px] text-[var(--muted)]">{label}</span>
            </div>
          ))}
        </div>
        <button
          className="mt-3 min-h-12 w-full rounded-[14px] border border-transparent bg-[linear-gradient(135deg,#9a7bea,#f2b56b)] px-4 text-[15px] font-extrabold text-white shadow-soft disabled:opacity-45"
          disabled={petStats.flowers <= 0 || isFeedingPet}
          onClick={onFeedPet}
          type="button"
        >
          {isFeedingPet ? "喂养中..." : "喂一朵小红花"}
        </button>
      </div>

      <SectionHeader title="小柚子全部任务" count={sortedTasks.length} />
      {sortedTasks.length ? (
        <div className="grid gap-[11px]">
          {sortedTasks.map((task) => (
            <TaskCard
              compactForChild={currentUser.role === childUserId}
              currentUser={currentUser}
              isActionPending={pendingTaskIds.has(task.id)}
              key={task.id}
              task={task}
              onConfirmReward={onConfirmReward}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="小柚子现在没有任务"
          description="爸爸妈妈新增学习计划后，会放在这里一起看。"
        />
      )}
    </section>
  );
}

function MagicSprite() {
  return (
    <div aria-label="梦幻小精灵" className="magic-sprite-stage" role="img">
      <span className="magic-sparkle magic-sparkle-one" />
      <span className="magic-sparkle magic-sparkle-two" />
      <span className="magic-sparkle magic-sparkle-three" />
      <div className="magic-sprite">
        <span className="magic-wing magic-wing-left" />
        <span className="magic-wing magic-wing-right" />
        <span className="magic-antenna magic-antenna-left" />
        <span className="magic-antenna magic-antenna-right" />
        <span className="magic-ear magic-ear-left" />
        <span className="magic-ear magic-ear-right" />
        <span className="magic-body">
          <span className="magic-forehead" />
          <span className="magic-eye magic-eye-left" />
          <span className="magic-eye magic-eye-right" />
          <span className="magic-cheek magic-cheek-left" />
          <span className="magic-cheek magic-cheek-right" />
          <span className="magic-smile" />
        </span>
      </div>
    </div>
  );
}

function MePanel({
  currentUser,
  flowerRewardEvents,
  pendingTaskIds,
  petStats,
  tasks,
  onConfirmReward,
  onLogout,
  onOpen,
  onOpenFlowerHistory,
  onTrash,
  onSettings,
  onToggle
}: {
  currentUser: FamilyUser;
  flowerRewardEvents: FlowerRewardEvent[];
  pendingTaskIds: Set<string>;
  petStats: PetStats;
  tasks: Task[];
  onConfirmReward: (id: string) => void;
  onLogout: () => void;
  onOpen: (id: string) => void;
  onOpenFlowerHistory: () => void;
  onTrash: () => void;
  onSettings: () => void;
  onToggle: (id: string) => void;
}) {
  const sortedTasks = sortTasksByDate(tasks);
  const latestFlowerReward = flowerRewardEvents[0];

  if (currentUser.role === childUserId) {
    return (
      <section className="px-4 pt-[18px]">
        <IdentityCard currentUser={currentUser} petStats={petStats} />
        <FlowerNoticeButton
          event={latestFlowerReward}
          eventCount={flowerRewardEvents.length}
          flowerCount={petStats.flowers}
          onClick={onOpenFlowerHistory}
        />
        <MenuButton icon={<LogOut size={18} />} label="退出登录" tone="danger" onClick={onLogout} />
      </section>
    );
  }

  return (
    <section className="px-4 pt-[18px]">
      <IdentityCard currentUser={currentUser} />

      <SectionHeader title="我的任务" count={tasks.length} />
      {sortedTasks.length ? (
        <div className="grid gap-[11px]">
          {sortedTasks.map((task) => (
            <TaskCard
              currentUser={currentUser}
              isActionPending={pendingTaskIds.has(task.id)}
              key={task.id}
              task={task}
              onConfirmReward={onConfirmReward}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="我的任务已经清空"
          description="属于你的未完成任务会直接列在这里。"
        />
      )}

      <div className="mt-[18px] grid gap-2.5">
        <MenuButton icon={<Trash2 size={18} />} label="回收站" onClick={onTrash} />
        <MenuButton icon={<Settings size={18} />} label="设置" onClick={onSettings} />
        <MenuButton icon={<LogOut size={18} />} label="退出登录" tone="danger" onClick={onLogout} />
      </div>
    </section>
  );
}

function IdentityCard({ currentUser, petStats }: { currentUser: FamilyUser; petStats?: PetStats }) {
  const roleCopy = {
    dad: {
      subtitle: "家里机动队队长，自己建的任务自己修，顺手还能给小柚子发小红花。",
      title: "爸爸",
      variant: dadUserId
    },
    mom: {
      subtitle: "全家任务总指挥，新增、修改、删除、恢复都归她拍板。",
      title: "妈妈",
      variant: momUserId
    },
    child: {
      subtitle: "小红花收集官，完成任务后等爸爸妈妈盖章发奖。",
      title: "小柚子",
      variant: childUserId
    }
  }[currentUser.role];

  if (currentUser.role === childUserId && petStats) {
    return (
      <section className={["identity-card", `identity-card-${roleCopy.variant}`].join(" ")}>
        <div className="relative z-[1] flex items-center gap-4">
          <RoleAvatar role={currentUser.role} />
          <div className="min-w-0 flex-1">
            <h2 className="identity-title">小柚子</h2>
            <p className="identity-subtitle">小红花 {petStats.flowers} 朵，精灵等级 {petStats.level}</p>
          </div>
        </div>

        <div className="relative z-[1] mt-4 grid grid-cols-2 gap-2.5">
          <div className="identity-stat">
            <strong>{petStats.flowers}</strong>
            <span>拥有的小红花</span>
          </div>
          <div className="identity-stat">
            <strong>{petStats.level}</strong>
            <span>小精灵等级</span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={["identity-card", `identity-card-${roleCopy.variant}`].join(" ")}>
      <div className="relative z-[1] flex items-center gap-4">
        <RoleAvatar role={currentUser.role} />
        <div className="min-w-0 flex-1">
          <h2 className="identity-title">Hi~{roleCopy.title}</h2>
          <p className="identity-subtitle">{roleCopy.subtitle}</p>
        </div>
      </div>

      {currentUser.role === childUserId && petStats ? (
        <div className="relative z-[1] mt-4 grid grid-cols-2 gap-2.5">
          <div className="identity-stat">
            <strong>{petStats.flowers}</strong>
            <span>拥有的小红花</span>
          </div>
          <div className="identity-stat">
            <strong>{petStats.level}</strong>
            <span>小精灵等级</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FlowerNoticeButton({
  event,
  eventCount,
  flowerCount,
  onClick
}: {
  event?: FlowerRewardEvent;
  eventCount: number;
  flowerCount: number;
  onClick: () => void;
}) {
  return (
    <button
      className="mb-2.5 flex w-full items-center justify-between gap-3 rounded-[22px] border border-[rgba(231,222,210,0.8)] bg-[rgba(255,253,248,0.9)] px-4 py-3.5 text-left shadow-soft"
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative grid h-12 w-12 flex-none place-items-center rounded-[16px] bg-[#fff4dc] text-[#a5601f]">
          <Bell size={20} />
          {eventCount > 0 ? <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#f06f5f]" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-extrabold text-[var(--text)]">
            {event ? `${event.giverName}送你 ${event.stars} 朵小红花` : "小红花通知"}
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold text-[var(--muted)]">
            {event ? `因为：${event.reason}` : `现在有 ${flowerCount} 朵，收到奖励会记在这里`}
          </span>
        </span>
      </span>
      <span className="flex flex-none items-center gap-2">
        <span className="rounded-[10px] bg-[var(--primary-soft)] px-2 py-1 text-[12px] font-extrabold text-[#1e655a]">
          {flowerCount} 朵
        </span>
        <ChevronRight className="text-[#d8b6ad]" size={18} />
      </span>
    </button>
  );
}

function RoleAvatar({ role }: { role: FamilyUser["role"] }) {
  const avatarSrc = {
    child: "/avatars/child.png",
    dad: "/avatars/dad.png",
    mom: "/avatars/mom.png"
  }[role];
  const avatarLabel = {
    child: "小柚子头像",
    dad: "爸爸头像",
    mom: "妈妈头像"
  }[role];

  return (
    <div className="role-avatar" aria-label={avatarLabel}>
      <Image alt="" fill priority sizes="86px" src={avatarSrc} />
    </div>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  tone = "default"
}: {
  icon?: ReactNode;
  label: string;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      className={["menu-button", tone === "danger" ? "menu-button-danger" : ""].join(" ")}
      onClick={onClick}
      type="button"
    >
      <span className="menu-button-main">
        {icon ? <span className="menu-button-icon">{icon}</span> : null}
        <span>{label}</span>
      </span>
      <ChevronRight className="menu-button-chevron" size={18} />
    </button>
  );
}

type SettingsView = "index" | "reminders" | "password" | "data";

function SettingsPanel({
  currentUser,
  reminderSettings,
  onBack,
  onReminderSettingsChange,
  onSessionExpired
}: {
  currentUser: FamilyUser;
  reminderSettings: ReminderSettings;
  onBack: () => void;
  onReminderSettingsChange: (settings: ReminderSettings) => void;
  onSessionExpired: () => void;
}) {
  const [view, setView] = useState<SettingsView>("index");
  const [savedMessage, setSavedMessage] = useState("");

  function updateReminderSetting(key: keyof ReminderSettings, value: boolean) {
    onReminderSettingsChange({
      ...reminderSettings,
      [key]: value
    });
  }

  if (view === "reminders") {
    return (
      <section className="px-4 pt-[18px]">
        <SettingsHeader eyebrow="设置" title="提醒设置" onBack={() => setView("index")} />

        <div className="grid gap-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-soft">
            <h3 className="mb-1.5 text-[16px] font-bold leading-snug">站内提醒</h3>
            <p className="mb-3.5 text-[14px] leading-relaxed text-[var(--muted)]">
              先用应用内提醒，逾期任务和小柚子任务确认会出现在首页提醒铃里。
            </p>
            <div className="grid gap-2.5">
              <SettingToggle
                checked={reminderSettings.siteRemindersEnabled}
                description="关闭后，首页提醒铃不再作为重点入口。"
                label="开启站内提醒"
                onChange={(checked) => updateReminderSetting(siteRemindersEnabledKey, checked)}
              />
              <SettingToggle
                checked={reminderSettings.overdueRemindersEnabled}
                description="任务逾期后继续提醒，直到被勾选完成。"
                disabled={!reminderSettings.siteRemindersEnabled}
                label="逾期任务持续提醒"
                onChange={(checked) => updateReminderSetting(overdueRemindersEnabledKey, checked)}
              />
              <SettingToggle
                checked={reminderSettings.rewardRemindersEnabled}
                description="小柚子完成任务后，提醒爸爸妈妈确认完成；有奖励时同时发小红花。"
                disabled={!reminderSettings.siteRemindersEnabled}
                label="小柚子待确认提醒"
                onChange={(checked) => updateReminderSetting(rewardRemindersEnabledKey, checked)}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,253,248,0.78)] p-4 shadow-soft">
            <h3 className="mb-1.5 text-[16px] font-bold leading-snug">默认提醒节奏</h3>
            <div className="grid gap-2.5">
              <SettingSummary label="最晚完成前提醒" value="按任务设置提前 1 / 2 / 3 天" />
              <SettingSummary label="逾期后提醒" value="每天继续提醒，直到完成" />
              <SettingSummary label="提醒对象" value="默认提醒任务负责人" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (view === "password") {
    return (
      <PasswordPanel
        currentUser={currentUser}
        onBack={() => setView("index")}
        onSaved={async (currentPassword, nextPassword) => {
          try {
            await apiRequest<{ user: FamilyUser }>(authChangePasswordApiPath, {
              body: { currentPassword, nextPassword },
              method: "POST"
            });
          } catch (error) {
            if (isUnauthorizedError(error)) {
              onSessionExpired();
              return;
            }
            throw error;
          }
          setSavedMessage("密码已保存。下次登录请使用新密码。");
          window.setTimeout(() => setSavedMessage(""), 2200);
        }}
        savedMessage={savedMessage}
      />
    );
  }

  if (view === "data") {
    return <DataSafetyPanel onBack={() => setView("index")} onSessionExpired={onSessionExpired} />;
  }

  return (
    <section className="px-4 pt-[18px]">
      <SettingsHeader eyebrow="我的" title="设置" onBack={onBack} />

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-soft">
        <h3 className="mb-1.5 text-[16px] font-bold leading-snug">账号设置</h3>
        <p className="mb-3.5 text-[14px] leading-relaxed text-[var(--muted)]">
          提醒和密码都放在这里，日常任务留在“我的”页面直接查看。
        </p>
        <div className="grid gap-2.5">
          <MenuButton icon={<Bell size={18} />} label="提醒设置" onClick={() => setView("reminders")} />
          <MenuButton icon={<KeyRound size={18} />} label="修改密码" onClick={() => setView("password")} />
          {currentUser.role === momUserId ? (
            <MenuButton icon={<ShieldCheck size={18} />} label="数据安全" onClick={() => setView("data")} />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsHeader({
  eyebrow,
  title,
  onBack
}: {
  eyebrow: string;
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="mb-[18px] flex items-center gap-3">
      <button
        aria-label="返回"
        className="grid h-[42px] w-[42px] place-items-center rounded-[13px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-soft"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft size={20} />
      </button>
      <div>
        <p className="mb-0.5 text-[13px] text-[var(--muted)]">{eyebrow}</p>
        <h2 className="text-[25px] font-extrabold leading-tight tracking-normal">{title}</h2>
      </div>
    </div>
  );
}

function SettingToggle({
  checked,
  description,
  disabled,
  label,
  onChange
}: {
  checked: boolean;
  description: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className={[
        "flex min-h-[68px] w-full items-center justify-between gap-3 rounded-[13px] border border-[var(--border)] bg-[rgba(255,250,241,0.72)] px-3.5 py-3 text-left",
        disabled ? "opacity-45" : ""
      ].join(" ")}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="min-w-0 flex-1">
        <strong className="mb-0.5 block text-[15px] leading-snug text-[var(--text)]">{label}</strong>
        <span className="block text-[13px] leading-relaxed text-[var(--muted)]">{description}</span>
      </span>
      <span
        className={[
          "relative h-7 w-12 flex-none rounded-full border transition-colors",
          checked
            ? "border-[var(--primary)] bg-[var(--primary)]"
            : "border-[var(--border)] bg-[#f0efec]"
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-1 h-5 w-5 rounded-full bg-white shadow-[0_2px_7px_rgba(36,48,47,0.2)] transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-1"
          ].join(" ")}
        />
      </span>
    </button>
  );
}

function SettingSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[13px] border border-[var(--border)] bg-[rgba(255,250,241,0.72)] px-3.5 py-3">
      <span className="mb-0.5 block text-[13px] text-[var(--muted)]">{label}</span>
      <strong className="block text-[15px] leading-snug">{value}</strong>
    </div>
  );
}

function PasswordPanel({
  currentUser,
  onBack,
  onSaved,
  savedMessage
}: {
  currentUser: FamilyUser;
  onBack: () => void;
  onSaved: (currentPassword: string, nextPassword: string) => Promise<void>;
  savedMessage: string;
}) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const normalizedNewPassword = newPassword.trim();
  const normalizedConfirmPassword = confirmPassword.trim();
  const canSave = Boolean(
    oldPassword.trim() &&
      normalizedNewPassword.length >= minPasswordLength &&
      normalizedNewPassword === normalizedConfirmPassword
  );

  return (
    <section className="px-4 pt-[18px]">
      <SettingsHeader eyebrow="设置" title="修改密码" onBack={onBack} />

      <form
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-soft"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canSave) return;
          setError("");
          setIsSaving(true);
          try {
            await onSaved(oldPassword.trim(), normalizedNewPassword);
            setOldPassword("");
            setNewPassword("");
            setConfirmPassword("");
          } catch (saveError) {
            setError(getPasswordSaveErrorMessage(saveError));
          } finally {
            setIsSaving(false);
          }
        }}
      >
        <h3 className="mb-1.5 text-[16px] font-bold leading-snug">账号密码</h3>
        <p className="mb-3.5 text-[14px] leading-relaxed text-[var(--muted)]">
          正在修改 {currentUser.name} 的登录密码，{minPasswordLength}-{maxPasswordLength} 位。
        </p>
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="text-[13px] text-[var(--muted)]">当前密码</span>
            <input
              autoComplete="current-password"
              className="form-input"
              maxLength={64}
              type="password"
              value={oldPassword}
              onChange={(event) => {
                setOldPassword(event.target.value);
                setError("");
              }}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[13px] text-[var(--muted)]">新密码</span>
            <input
              autoComplete="new-password"
              className="form-input"
              maxLength={64}
              minLength={6}
              type="password"
              value={newPassword}
              onChange={(event) => {
                setNewPassword(event.target.value);
                setError("");
              }}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[13px] text-[var(--muted)]">确认新密码</span>
            <input
              autoComplete="new-password"
              className="form-input"
              maxLength={64}
              minLength={6}
              type="password"
              value={confirmPassword}
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                setError("");
              }}
            />
          </label>
        </div>
        {newPassword && confirmPassword && normalizedNewPassword !== normalizedConfirmPassword ? (
          <p className="mt-3 text-[13px] font-bold text-[#9f332b]" role="alert">两次输入的新密码不一致。</p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-xl border border-[#f5c6bd] bg-[#fde7e2] px-3 py-2 text-[13px] font-bold text-[#9f332b]" role="alert">
            {error}
          </p>
        ) : null}
        {savedMessage ? (
          <p className="mt-3 text-[13px] font-bold text-[#1e655a]" role="status">{savedMessage}</p>
        ) : null}
        <button
          className="mt-4 h-11 w-full rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white disabled:bg-[#c9c7bf]"
          disabled={!canSave || isSaving}
          type="submit"
        >
          {isSaving ? "保存中..." : "保存新密码"}
        </button>
      </form>
    </section>
  );
}

function DataSafetyPanel({
  onBack,
  onSessionExpired
}: {
  onBack: () => void;
  onSessionExpired: () => void;
}) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const backupWarning = getBackupWarning(health?.manualBackups);
  const backupFileWarning = getBackupFileWarning(health?.manualBackups);

  const loadHealth = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await apiRequest<HealthResponse>(healthApiPath);
      setHealth(data);
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onSessionExpired();
        return;
      }
      setError("数据状态读取失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  async function createBackup() {
    setIsBackingUp(true);
    setError("");
    setMessage("");
    try {
      const data = await apiRequest<BackupResponse>(backupsApiPath, { method: "POST" });
      setMessage(`已完成手动备份：${data.backup.dirName}`);
      await loadHealth();
    } catch (error) {
      if (isUnauthorizedError(error)) {
        onSessionExpired();
        return;
      }
      setError("手动备份失败，请稍后再试。");
    } finally {
      setIsBackingUp(false);
    }
  }

  return (
    <section className="px-4 pt-[18px]">
      <SettingsHeader eyebrow="设置" title="数据安全" onBack={onBack} />

      <div className="grid gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-soft">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="mb-1.5 text-[16px] font-bold leading-snug">存储状态</h3>
              <p className="text-[14px] leading-relaxed text-[var(--muted)]">
                任务、账号和小精灵数据都会写入本地文件，并保留自动快照。
              </p>
              {health?.dataDir ? (
                <p className="mt-1 break-all text-[12px] leading-relaxed text-[var(--faint)]">
                  数据目录：{health.dataDir}
                </p>
              ) : null}
              {health?.dataDirWritable !== undefined ? (
                <p className={[
                  "mt-1 text-[12px] font-bold leading-relaxed",
                  health.dataDirWritable ? "text-[#1e655a]" : "text-[#9f332b]"
                ].join(" ")}>
                  写入权限：{health.dataDirWritable ? "正常" : "异常，请检查部署目录权限"}
                </p>
              ) : null}
            </div>
            <button
              aria-label="刷新数据状态"
              className="grid h-10 w-10 flex-none place-items-center rounded-[13px] border border-[var(--border)] bg-[#fffaf1] text-[var(--muted)]"
              disabled={isLoading}
              onClick={loadHealth}
              type="button"
            >
              <RefreshCw size={18} />
            </button>
          </div>

          {isLoading ? (
            <p className="rounded-[13px] border border-[var(--border)] bg-[rgba(255,250,241,0.72)] px-3.5 py-3 text-[14px] font-bold text-[var(--muted)]">
              正在读取数据状态...
            </p>
          ) : health?.storage ? (
            <div className="grid gap-2.5">
              {health.auth && !health.auth.secretConfigured ? (
                <div className="rounded-[13px] border border-[#f4d7a8] bg-[#fff0d8] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#80531b]">
                  当前还在使用本地开发登录密钥。正式部署前建议设置 AUTH_SECRET，登录会更稳也更私密。
                </div>
              ) : null}
              {health.auth?.defaultPasswordUsers?.length ? (
                <div className="rounded-[13px] border border-[#f4d7a8] bg-[#fff0d8] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#80531b]">
                  {health.auth.defaultPasswordUsers.map((user) => user.name).join("、")}还在使用默认密码 {defaultFamilyPassword}。正式试用前建议进入“我的 / 设置 / 修改密码”。
                </div>
              ) : null}
              {health.dataDirWritable === false ? (
                <div className="rounded-[13px] border border-[#f5c6bd] bg-[#fde7e2] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#9f332b]">
                  当前数据目录不可写。请检查 SUPER_FAMILY_DATA_DIR 或服务器目录权限，否则新增任务、备份和修改密码可能失败。
                </div>
              ) : null}
              {health.dataDirConfigured === false ? (
                <div className="rounded-[13px] border border-[rgba(79,157,143,0.24)] bg-[rgba(221,239,234,0.56)] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#1e655a]">
                  当前使用项目内 data 目录。自己电脑试用没问题；正式部署到会覆盖代码目录的平台时，建议设置 SUPER_FAMILY_DATA_DIR 到持久化目录。
                </div>
              ) : null}
              <StorageStatusCard label="任务数据" status={health.storage.tasks} />
              <StorageStatusCard label="账号数据" status={health.storage.users} />
              <StorageStatusCard label="小精灵数据" status={health.storage.pet} />
            </div>
          ) : (
            <p className="rounded-[13px] border border-[#f5c6bd] bg-[#fde7e2] px-3.5 py-3 text-[13px] font-bold text-[#9f332b]">
              当前账号没有数据状态权限，请用妈妈账号查看。
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[rgba(79,157,143,0.24)] bg-[rgba(221,239,234,0.5)] p-4 shadow-soft">
          <h3 className="mb-1.5 text-[16px] font-bold leading-snug">手动备份</h3>
          <p className="mb-3.5 text-[14px] leading-relaxed text-[var(--muted)]">
            改密码、清空回收站或准备部署前，可以先点一次手动备份。
          </p>
          {health?.manualBackups ? (
            <div className="mb-3 grid grid-cols-2 gap-2 rounded-[13px] border border-[rgba(79,157,143,0.18)] bg-[rgba(255,253,248,0.62)] px-3.5 py-3 text-[12px] font-bold leading-relaxed text-[var(--muted)]">
              <span>已有备份：{health.manualBackups.count} 份</span>
              <span>最近：{formatStorageTime(health.manualBackups.latestCreatedAt)}</span>
              {health.manualBackups.latestDirName ? (
                <span className="col-span-2 break-all text-[var(--faint)]">
                  {health.manualBackups.latestDirName}
                </span>
              ) : null}
              {health.manualBackups.latestCopiedFiles.length ? (
                <span className="col-span-2 text-[var(--faint)]">
                  包含：{formatBackupFileSummary(health.manualBackups.latestCopiedFiles)}
                </span>
              ) : null}
            </div>
          ) : null}
          {backupWarning ? (
            <p className="mb-3 rounded-[13px] border border-[#f4d7a8] bg-[#fff0d8] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#80531b]">
              {backupWarning}
            </p>
          ) : null}
          {backupFileWarning ? (
            <p className="mb-3 rounded-[13px] border border-[#f5c6bd] bg-[#fde7e2] px-3.5 py-3 text-[13px] font-bold leading-relaxed text-[#9f332b]">
              {backupFileWarning}
            </p>
          ) : null}
          <button
            className="h-12 w-full rounded-xl border border-transparent bg-[var(--primary)] font-bold text-white disabled:opacity-45"
            disabled={isBackingUp}
            onClick={createBackup}
            type="button"
          >
            {isBackingUp ? "备份中..." : "立即手动备份"}
          </button>
          {message ? <p className="mt-3 text-[13px] font-bold text-[#1e655a]" role="status">{message}</p> : null}
          {error ? (
            <p className="mt-3 rounded-xl border border-[#f5c6bd] bg-[#fde7e2] px-3 py-2 text-[13px] font-bold text-[#9f332b]" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StorageStatusCard({ label, status }: { label: string; status: StorageFileStatus }) {
  const stateLabel = status.readable ? "正常" : status.latestUsableSource === "fallback" ? "异常" : "可恢复";
  const stateClass = status.readable ? "text-[#1e655a]" : "text-[#9f332b]";

  return (
    <div className="rounded-[13px] border border-[var(--border)] bg-[rgba(255,250,241,0.72)] px-3.5 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <strong className="text-[15px] leading-snug">{label}</strong>
        <span className={["text-[13px] font-extrabold", stateClass].join(" ")}>{stateLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[12px] leading-relaxed text-[var(--muted)]">
        <span>自动快照：{status.snapshotCount}</span>
        <span>备份文件：{status.backupExists ? "有" : "无"}</span>
        <span className="col-span-2">更新时间：{formatStorageTime(status.updatedAt)}</span>
      </div>
    </div>
  );
}

function TrashPanel({
  currentUser,
  tasks,
  onBack,
  onClear,
  onRestore
}: {
  currentUser: FamilyUser;
  tasks: Task[];
  onBack: () => void;
  onClear: () => void;
  onRestore: (id: string) => void;
}) {
  return (
    <section className="px-4 pt-[18px]">
      <div className="mb-[18px] flex items-center gap-3">
        <button
          aria-label="返回我的页面"
          className="grid h-[42px] w-[42px] place-items-center rounded-[13px] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] shadow-soft"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[13px] text-[var(--muted)]">我的</p>
          <h2 className="text-[25px] font-extrabold leading-tight tracking-normal">回收站</h2>
        </div>
        {tasks.length ? (
          <button
            className="min-h-10 rounded-xl border border-[#f5c6bd] bg-[#fde7e2] px-3 text-[14px] font-bold text-[#9f332b] disabled:opacity-40"
            disabled={!tasks.length}
            onClick={onClear}
            type="button"
          >
            清空
          </button>
        ) : null}
      </div>

      {tasks.length ? (
        <div className="grid gap-[11px]">
          {tasks.map((task) => (
            <article className="task-card" key={task.id}>
              <h3 className="mb-1.5 text-[16px] font-bold leading-snug">{task.title}</h3>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--muted)]">
                {task.note}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="chip">负责人：{getTaskOwnerNames(task)}</span>
                <span className="chip">完成时间：{getTaskTimeRangeLabel(task)}</span>
              </div>
              <button
                className="mt-3 h-11 w-full rounded-xl border border-[var(--primary)] bg-[var(--primary-soft)] font-bold text-[#1e655a]"
                onClick={() => onRestore(task.id)}
                type="button"
              >
                恢复
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--border)] bg-[rgba(255,253,248,0.78)] p-5 text-center shadow-soft">
          <h3 className="mb-1.5 text-[16px] font-bold">这里还没有删除的任务</h3>
          <p className="text-[14px] leading-relaxed text-[var(--muted)]">
            删除的任务会先放这里，需要时可以恢复。
          </p>
        </div>
      )}
    </section>
  );
}
