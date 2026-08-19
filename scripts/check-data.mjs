import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSync } from "bcryptjs";
import { defaultFamilyPassword } from "./auth-values.mjs";
import {
  autoSnapshotDirName,
  criticalDataFileNames,
  manualBackupDirName,
  petStoreFileName,
  taskStoreFileName,
  userStoreFileName
} from "./data-files.mjs";
import { manualBackupStaleDays, manualBackupWarningCount } from "./data-safety-values.mjs";
import { getDataDir } from "./data-dir.mjs";
import { childUserId, familyUserIds, familyUserNamesById } from "./family-users.mjs";
import { petBaseFlowers } from "./pet-values.mjs";
import { reminderSettingKeys } from "./reminder-settings.mjs";
import {
  maxCommentLength,
  maxReminderDays,
  maxRepeatWeekday,
  maxRewardStars,
  minReminderDays,
  minRepeatWeekday,
  minRewardStars
} from "./task-limits.mjs";
import { childStudyCategory, doneStatus, taskCategoryValues, taskPriorityValues, taskStatusValues } from "./task-values.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = getDataDir(ROOT_DIR);
const BACKUP_DIR = join(DATA_DIR, autoSnapshotDirName);
const childUserName = familyUserNamesById[childUserId] ?? childUserId;
const validCategories = new Set(taskCategoryValues);
const validPriorities = new Set(taskPriorityValues);
const validStatuses = new Set(taskStatusValues);
const problems = [];
const warnings = [];

const taskStore = readJson(taskStoreFileName);
const userStore = readJson(userStoreFileName);
const petStore = readOptionalJson(petStoreFileName);

if (taskStore) {
  checkTaskStore(taskStore);
}

if (userStore) {
  checkUserStore(userStore);
}

if (petStore) {
  checkPetStore(petStore);
}

checkManualBackupFreshness();
printSummary();

if (warnings.length) {
  console.log("\n提醒：");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (problems.length) {
  console.error("\n发现问题：");
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log("\n数据自检通过。");

function readJson(fileName) {
  const filePath = join(DATA_DIR, fileName);
  if (!existsSync(filePath)) {
    problems.push(`${fileName} 不存在`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    problems.push(`${fileName} 不是有效 JSON`);
    return null;
  }
}

function readOptionalJson(fileName) {
  const filePath = join(DATA_DIR, fileName);
  if (!existsSync(filePath)) return null;

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    problems.push(`${fileName} 不是有效 JSON`);
    return null;
  }
}

function checkTaskStore(value) {
  if (!value || typeof value !== "object") {
    problems.push(`${taskStoreFileName} 不是对象`);
    return;
  }

  if (!Array.isArray(value.tasks)) {
    problems.push(`${taskStoreFileName} 缺少 tasks 数组`);
  }

  if (!Array.isArray(value.trashTasks)) {
    problems.push(`${taskStoreFileName} 缺少 trashTasks 数组`);
  }

  const taskIds = new Set();
  for (const [index, task] of [...(value.tasks ?? []), ...(value.trashTasks ?? [])].entries()) {
    if (!task || typeof task !== "object") {
      problems.push(`任务 #${index + 1} 不是对象`);
      continue;
    }
    if (!task.id || typeof task.id !== "string") problems.push(`任务 #${index + 1} 缺少 id`);
    if (typeof task.id === "string" && taskIds.has(task.id)) problems.push(`任务 id 重复：${task.id}`);
    if (typeof task.id === "string") taskIds.add(task.id);
    if (!task.title || typeof task.title !== "string") problems.push(`任务 ${task.id ?? `#${index + 1}`} 缺少标题`);
    if (!familyUserIds.includes(task.createdById)) problems.push(`任务 ${task.id ?? `#${index + 1}`} 创建人异常`);
    if (!validCategories.has(task.category)) problems.push(`任务 ${task.id ?? `#${index + 1}`} 分类异常`);
    if (!validPriorities.has(task.priority)) problems.push(`任务 ${task.id ?? `#${index + 1}`} 优先级异常`);
    if (!validStatuses.has(task.status)) problems.push(`任务 ${task.id ?? `#${index + 1}`} 状态异常`);
    if (task.completedAt !== undefined && typeof task.completedAt !== "string") problems.push(`任务 ${task.id ?? `#${index + 1}`} 完成时间异常`);
    if (task.completedBy !== undefined) {
      if (!task.completedBy || typeof task.completedBy !== "object" || !familyUserIds.includes(task.completedBy.id)) {
        problems.push(`任务 ${task.id ?? `#${index + 1}`} 完成人异常`);
      }
    }
    if (task.rewardedAt !== undefined && typeof task.rewardedAt !== "string") problems.push(`任务 ${task.id ?? `#${index + 1}`} 小红花发放时间异常`);
    if (task.rewardedBy !== undefined) {
      if (!task.rewardedBy || typeof task.rewardedBy !== "object" || !familyUserIds.includes(task.rewardedBy.id)) {
        problems.push(`任务 ${task.id ?? `#${index + 1}`} 小红花发放人异常`);
      }
    }
    if (!task.taskDate || typeof task.taskDate !== "string") {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 缺少任务日期`);
    } else if (!isDateString(task.taskDate)) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 任务日期格式异常`);
    }
    if (!task.dueDate || typeof task.dueDate !== "string") {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 缺少最晚完成日期`);
    } else if (!isDateString(task.dueDate)) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 最晚完成日期格式异常`);
    }
    if (isDateString(task.taskDate) && isDateString(task.dueDate) && task.taskDate > task.dueDate) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 最晚完成日期早于任务日期`);
    }
    if (task.reminderDays !== undefined) {
      if (!Number.isInteger(task.reminderDays) || task.reminderDays < minReminderDays || task.reminderDays > maxReminderDays) {
        problems.push(`任务 ${task.id ?? `#${index + 1}`} 提醒天数异常`);
      }
    }
    if (typeof task.repeatUntil === "string" && !isDateString(task.repeatUntil)) problems.push(`任务 ${task.id ?? `#${index + 1}`} 重复结束日期格式异常`);
    if (isDateString(task.repeatUntil) && isDateString(task.taskDate) && task.repeatUntil < task.taskDate) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 重复结束日期早于任务日期`);
    }
    if (task.repeatWeekdays !== undefined && !Array.isArray(task.repeatWeekdays)) problems.push(`任务 ${task.id ?? `#${index + 1}`} 重复规则异常`);
    if (Array.isArray(task.repeatWeekdays)) {
      for (const weekday of task.repeatWeekdays) {
        if (!Number.isInteger(weekday) || weekday < minRepeatWeekday || weekday > maxRepeatWeekday) problems.push(`任务 ${task.id ?? `#${index + 1}`} 重复星期异常`);
      }
    }
    if (task.repeatSeriesId !== undefined && typeof task.repeatSeriesId !== "string") problems.push(`任务 ${task.id ?? `#${index + 1}`} 重复系列异常`);
    if (task.repeatGeneratedFromId !== undefined && typeof task.repeatGeneratedFromId !== "string") problems.push(`任务 ${task.id ?? `#${index + 1}`} 重复来源异常`);
    if (!Array.isArray(task.owners) || !task.owners.length) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 缺少负责人`);
    } else {
      for (const owner of task.owners) {
        if (!owner || typeof owner !== "object" || !familyUserIds.includes(owner.id)) {
          problems.push(`任务 ${task.id ?? `#${index + 1}`} 负责人异常`);
        }
      }
    }
    const ownerIds = Array.isArray(task.owners) ? task.owners.map((owner) => owner?.id) : [];
    if (ownerIds.includes(childUserId) && task.category !== childStudyCategory) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 有${childUserName}负责人但分类不是${childUserName}学习`);
    }
    if (task.category === childStudyCategory && !ownerIds.includes(childUserId)) {
      problems.push(`任务 ${task.id ?? `#${index + 1}`} 是${childUserName}学习但负责人没有${childUserName}`);
    }
    if (task.rewardStars !== undefined) {
      if (!Number.isInteger(task.rewardStars) || task.rewardStars < minRewardStars || task.rewardStars > maxRewardStars) {
        problems.push(`任务 ${task.id ?? `#${index + 1}`} 小红花数量异常`);
      }
      if (!ownerIds.includes(childUserId)) {
        problems.push(`任务 ${task.id ?? `#${index + 1}`} 没有${childUserName}负责人但设置了小红花`);
      }
    }
    if (Array.isArray(task.comments)) {
      for (const comment of task.comments) {
        if (!comment || typeof comment !== "object" || typeof comment.content !== "string") {
          problems.push(`任务 ${task.id ?? `#${index + 1}`} 评论结构异常`);
        } else if (comment.content.length > maxCommentLength) {
          problems.push(`任务 ${task.id ?? `#${index + 1}`} 评论超过 ${maxCommentLength} 字`);
        } else if (comment.createdAt !== undefined && Number.isNaN(new Date(comment.createdAt).getTime())) {
          problems.push(`任务 ${task.id ?? `#${index + 1}`} 评论时间异常`);
        }
      }
    }
  }
}

function checkUserStore(value) {
  if (!value || typeof value !== "object") {
    problems.push(`${userStoreFileName} 不是对象`);
    return;
  }

  if (!value.passwordHashes || typeof value.passwordHashes !== "object") {
    problems.push(`${userStoreFileName} 缺少 passwordHashes`);
    return;
  }

  for (const userId of familyUserIds) {
    const passwordHash = value.passwordHashes[userId];
    if (typeof passwordHash !== "string") {
      problems.push(`${userId} 缺少密码哈希`);
    } else if (!passwordHash) {
      problems.push(`${userId} 密码哈希为空`);
    } else if (passwordHash && !passwordHash.startsWith("$2")) {
      problems.push(`${userId} 密码不像 bcrypt 哈希`);
    } else if (isDefaultPasswordHash(passwordHash)) {
      warnings.push(`${familyUserNamesById[userId] ?? userId}还在使用默认密码 ${defaultFamilyPassword}，正式试用前建议进入“我的 / 设置 / 修改密码”。`);
    }
  }

  if (value.reminderSettings !== undefined) {
    if (!value.reminderSettings || typeof value.reminderSettings !== "object") {
      problems.push(`${userStoreFileName} reminderSettings 异常`);
      return;
    }

    for (const userId of familyUserIds) {
      const settings = value.reminderSettings[userId];
      if (!settings || typeof settings !== "object") {
        problems.push(`${userId} 缺少提醒设置`);
        continue;
      }
      for (const key of reminderSettingKeys) {
        if (typeof settings[key] !== "boolean") problems.push(`${userId} 提醒设置 ${key} 异常`);
      }
    }
  }
}

function checkPetStore(value) {
  if (!value || typeof value !== "object") {
    problems.push(`${petStoreFileName} 不是对象`);
    return;
  }

  if (!Number.isInteger(value.fedFlowers) || value.fedFlowers < 0) {
    problems.push(`${petStoreFileName} fedFlowers 异常`);
  } else if (taskStore) {
    const maxFedFlowers = getMaxFedFlowers(taskStore);
    if (value.fedFlowers > maxFedFlowers) {
      problems.push(`${petStoreFileName} 已喂养小红花 ${value.fedFlowers} 朵，超过当前可获得上限 ${maxFedFlowers} 朵`);
    }
  }

  if (value.updatedAt !== undefined && typeof value.updatedAt !== "string") {
    problems.push(`${petStoreFileName} updatedAt 异常`);
  }
}

function getMaxFedFlowers(value) {
  const tasks = Array.isArray(value?.tasks) ? value.tasks : [];
  const earnedFlowers = tasks.reduce((total, task) => {
    if (!task || typeof task !== "object") return total;
    const ownerIds = Array.isArray(task.owners) ? task.owners.map((owner) => owner?.id) : [];
    const isChildTask = task.category === childStudyCategory || ownerIds.includes(childUserId);
    if (!isChildTask || task.status !== doneStatus) return total;
    return total + (Number.isInteger(task.rewardStars) && task.rewardStars > 0 ? task.rewardStars : 0);
  }, 0);
  return petBaseFlowers + earnedFlowers;
}

function isDefaultPasswordHash(passwordHash) {
  try {
    return compareSync(defaultFamilyPassword, passwordHash);
  } catch {
    return false;
  }
}

function checkManualBackupFreshness() {
  const manualBackupStatus = getManualBackupStatus();
  if (manualBackupStatus.count <= 0) {
    warnings.push("还没有手动备份。正式试用、改密码或清空回收站前，建议先运行 npm run data:backup。");
    return;
  }

  if (manualBackupStatus.count >= manualBackupWarningCount) {
    warnings.push(`手动备份已经有 ${manualBackupStatus.count} 份。建议找时间把很久以前的备份移到电脑硬盘或网盘，应用不会自动删除。`);
  }

  if (!manualBackupStatus.latestMtime) return;
  const missingBackupFiles = criticalDataFileNames.filter((fileName) => !manualBackupStatus.latestFiles.includes(fileName));
  if (missingBackupFiles.length) {
    warnings.push(`最近一次手动备份缺少关键数据文件：${missingBackupFiles.join(", ")}，建议重新运行 npm run data:backup。`);
  }

  const backupAgeDays = Math.floor((Date.now() - manualBackupStatus.latestMtime.getTime()) / 86400000);
  if (backupAgeDays >= manualBackupStaleDays) {
    warnings.push(`最近一次手动备份已经是 ${backupAgeDays} 天前，建议今天运行 npm run data:backup 补一次。`);
  }
}

function getManualBackupStatus() {
  const manualBackupDir = join(DATA_DIR, manualBackupDirName);
  if (!existsSync(manualBackupDir)) return { count: 0, latestFiles: [], latestMtime: null };
  const backups = readdirSync(manualBackupDir)
    .map((name) => {
      const backupPath = join(manualBackupDir, name);
      const stats = statSync(backupPath);
      return stats.isDirectory()
        ? {
            files: readdirSync(backupPath).filter((fileName) => criticalDataFileNames.includes(fileName)),
            mtime: stats.mtime
          }
        : null;
    })
    .filter(Boolean)
    .sort((first, second) => second.mtime.getTime() - first.mtime.getTime());
  return { count: backups.length, latestFiles: backups[0]?.files ?? [], latestMtime: backups[0]?.mtime ?? null };
}

function printSummary() {
  const taskCount = Array.isArray(taskStore?.tasks) ? taskStore.tasks.length : 0;
  const trashCount = Array.isArray(taskStore?.trashTasks) ? taskStore.trashTasks.length : 0;
  const fedFlowers = Number.isInteger(petStore?.fedFlowers) ? petStore.fedFlowers : 0;
  const snapshotCount = existsSync(BACKUP_DIR) ? readdirSync(BACKUP_DIR).length : 0;
  const manualBackupCount = getManualBackupStatus().count;

  console.log("超人家族任务清单数据自检");
  console.log(`- 任务：${taskCount}`);
  console.log(`- 回收站：${trashCount}`);
  console.log(`- 小精灵已喂养：${fedFlowers} 朵`);
  console.log(`- 自动快照：${snapshotCount}`);
  console.log(`- 手动备份：${manualBackupCount}`);
  console.log(`- task-store 更新时间：${formatMtime(taskStoreFileName)}`);
  console.log(`- user-store 更新时间：${formatMtime(userStoreFileName)}`);
  console.log(`- pet-store 更新时间：${formatMtime(petStoreFileName)}`);
}

function formatMtime(fileName) {
  const filePath = join(DATA_DIR, fileName);
  return existsSync(filePath) ? statSync(filePath).mtime.toISOString() : "不存在";
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
