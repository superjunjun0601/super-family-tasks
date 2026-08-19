import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";
import { defaultFamilyPassword } from "./auth-values.mjs";
import {
  autoSnapshotDirName,
  backupDataFileNames,
  manualBackupDirName,
  manualBackupSnapshotDirName,
  petStoreFileName,
  taskStoreFileName,
  userStoreFileName
} from "./data-files.mjs";
import { getDataDir } from "./data-dir.mjs";
import { childUserId, familyUserNamesById, familyUsers, momUserId } from "./family-users.mjs";
import { petBaseFlowers } from "./pet-values.mjs";
import { defaultReminderSettings } from "./reminder-settings.mjs";
import {
  maxCommentLength,
  maxReminderDays,
  maxRepeatWeekday,
  maxRewardStars,
  minReminderDays,
  minRepeatWeekday,
  minRewardStars
} from "./task-limits.mjs";
import {
  childStudyCategory,
  dayAfterTimeBucket,
  doneStatus,
  familyCategory,
  normalPriority,
  overdueTimeBucket,
  pastTimeBucket,
  taskCategoryValues,
  taskPriorityValues,
  taskStatusValues,
  todayTimeBucket,
  todoStatus,
  tomorrowTimeBucket,
  weekTimeBucket
} from "./task-values.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = getDataDir(ROOT_DIR);
const BACKUP_DIR = join(DATA_DIR, autoSnapshotDirName);
const MANUAL_BACKUP_DIR = join(DATA_DIR, manualBackupDirName);
const TASK_STORE = taskStoreFileName;
const USER_STORE = userStoreFileName;
const PET_STORE = petStoreFileName;
const writeMode = process.argv.includes("--write");

const usersById = new Map(familyUsers.map((user) => [user.id, user]));
const usersByName = new Map(familyUsers.map((user) => [user.name, user]));
const momUserName = familyUserNamesById[momUserId] ?? momUserId;
const validCategories = new Set(taskCategoryValues);
const validPriorities = new Set(taskPriorityValues);
const validStatuses = new Set(taskStatusValues);
const report = [];
const taskStoreSource = readJsonWithFallback(TASK_STORE);
const userStoreSource = readJsonWithFallback(USER_STORE);
const petStoreSource = readOptionalJsonWithFallback(PET_STORE);
const repairedTaskStore = repairTaskStore(taskStoreSource.value);
const repairedUserStore = repairUserStore(userStoreSource.value);
const repairedPetStore = petStoreSource
  ? repairPetStore(petStoreSource.value, repairedTaskStore.value)
  : { value: { fedFlowers: 0 }, changed: false };
const taskChanged = taskStoreSource.source !== TASK_STORE || repairedTaskStore.changed;
const userChanged = userStoreSource.source !== USER_STORE || repairedUserStore.changed;
const petChanged = Boolean(petStoreSource && (petStoreSource.source !== PET_STORE || repairedPetStore.changed));

printSummary(
  taskStoreSource,
  userStoreSource,
  petStoreSource,
  repairedTaskStore.value,
  repairedUserStore.value,
  repairedPetStore.value,
  taskChanged,
  userChanged,
  petChanged
);

if (!taskChanged && !userChanged && !petChanged) {
  console.log("\n没有发现需要修复的数据。");
  process.exit(0);
}

if (!writeMode) {
  console.log("\n这是预览模式，没有改动文件。确认要修复时运行：");
  console.log("npm run data:repair -- --write");
  process.exit(0);
}

const backupDir = createRepairBackup();
if (taskChanged) writeJsonAtomically(TASK_STORE, repairedTaskStore.value);
if (userChanged) writeJsonAtomically(USER_STORE, repairedUserStore.value);
if (petChanged) writeJsonAtomically(PET_STORE, repairedPetStore.value);

console.log(`\n已修复并写入数据，修复前备份在：${backupDir}`);

function readJsonWithFallback(fileName) {
  const candidates = [
    { name: fileName, path: join(DATA_DIR, fileName) },
    { name: `${fileName}.bak`, path: join(DATA_DIR, `${fileName}.bak`) },
    ...listSnapshots(fileName).map((snapshot) => ({
      name: snapshot.name,
      path: join(BACKUP_DIR, snapshot.name)
    }))
  ];

  const errors = [];
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    try {
      return {
        source: candidate.name,
        value: JSON.parse(readFileSync(candidate.path, "utf8")),
        errors
      };
    } catch {
      errors.push(`${candidate.name} 不是有效 JSON`);
    }
  }

  fail(`${fileName}、.bak 和自动快照都无法读取，请先检查 data/ 目录。`);
}

function readOptionalJsonWithFallback(fileName) {
  const mainPath = join(DATA_DIR, fileName);
  const backupPath = join(DATA_DIR, `${fileName}.bak`);
  const hasAnySource = existsSync(mainPath) || existsSync(backupPath) || listSnapshots(fileName).length > 0;
  return hasAnySource ? readJsonWithFallback(fileName) : null;
}

function repairTaskStore(value) {
  let changed = false;
  const seenIds = new Set();
  const nextStore = {
    tasks: [],
    trashTasks: []
  };

  if (!isRecord(value)) {
    report.push(`${TASK_STORE} 不是对象，已重建为空任务库`);
    return { value: nextStore, changed: true };
  }

  for (const key of ["tasks", "trashTasks"]) {
    const sourceTasks = Array.isArray(value[key]) ? value[key] : [];
    if (!Array.isArray(value[key])) {
      changed = true;
      report.push(`${key} 缺失或不是数组，已改为空数组`);
    }

    for (const [index, task] of sourceTasks.entries()) {
      const result = repairTask(task, `${key} #${index + 1}`, seenIds);
      if (result.task) nextStore[key].push(result.task);
      if (result.changed) changed = true;
    }
  }

  return { value: nextStore, changed };
}

function repairTask(value, label, seenIds) {
  let changed = false;
  if (!isRecord(value)) {
    report.push(`${label} 不是对象，已丢弃`);
    return { task: null, changed: true };
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title) {
    report.push(`${label} 缺少标题，已丢弃`);
    return { task: null, changed: true };
  }

  let id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : "";
  if (id !== value.id) changed = true;
  if (!id) {
    id = `repaired-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    changed = true;
    report.push(`${label} 缺少 id，已生成 ${id}`);
  }

  if (seenIds.has(id)) {
    report.push(`任务 id 重复：${id}，已保留第一条并丢弃重复项`);
    return { task: null, changed: true };
  }
  seenIds.add(id);

  const owners = repairOwners(value.owners, value.createdById, value.category);
  if (!owners.length) {
    report.push(`任务 ${id} 缺少可识别负责人，已默认给${momUserName}`);
    owners.push(usersById.get(momUserId));
    changed = true;
  }

  const category = repairCategory(value.category, owners);
  const priority = validPriorities.has(value.priority) ? value.priority : normalPriority;
  const status = validStatuses.has(value.status) ? value.status : todoStatus;
  let taskDate = repairDate(value.taskDate);
  let dueDate = repairDate(value.dueDate);
  const comments = repairComments(value.comments, value.createdById, id);
  const repeatWeekdays = repairRepeatWeekdays(value.repeatWeekdays);
  let repeatUntil = repairDate(value.repeatUntil);
  const reminderDays = repairReminderDays(value.reminderDays);
  const rewardStars = repairRewardStars(value.rewardStars, owners);
  const completedBy = status === todoStatus || value.completedBy === undefined
    ? undefined
    : repairCompletedBy(value.completedBy, value.createdById);
  const completedAt = status === todoStatus ? undefined : typeof value.completedAt === "string" ? value.completedAt : undefined;
  const rewardedBy = status === todoStatus || value.rewardedBy === undefined
    ? undefined
    : repairCompletedBy(value.rewardedBy, value.createdById);
  const rewardedAt = status === todoStatus ? undefined : typeof value.rewardedAt === "string" ? value.rewardedAt : undefined;

  if (title !== value.title) changed = true;
  if (category !== value.category) changed = true;
  if (priority !== value.priority) changed = true;
  if (status !== value.status) changed = true;
  if (taskDate !== value.taskDate) changed = true;
  if (dueDate !== value.dueDate) changed = true;
  if (!sameJson(owners, value.owners)) changed = true;
  if (!sameJson(comments, value.comments)) changed = true;
  if (!sameJson(repeatWeekdays, value.repeatWeekdays)) changed = true;
  if (repeatUntil !== value.repeatUntil) changed = true;
  if (!repeatWeekdays?.length && value.repeatUntil !== undefined) changed = true;
  if (value.repeatSeriesId !== undefined && typeof value.repeatSeriesId !== "string") changed = true;
  if (value.repeatGeneratedFromId !== undefined && typeof value.repeatGeneratedFromId !== "string") changed = true;
  if (reminderDays !== value.reminderDays) changed = true;
  if (rewardStars !== value.rewardStars) changed = true;
  if (status === todoStatus && value.completedBy !== undefined) changed = true;
  if (status !== todoStatus && value.completedBy !== undefined && !sameJson(completedBy, value.completedBy)) changed = true;
  if (completedAt !== value.completedAt) changed = true;
  if (status === todoStatus && value.rewardedBy !== undefined) changed = true;
  if (status !== todoStatus && value.rewardedBy !== undefined && !sameJson(rewardedBy, value.rewardedBy)) changed = true;
  if (rewardedAt !== value.rewardedAt) changed = true;
  if (typeof value.note !== "string") changed = true;
  if (!isKnownUserId(value.createdById)) changed = true;
  if (typeof value.taskTimeLabel !== "string" && taskDate) changed = true;
  if (typeof value.dueLabel !== "string" && dueDate) changed = true;
  if (typeof value.remindLabel !== "string" && reminderDays) changed = true;

  if (!taskDate && dueDate) {
    taskDate = dueDate;
    changed = true;
    report.push(`任务 ${id} 缺少任务日期，已用最晚完成日期补齐`);
  }
  if (!dueDate && taskDate) {
    dueDate = taskDate;
    changed = true;
    report.push(`任务 ${id} 缺少最晚完成日期，已用任务日期补齐`);
  }
  if (!taskDate && !dueDate) {
    taskDate = getTodayInputValue();
    dueDate = taskDate;
    changed = true;
    report.push(`任务 ${id} 缺少日期，已补为今天`);
  }
  if (taskDate > dueDate) {
    dueDate = taskDate;
    changed = true;
    report.push(`任务 ${id} 最晚完成日期早于任务日期，已改为任务日期`);
  }
  if (repeatUntil && repeatUntil < taskDate) {
    repeatUntil = undefined;
    changed = true;
    report.push(`任务 ${id} 重复结束日期早于任务日期，已清空重复结束日期`);
  }

  return {
    task: normalizeTaskTiming({
      id,
      title,
      note: typeof value.note === "string" ? value.note : "",
      createdById: isKnownUserId(value.createdById) ? value.createdById : owners[0].id,
      category,
      owners,
      priority,
      taskTimeLabel: typeof value.taskTimeLabel === "string" ? value.taskTimeLabel : taskDate ? formatDateLabel(taskDate) : undefined,
      taskDate,
      dueLabel: typeof value.dueLabel === "string" ? value.dueLabel : dueDate ? formatDateLabel(dueDate) : "",
      dueDate,
      remindLabel: typeof value.remindLabel === "string" ? value.remindLabel : reminderDays ? `提前 ${reminderDays} 天每天提醒` : undefined,
      reminderDays,
      repeatLabel: typeof value.repeatLabel === "string" ? value.repeatLabel : repeatWeekdays ? `每周${repeatWeekdays.join("、")}` : undefined,
      repeatWeekdays,
      repeatUntil: repeatWeekdays?.length ? repeatUntil : undefined,
      repeatSeriesId: typeof value.repeatSeriesId === "string" ? value.repeatSeriesId : undefined,
      repeatGeneratedFromId: typeof value.repeatGeneratedFromId === "string" ? value.repeatGeneratedFromId : undefined,
      rewardStars,
      status,
      completedBy: status === todoStatus ? undefined : completedBy,
      completedAt: status === todoStatus ? undefined : completedAt,
      rewardedBy: status === todoStatus ? undefined : rewardedBy,
      rewardedAt: status === todoStatus ? undefined : rewardedAt,
      comments
    }),
    changed
  };
}

function repairUserStore(value) {
  let changed = false;
  const passwordHashes = {};
  const reminderSettings = {};
  const candidateHashes = isRecord(value) && isRecord(value.passwordHashes) ? value.passwordHashes : {};
  const legacyPasswords = isRecord(value) && isRecord(value.passwords) ? value.passwords : {};
  const candidateReminderSettings =
    isRecord(value) && isRecord(value.reminderSettings) ? value.reminderSettings : {};

  if (!isRecord(value)) {
    changed = true;
    report.push(`${USER_STORE} 不是对象，已重建密码库`);
  }

  for (const user of familyUsers) {
    const hash = candidateHashes[user.id];
    const legacyPassword = legacyPasswords[user.id];

    if (typeof hash === "string" && hash.startsWith("$2")) {
      passwordHashes[user.id] = hash;
      continue;
    }

    if (typeof hash === "string" && hash.trim() && hash.length <= 64) {
      passwordHashes[user.id] = hashSync(hash, 10);
      changed = true;
      report.push(`${user.name} 的 passwordHashes 像是明文密码，已转成 bcrypt 哈希`);
      continue;
    }

    if (typeof legacyPassword === "string" && legacyPassword.trim() && legacyPassword.length <= 64) {
      passwordHashes[user.id] = hashSync(legacyPassword, 10);
      changed = true;
      report.push(`${user.name} 的旧 passwords 字段已迁移为 bcrypt 哈希`);
      continue;
    }

    passwordHashes[user.id] = hashSync(defaultFamilyPassword, 10);
    changed = true;
    report.push(`${user.name} 缺少密码哈希，已补为默认密码 ${defaultFamilyPassword}`);
  }

  for (const user of familyUsers) {
    const repairedSettings = repairReminderSettings(candidateReminderSettings[user.id]);
    reminderSettings[user.id] = repairedSettings;
    if (!sameJson(repairedSettings, candidateReminderSettings[user.id])) changed = true;
  }

  if (!isRecord(value?.passwordHashes) || Object.keys(value.passwordHashes).length !== familyUsers.length) {
    changed = true;
  }
  if (!isRecord(value?.reminderSettings) || Object.keys(value.reminderSettings).length !== familyUsers.length) {
    changed = true;
  }

  return { value: { passwordHashes, reminderSettings }, changed };
}

function repairReminderSettings(value) {
  if (!isRecord(value)) return defaultReminderSettings;
  return {
    dailyDigestEnabled:
      typeof value.dailyDigestEnabled === "boolean"
        ? value.dailyDigestEnabled
        : defaultReminderSettings.dailyDigestEnabled,
    overdueRemindersEnabled:
      typeof value.overdueRemindersEnabled === "boolean"
        ? value.overdueRemindersEnabled
        : defaultReminderSettings.overdueRemindersEnabled,
    rewardRemindersEnabled:
      typeof value.rewardRemindersEnabled === "boolean"
        ? value.rewardRemindersEnabled
        : defaultReminderSettings.rewardRemindersEnabled,
    siteRemindersEnabled:
      typeof value.siteRemindersEnabled === "boolean"
        ? value.siteRemindersEnabled
        : defaultReminderSettings.siteRemindersEnabled
  };
}

function repairPetStore(value, taskStore) {
  if (!isRecord(value)) {
    report.push(`${PET_STORE} 不是对象，已重建小精灵喂养数据`);
    return { value: { fedFlowers: 0 }, changed: true };
  }

  const rawFedFlowers = Number.isInteger(value.fedFlowers) && value.fedFlowers >= 0 ? value.fedFlowers : 0;
  const maxFedFlowers = getMaxFedFlowers(taskStore);
  const fedFlowers = Math.min(rawFedFlowers, maxFedFlowers);
  const updatedAt = typeof value.updatedAt === "string" ? value.updatedAt : undefined;
  if (rawFedFlowers > maxFedFlowers) {
    report.push(`${PET_STORE} 已喂养小红花超过可获得上限，已从 ${rawFedFlowers} 调整为 ${fedFlowers}`);
  }
  return {
    value: {
      fedFlowers,
      updatedAt
    },
    changed: fedFlowers !== value.fedFlowers || updatedAt !== value.updatedAt
  };
}

function getMaxFedFlowers(value) {
  const tasks = Array.isArray(value?.tasks) ? value.tasks : [];
  const earnedFlowers = tasks.reduce((total, task) => {
    if (!isRecord(task)) return total;
    const ownerIds = Array.isArray(task.owners) ? task.owners.map((owner) => owner?.id) : [];
    const isChildTask = task.category === childStudyCategory || ownerIds.includes(childUserId);
    if (!isChildTask || task.status !== doneStatus) return total;
    return total + (Number.isInteger(task.rewardStars) && task.rewardStars > 0 ? task.rewardStars : 0);
  }, 0);
  return petBaseFlowers + earnedFlowers;
}

function repairOwners(value, createdById, category) {
  const owners = [];
  const seen = new Set();
  const pushUser = (user) => {
    if (!user || seen.has(user.id)) return;
    owners.push(user);
    seen.add(user.id);
  };

  if (Array.isArray(value)) {
    for (const owner of value) {
      if (typeof owner === "string") pushUser(usersById.get(owner));
      if (isRecord(owner)) {
        pushUser(usersById.get(owner.id));
        pushUser(usersByName.get(owner.name));
      }
    }
  }

  if (!owners.length && isKnownUserId(createdById)) pushUser(usersById.get(createdById));
  if (!owners.length && category === childStudyCategory) pushUser(usersById.get(childUserId));
  return owners;
}

function repairComments(value, createdById, taskId) {
  if (!Array.isArray(value)) return undefined;

  const comments = [];
  for (const [index, comment] of value.entries()) {
    if (!isRecord(comment) || typeof comment.content !== "string") {
      report.push(`任务 ${taskId} 评论 #${index + 1} 结构异常，已丢弃`);
      continue;
    }

    const content = comment.content.trim().slice(0, maxCommentLength);
    if (!content) {
      report.push(`任务 ${taskId} 评论 #${index + 1} 内容为空，已丢弃`);
      continue;
    }

    comments.push({
      id: typeof comment.id === "string" && comment.id ? comment.id : `repaired-comment-${Date.now()}-${index}`,
      author: repairCommentAuthor(comment.author, createdById),
      content,
      createdAt: typeof comment.createdAt === "string" && !Number.isNaN(new Date(comment.createdAt).getTime())
        ? comment.createdAt
        : undefined,
      createdAtLabel: typeof comment.createdAtLabel === "string" && comment.createdAtLabel ? comment.createdAtLabel : "刚刚"
    });

    if (comment.content.length > maxCommentLength) {
      report.push(`任务 ${taskId} 评论 #${index + 1} 超过 ${maxCommentLength} 字，已裁短`);
    }
  }

  return comments.length ? comments : undefined;
}

function repairCommentAuthor(author, createdById) {
  if (isRecord(author)) {
    const user = usersById.get(author.id) ?? usersByName.get(author.name);
    if (user) return user;
  }
  return usersById.get(createdById) ?? usersById.get(momUserId);
}

function repairCompletedBy(completedBy, createdById) {
  if (isRecord(completedBy)) {
    const user = usersById.get(completedBy.id) ?? usersByName.get(completedBy.name);
    if (user) return user;
  }
  return usersById.get(createdById);
}

function repairCategory(value, owners) {
  if (validCategories.has(value)) return value;
  return owners.some((owner) => owner.id === childUserId) ? childStudyCategory : familyCategory;
}

function repairDate(value) {
  return typeof value === "string" && isDateString(value) ? value : undefined;
}

function repairReminderDays(value) {
  return Number.isInteger(value) && value > minReminderDays && value <= maxReminderDays ? value : undefined;
}

function repairRepeatWeekdays(value) {
  if (!Array.isArray(value)) return undefined;
  const days = [...new Set(value.filter((day) => Number.isInteger(day) && day >= minRepeatWeekday && day <= maxRepeatWeekday))].sort((a, b) => a - b);
  return days.length ? days : undefined;
}

function repairRewardStars(value, owners) {
  const hasChildOwner = owners.some((owner) => owner.id === childUserId);
  if (!hasChildOwner) return undefined;
  return Number.isInteger(value) && value >= minRewardStars ? Math.min(value, maxRewardStars) : undefined;
}

function normalizeTaskTiming(task) {
  const timeBucket = getTaskTimeBucket(task);
  return {
    ...task,
    overdue: timeBucket === overdueTimeBucket,
    timeBucket
  };
}

function getTaskTimeBucket(task) {
  const referenceDate = parseTaskDate(task.dueDate || task.taskDate);
  if (!referenceDate) return task.timeBucket ?? todayTimeBucket;

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayDiff = Math.round((referenceDate.getTime() - todayStart.getTime()) / 86400000);
  if (dayDiff < 0) return task.status === doneStatus ? pastTimeBucket : overdueTimeBucket;
  if (dayDiff === 0) return todayTimeBucket;
  if (dayDiff === 1) return tomorrowTimeBucket;
  if (dayDiff === 2) return dayAfterTimeBucket;
  if (dayDiff <= 6) return weekTimeBucket;
  return task.timeBucket ?? weekTimeBucket;
}

function parseTaskDate(date) {
  if (!date) return null;
  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function formatDateLabel(date) {
  const parsedDate = parseTaskDate(date);
  if (!parsedDate) return date;
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日 周${weekdays[parsedDate.getDay()]}`;
}

function getTodayInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

function isDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );
}

function isKnownUserId(value) {
  return typeof value === "string" && usersById.has(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

function sameJson(first, second) {
  return JSON.stringify(first ?? null) === JSON.stringify(second ?? null);
}

function listSnapshots(fileName) {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(`-${fileName}`))
    .map((name) => ({
      mtime: statSync(join(BACKUP_DIR, name)).mtime,
      name
    }))
    .sort((first, second) => second.mtime.getTime() - first.mtime.getTime());
}

function createRepairBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const targetDir = createUniqueBackupDir(`${timestamp}-before-repair`);

  for (const fileName of backupDataFileNames) {
    const sourcePath = join(DATA_DIR, fileName);
    if (existsSync(sourcePath)) copyFileDurably(sourcePath, join(targetDir, basename(fileName)));
  }

  if (existsSync(BACKUP_DIR)) {
    const targetSnapshotDir = join(targetDir, manualBackupSnapshotDirName);
    mkdirSync(targetSnapshotDir, { recursive: true });
    for (const fileName of readdirSync(BACKUP_DIR)) {
      const sourcePath = join(BACKUP_DIR, fileName);
      if (!statSync(sourcePath).isFile()) continue;
      copyFileDurably(sourcePath, join(targetSnapshotDir, fileName));
    }
  }

  writeTextDurably(
    join(targetDir, "README.txt"),
    [
      "超人家族任务清单修复前备份",
      `备份时间：${new Date().toISOString()}`,
      "",
      "这份备份由 npm run data:repair -- --write 自动生成。"
    ].join("\n")
  );
  syncDirectoryBestEffort(targetDir);

  return targetDir;
}

function createUniqueBackupDir(baseDirName) {
  mkdirSync(MANUAL_BACKUP_DIR, { recursive: true });
  for (let index = 1; index <= 1000; index += 1) {
    const dirName = index === 1 ? baseDirName : `${baseDirName}-${index}`;
    const targetDir = join(MANUAL_BACKUP_DIR, dirName);
    try {
      mkdirSync(targetDir);
      return targetDir;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("无法创建唯一修复前备份目录");
}

function copyFileDurably(sourcePath, targetPath) {
  copyFileSync(sourcePath, targetPath);
  fsyncFile(targetPath);
  syncDirectoryBestEffort(dirname(targetPath));
}

function writeTextDurably(filePath, content) {
  const fd = openSync(filePath, "w");
  try {
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectoryBestEffort(dirname(filePath));
}

function fsyncFile(filePath) {
  const fd = openSync(filePath, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function writeJsonAtomically(fileName, value) {
  const targetPath = join(DATA_DIR, fileName);
  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(tempPath, "w");
    try {
      writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, targetPath);
    syncDirectoryBestEffort(dirname(targetPath));
  } finally {
    rmSync(tempPath, { force: true });
  }
}

function syncDirectoryBestEffort(dirPath) {
  try {
    const fd = openSync(dirPath, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Some filesystems do not support fsync on directories.
  }
}

function printSummary(taskSource, userSource, petSource, taskStore, userStore, petStore, taskChanged, userChanged, petChanged) {
  console.log("超人家族任务清单数据修复");
  console.log(`- 模式：${writeMode ? "写入修复" : "预览 dry-run"}`);
  console.log(`- 任务数据来源：${taskSource.source}`);
  console.log(`- 密码数据来源：${userSource.source}`);
  console.log(`- 小精灵数据来源：${petSource?.source ?? "未创建"}`);
  console.log(`- 任务：${taskStore.tasks.length}`);
  console.log(`- 回收站：${taskStore.trashTasks.length}`);
  console.log(`- 密码账号：${Object.keys(userStore.passwordHashes).length}`);
  console.log(`- 小精灵已喂养：${petStore.fedFlowers}`);
  console.log(`- 任务数据需要写入：${taskChanged ? "是" : "否"}`);
  console.log(`- 密码数据需要写入：${userChanged ? "是" : "否"}`);
  console.log(`- 小精灵数据需要写入：${petChanged ? "是" : "否"}`);

  const errors = [...taskSource.errors, ...userSource.errors, ...(petSource?.errors ?? [])];
  if (errors.length) {
    console.log("\n读取时跳过的问题文件：");
    for (const error of errors) console.log(`- ${error}`);
  }

  if (report.length) {
    console.log("\n修复项：");
    for (const item of report) console.log(`- ${item}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
