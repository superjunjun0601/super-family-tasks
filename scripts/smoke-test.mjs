import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { compareSync, hashSync } from "bcryptjs";
import {
  authChangePasswordApiPath,
  authLoginApiPath,
  authLogoutApiPath,
  backupsApiPath,
  eventsApiPath,
  healthApiPath,
  petApiPath,
  petFeedApiPath,
  remindersApiPath,
  settingsApiPath,
  taskApiPath,
  taskCommentsApiPath,
  taskCompleteApiPath,
  taskConfirmRewardApiPath,
  taskRestoreApiPath,
  taskUncompleteApiPath,
  tasksApiPath,
  trashApiPath
} from "./api-paths.mjs";
import { authCookieName, defaultFamilyPassword, maxFailedLoginAttempts } from "./auth-values.mjs";
import {
  autoSnapshotDirName,
  manualBackupDirName,
  petStoreFileName,
  taskStoreFileName,
  userStoreFileName
} from "./data-files.mjs";
import { childUserId, dadUserId, familyUsers, momUserId } from "./family-users.mjs";
import {
  cacheControlHeaderName,
  contentTypeHeaderName,
  jsonContentType,
  noStoreCacheControlDirective,
  retryAfterHeaderName
} from "./http-headers.mjs";
import {
  childStudyCategory,
  doneStatus,
  familyCategory,
  importantPriority,
  normalPriority,
  pendingRewardStatus,
  personalCategory,
  todoStatus
} from "./task-values.mjs";
import {
  dailyDigestEnabledKey,
  overdueRemindersEnabledKey,
  rewardRemindersEnabledKey,
  siteRemindersEnabledKey
} from "./reminder-settings.mjs";
import { connectedStreamEventType } from "./server-event-stream.mjs";
import { dueSoonReminderType, rewardPendingReminderType } from "./reminder-types.mjs";
import { npmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMP_DATA_DIR = mkdtempSync(join(tmpdir(), "super-family-smoke-"));
const TEMP_DIST_DIR_NAME = ".next-smoke";
const TEMP_DIST_DIR = join(ROOT_DIR, TEMP_DIST_DIR_NAME);
const TSCONFIG_PATH = join(ROOT_DIR, "tsconfig.json");
const NEXT_ENV_PATH = join(ROOT_DIR, "next-env.d.ts");
const originalTsconfig = existsSync(TSCONFIG_PATH) ? readFileSync(TSCONFIG_PATH, "utf8") : "";
const originalNextEnv = existsSync(NEXT_ENV_PATH) ? readFileSync(NEXT_ENV_PATH, "utf8") : "";
const momUser = getFamilyUser(momUserId);
const childUser = getFamilyUser(childUserId);
let devServer;
let keepTempData = false;
let cleanupStarted = false;

installSignalHandlers();

main().catch((error) => {
  keepTempData = true;
  console.error("\n冒烟测试失败：");
  console.error(error instanceof Error ? error.message : error);
  console.error(`临时数据目录已保留：${TEMP_DATA_DIR}`);
  console.error(`临时 Next 缓存目录已保留：${TEMP_DIST_DIR}`);
  process.exitCode = 1;
}).finally(async () => {
  await cleanupArtifacts();
});

async function main() {
  assertManualBackupRestoreScript();
  assertDataRepairDateRepairScript();

  const port = await findAvailablePort(3130);
  const baseUrl = `http://localhost:${port}`;

  console.log("超人家族任务清单冒烟测试");
  console.log(`- 临时数据目录：${TEMP_DATA_DIR}`);
  console.log(`- 临时 Next 缓存：${TEMP_DIST_DIR}`);
  console.log(`- 临时预览地址：${baseUrl}`);

  rmSync(TEMP_DIST_DIR, { force: true, recursive: true });

  devServer = spawn(npmCommand, ["run", "dev", "--", "-p", String(port)], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      NEXT_DIST_DIR: TEMP_DIST_DIR_NAME,
      SUPER_FAMILY_DATA_DIR: TEMP_DATA_DIR
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  devServer.stdout.on("data", (chunk) => process.stdout.write(chunk));
  devServer.stderr.on("data", (chunk) => process.stderr.write(chunk));

  await waitForServer(baseUrl);
  const publicHealth = await request(baseUrl, healthApiPath);
  assert(publicHealth.body.ok === true, "未登录健康接口异常");
  assert(!("dataDir" in publicHealth.body), "未登录健康接口不应暴露数据目录");
  assert(!("storage" in publicHealth.body), "未登录健康接口不应暴露存储状态");
  assertNoStoreHeader(publicHealth.headers, "未登录健康接口");

  const login = await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: momUserId },
    method: "POST"
  });
  assert(login.body.user?.id === momUserId, "妈妈登录失败");
  let cookie = login.cookie;
  assert(cookie, "登录没有返回 cookie");
  assertAuthSetCookie(login.headers, "登录");

  const initialTasks = await request(baseUrl, tasksApiPath, { cookie });
  assert(Array.isArray(initialTasks.body.tasks), "任务列表返回异常");
  assertNoStoreHeader(initialTasks.headers, "任务列表接口");
  await assertEventStreamUnauthorized(baseUrl);
  await assertEventStreamConnected(baseUrl, cookie);

  const today = getTodayInputValue();
  const todayLabel = formatDateLabel(today);
  const tomorrow = addDaysInputValue(today, 1);
  const tomorrowLabel = formatDateLabel(tomorrow);
  const tomorrowWeekday = getWeekdayValue(tomorrow);

  await assertExternalTaskStoreReload(baseUrl, cookie, today, todayLabel);

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "x".repeat(70 * 1024),
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试超大请求体"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "标题为空应该失败。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "   "
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: "2026-99-99",
      dueLabel: "不存在的日期",
      note: "日期格式像 YYYY-MM-DD，但真实日历不存在，应该失败。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试非法日历日期"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "负责人为空应该失败。",
      ownerIds: [],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试非法负责人"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "缺少任务日期应该失败。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskTimeLabel: todayLabel,
      title: "冒烟测试缺少任务日期"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "任务时间晚于最晚完成时间应该失败。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: tomorrow,
      taskTimeLabel: tomorrowLabel,
      title: "冒烟测试非法日期范围"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "重复结束日期早于任务日期应该失败。",
      ownerIds: [momUserId],
      priority: normalPriority,
      repeatLabel: `每周${tomorrowLabel.split(" ")[1]}`,
      repeatUntil: today,
      repeatWeekdays: [tomorrowWeekday],
      taskDate: tomorrow,
      taskTimeLabel: tomorrowLabel,
      title: "冒烟测试非法重复结束日期"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: tomorrow,
      dueLabel: tomorrowLabel,
      note: "重复结束日期格式像 YYYY-MM-DD，但真实日历不存在，应该失败。",
      ownerIds: [momUserId],
      priority: normalPriority,
      repeatLabel: `每周${tomorrowLabel.split(" ")[1]}`,
      repeatUntil: "2026-02-31",
      repeatWeekdays: [tomorrowWeekday],
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试非法重复日历日期"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  const adultRewardTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "成人任务即使误传小红花也应该被后端忽略。",
      ownerIds: [momUserId],
      priority: normalPriority,
      rewardStars: 5,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试成人任务误传小红花"
    },
    cookie,
    method: "POST"
  });
  assert(adultRewardTask.body.task?.rewardStars === undefined, "成人任务不应该保存小红花奖励");

  const adultTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "冒烟测试创建，成功后会随临时目录删除。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试家庭任务"
    },
    cookie,
    method: "POST"
  });
  const adultTaskId = adultTask.body.task?.id;
  assert(adultTask.body.task?.status === todoStatus, "家庭任务创建失败");
  assert(adultTaskId, "家庭任务没有返回 id");

  await request(baseUrl, taskCommentsApiPath(adultTaskId), {
    body: { content: "   " },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });

  const adultComment = await request(baseUrl, taskCommentsApiPath(adultTaskId), {
    body: { content: "妈妈补充：这个备注会直接显示在任务卡片下面。" },
    cookie,
    method: "POST"
  });
  assert(
    hasComment(adultComment.body.task?.comments, momUserId, "妈妈补充：这个备注会直接显示在任务卡片下面。"),
    "妈妈评论没有保存到任务里"
  );
  assert(
    hasCommentCreatedAt(adultComment.body.task?.comments, momUserId, "妈妈补充：这个备注会直接显示在任务卡片下面。"),
    "妈妈评论没有保存真实创建时间"
  );

  const childTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: childStudyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证小柚子任务待确认链路。",
      ownerIds: [childUserId],
      priority: importantPriority,
      rewardStars: 2,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试小柚子任务"
    },
    cookie,
    method: "POST"
  });
  const childTaskId = childTask.body.task?.id;
  assert(childTaskId, "小柚子任务创建失败");

  const completedChildTask = await request(baseUrl, taskCompleteApiPath(childTaskId), {
    cookie,
    method: "POST"
  });
  assert(completedChildTask.body.task?.status === pendingRewardStatus, "小柚子任务完成后没有进入待确认");

  const momReminders = await request(baseUrl, remindersApiPath, { cookie });
  assert(
    hasReminder(momReminders.body.reminders, childTaskId, rewardPendingReminderType),
    "妈妈提醒里没有小柚子待确认任务"
  );

  const confirmedChildTask = await request(baseUrl, taskConfirmRewardApiPath(childTaskId), {
    cookie,
    method: "POST"
  });
  assert(confirmedChildTask.body.task?.status === doneStatus, "小柚子任务确认后没有完成");

  const pet = await request(baseUrl, petApiPath, { cookie });
  assert(pet.body.flowerBalance >= 14, "小红花余额没有包含已确认奖励");
  const flowerBalanceBeforeFeed = pet.body.flowerBalance;
  const fedFlowersBeforeFeed = pet.body.pet?.fedFlowers ?? 0;

  const fedPet = await request(baseUrl, petFeedApiPath, {
    cookie,
    method: "POST"
  });
  assert(fedPet.body.pet?.fedFlowers === fedFlowersBeforeFeed + 1, "喂养后小精灵喂养次数没有增加");
  assert(fedPet.body.flowerBalance === flowerBalanceBeforeFeed - 1, "喂养后小红花余额没有减少");

  const petAfterFeed = await request(baseUrl, petApiPath, { cookie });
  assert(petAfterFeed.body.pet?.fedFlowers === fedFlowersBeforeFeed + 1, "小精灵喂养进度没有保存");
  await assertExternalPetStoreReload(baseUrl, cookie, fedFlowersBeforeFeed + 2);

  const health = await request(baseUrl, healthApiPath, { cookie });
  assert(health.body.ok === true, "健康接口异常");
  assert(health.body.dataDir === TEMP_DATA_DIR, "妈妈健康接口没有返回当前临时数据目录");
  assert(health.body.dataDirConfigured === true, "妈妈健康接口没有返回已配置独立数据目录状态");
  assert(health.body.dataDirWritable === true, "妈妈健康接口没有确认临时数据目录可写");
  assert(
    health.body.auth?.defaultPasswordUsers?.some((user) => user.id === momUserId),
    "妈妈健康接口没有返回默认密码提醒名单"
  );

  const trashTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证回收站删除和恢复链路。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试回收站任务"
    },
    cookie,
    method: "POST"
  });
  const trashTaskId = trashTask.body.task?.id;
  assert(trashTaskId, "回收站测试任务创建失败");

  await request(baseUrl, taskApiPath(trashTaskId), {
    cookie,
    method: "DELETE"
  });
  const trashAfterDelete = await request(baseUrl, trashApiPath, { cookie });
  assert(hasTask(trashAfterDelete.body.tasks, trashTaskId), "删除后任务没有进入回收站");

  await request(baseUrl, taskRestoreApiPath(trashTaskId), {
    cookie,
    method: "POST"
  });
  const tasksAfterRestore = await request(baseUrl, tasksApiPath, { cookie });
  assert(hasTask(tasksAfterRestore.body.tasks, trashTaskId), "回收站恢复后任务没有回到任务列表");

  const backup = await request(baseUrl, backupsApiPath, {
    cookie,
    method: "POST"
  });
  assert(backup.body.backup?.dirName, "妈妈手动备份没有返回备份目录");
  const healthAfterManualBackup = await request(baseUrl, healthApiPath, { cookie });
  assert(
    healthAfterManualBackup.body.manualBackups?.count >= 1,
    "妈妈健康接口没有返回手动备份数量"
  );
  assert(
    typeof healthAfterManualBackup.body.manualBackups?.pruneSuggested === "boolean",
    "妈妈健康接口没有返回手动备份整理建议状态"
  );
  assert(
    healthAfterManualBackup.body.manualBackups?.latestDirName === backup.body.backup.dirName,
    "妈妈健康接口没有返回最近手动备份目录"
  );
  assert(
    healthAfterManualBackup.body.manualBackups?.latestCopiedFiles?.includes(taskStoreFileName),
    "妈妈健康接口没有返回最近手动备份包含的任务文件"
  );
  assertBackupReadmeHasManualRestoreHelp(backup.body.backup.dirName);

  const momTrashForClear = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证爸爸清空回收站不会清掉妈妈任务。",
      ownerIds: [momUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试妈妈回收站保留任务"
    },
    cookie,
    method: "POST"
  });
  const momTrashForClearId = momTrashForClear.body.task?.id;
  assert(momTrashForClearId, "妈妈回收站保留任务创建失败");

  await request(baseUrl, taskApiPath(momTrashForClearId), {
    cookie,
    method: "DELETE"
  });

  const manualBackupCountBeforeWrongPasswordChange = countManualBackups();
  await request(baseUrl, authChangePasswordApiPath, {
    body: {
      currentPassword: "wrong-password",
      nextPassword: "654321"
    },
    cookie,
    expectedStatus: 400,
    method: "POST"
  });
  assert(
    countManualBackups() === manualBackupCountBeforeWrongPasswordChange,
    "当前密码错误时不应该自动生成手动备份"
  );

  const oldMomCookie = cookie;
  const manualBackupCountBeforePasswordChange = countManualBackups();
  const changedMomPassword = await request(baseUrl, authChangePasswordApiPath, {
    body: {
      currentPassword: defaultFamilyPassword,
      nextPassword: " 654321 "
    },
    cookie,
    method: "POST"
  });
  assert(changedMomPassword.cookie && changedMomPassword.cookie !== oldMomCookie, "妈妈修改密码后没有刷新登录 cookie");
  assertAuthSetCookie(changedMomPassword.headers, "修改密码");
  assert(countManualBackups() > manualBackupCountBeforePasswordChange, "成功修改密码前没有自动生成手动备份");
  cookie = changedMomPassword.cookie;

  await request(baseUrl, tasksApiPath, {
    cookie: oldMomCookie,
    expectedStatus: 401
  });
  const tasksAfterPasswordChange = await request(baseUrl, tasksApiPath, { cookie });
  assert(Array.isArray(tasksAfterPasswordChange.body.tasks), "妈妈修改密码后的新 cookie 无法继续访问任务");

  await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: momUserId },
    expectedStatus: 401,
    method: "POST"
  });
  const momRelogin = await request(baseUrl, authLoginApiPath, {
    body: { password: "654321", userId: momUserId },
    method: "POST"
  });
  assert(momRelogin.body.user?.id === momUserId, "妈妈修改密码后无法用新密码登录");

  const repeatTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证普通重复任务完成后生成下一次。",
      ownerIds: [momUserId],
      priority: normalPriority,
      repeatLabel: `每周${tomorrowLabel.split(" ")[1]}`,
      repeatWeekdays: [tomorrowWeekday],
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试普通重复任务"
    },
    cookie,
    method: "POST"
  });
  const repeatTaskId = repeatTask.body.task?.id;
  assert(repeatTaskId, "普通重复任务创建失败");

  await request(baseUrl, taskCompleteApiPath(repeatTaskId), {
    cookie,
    method: "POST"
  });
  const tasksAfterRepeatComplete = await request(baseUrl, tasksApiPath, { cookie });
  assert(
    findGeneratedTask(tasksAfterRepeatComplete.body.tasks, repeatTaskId)?.taskDate === tomorrow,
    "普通重复任务完成后没有生成下一次"
  );

  await request(baseUrl, taskUncompleteApiPath(repeatTaskId), {
    cookie,
    method: "POST"
  });
  const tasksAfterRepeatUncomplete = await request(baseUrl, tasksApiPath, { cookie });
  assert(
    !findGeneratedTask(tasksAfterRepeatUncomplete.body.tasks, repeatTaskId),
    "普通重复任务恢复未完成后没有撤回刚生成的下一次"
  );

  const childRepeatTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: childStudyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证小柚子重复任务确认后才生成下一次。",
      ownerIds: [childUserId],
      priority: importantPriority,
      repeatLabel: `每周${tomorrowLabel.split(" ")[1]}`,
      repeatWeekdays: [tomorrowWeekday],
      rewardStars: 1,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试小柚子重复任务"
    },
    cookie,
    method: "POST"
  });
  const childRepeatTaskId = childRepeatTask.body.task?.id;
  assert(childRepeatTaskId, "小柚子重复任务创建失败");

  await request(baseUrl, taskCompleteApiPath(childRepeatTaskId), {
    cookie,
    method: "POST"
  });
  const tasksBeforeChildRepeatConfirm = await request(baseUrl, tasksApiPath, { cookie });
  assert(
    !findGeneratedTask(tasksBeforeChildRepeatConfirm.body.tasks, childRepeatTaskId),
    "小柚子重复任务在确认前不应该生成下一次"
  );

  await request(baseUrl, taskConfirmRewardApiPath(childRepeatTaskId), {
    cookie,
    method: "POST"
  });
  const petAfterChildRepeatConfirm = await request(baseUrl, petApiPath, { cookie });
  const tasksAfterChildRepeatConfirm = await request(baseUrl, tasksApiPath, { cookie });
  assert(
    findGeneratedTask(tasksAfterChildRepeatConfirm.body.tasks, childRepeatTaskId)?.taskDate === tomorrow,
    "小柚子重复任务确认后没有生成下一次"
  );

  await request(baseUrl, taskUncompleteApiPath(childRepeatTaskId), {
    cookie,
    method: "POST"
  });
  const petAfterChildRepeatUncomplete = await request(baseUrl, petApiPath, { cookie });
  assert(
    petAfterChildRepeatUncomplete.body.flowerBalance === petAfterChildRepeatConfirm.body.flowerBalance - 1,
    "小柚子任务恢复未完成后没有扣回小红花余额"
  );
  const tasksAfterChildRepeatUncomplete = await request(baseUrl, tasksApiPath, { cookie });
  assert(
    !findGeneratedTask(tasksAfterChildRepeatUncomplete.body.tasks, childRepeatTaskId),
    "小柚子重复任务恢复未完成后没有撤回刚生成的下一次"
  );

  const dadLogin = await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: dadUserId },
    method: "POST"
  });
  let dadCookie = dadLogin.cookie;
  assert(dadLogin.body.user?.id === dadUserId && dadCookie, "爸爸登录失败");
  const dadLogout = await request(baseUrl, authLogoutApiPath, {
    cookie: dadCookie,
    method: "POST"
  });
  assertClearAuthSetCookie(dadLogout.headers, "退出登录");
  await request(baseUrl, tasksApiPath, {
    cookie: dadLogout.cookie,
    expectedStatus: 401
  });
  const dadRelogin = await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: dadUserId },
    method: "POST"
  });
  dadCookie = dadRelogin.cookie;
  assert(dadRelogin.body.user?.id === dadUserId && dadCookie, "爸爸退出后重新登录失败");
  const dadHealth = await request(baseUrl, healthApiPath, { cookie: dadCookie });
  assert(dadHealth.body.ok === true, "爸爸健康接口异常");
  assert(!("dataDir" in dadHealth.body), "爸爸健康接口不应暴露数据目录");
  assert(!("storage" in dadHealth.body), "爸爸健康接口不应暴露存储状态");
  assert(!("auth" in dadHealth.body), "爸爸健康接口不应暴露默认密码名单");

  const dadDueSoonTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: tomorrow,
      dueLabel: tomorrowLabel,
      note: "验证提前提醒只提醒负责人。",
      ownerIds: [dadUserId],
      priority: normalPriority,
      remindLabel: "提前 1 天每天提醒",
      reminderDays: 1,
      taskDate: tomorrow,
      taskTimeLabel: tomorrowLabel,
      title: "冒烟测试爸爸提前提醒任务"
    },
    cookie,
    method: "POST"
  });
  const dadDueSoonTaskId = dadDueSoonTask.body.task?.id;
  assert(dadDueSoonTaskId, "爸爸提前提醒任务创建失败");

  const momRemindersForDadDueSoon = await request(baseUrl, remindersApiPath, { cookie });
  assert(
    !hasReminder(momRemindersForDadDueSoon.body.reminders, dadDueSoonTaskId, dueSoonReminderType),
    "爸爸负责的提前提醒不应该出现在妈妈提醒里"
  );
  const dadRemindersForDueSoon = await request(baseUrl, remindersApiPath, { cookie: dadCookie });
  assert(
    hasReminder(dadRemindersForDueSoon.body.reminders, dadDueSoonTaskId, dueSoonReminderType),
    "爸爸提醒里没有按最晚完成时间提前提醒的任务"
  );

  await request(baseUrl, backupsApiPath, {
    cookie: dadCookie,
    expectedStatus: 403,
    method: "POST"
  });

  await request(baseUrl, taskRestoreApiPath(momTrashForClearId), {
    cookie: dadCookie,
    expectedStatus: 403,
    method: "POST"
  });

  const dadTrashTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: personalCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证爸爸清空回收站只清自己。",
      ownerIds: [dadUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "冒烟测试爸爸回收站任务"
    },
    cookie: dadCookie,
    method: "POST"
  });
  const dadTrashTaskId = dadTrashTask.body.task?.id;
  assert(dadTrashTaskId, "爸爸回收站任务创建失败");

  await request(baseUrl, taskApiPath(dadTrashTaskId), {
    cookie: dadCookie,
    method: "DELETE"
  });
  const manualBackupCountBeforeDadClear = countManualBackups();
  await request(baseUrl, trashApiPath, {
    cookie: dadCookie,
    method: "DELETE"
  });
  const dadTrashAfterClear = await request(baseUrl, trashApiPath, { cookie: dadCookie });
  assert(!hasTask(dadTrashAfterClear.body.tasks, dadTrashTaskId), "爸爸清空回收站后自己的任务还在");
  const momTrashAfterDadClear = await request(baseUrl, trashApiPath, { cookie });
  assert(hasTask(momTrashAfterDadClear.body.tasks, momTrashForClearId), "爸爸清空回收站误清了妈妈任务");
  assert(countManualBackups() > manualBackupCountBeforeDadClear, "清空回收站前没有自动生成手动备份");

  const manualBackupCountBeforeMomClear = countManualBackups();
  await request(baseUrl, trashApiPath, {
    cookie,
    method: "DELETE"
  });
  const momTrashAfterClear = await request(baseUrl, trashApiPath, { cookie });
  assert(!hasTask(momTrashAfterClear.body.tasks, momTrashForClearId), "妈妈清空回收站后任务仍然存在");
  assert(countManualBackups() > manualBackupCountBeforeMomClear, "妈妈清空回收站前没有自动生成手动备份");

  const dadRemindersAfterConfirm = await request(baseUrl, remindersApiPath, { cookie: dadCookie });
  assert(
    !hasReminder(dadRemindersAfterConfirm.body.reminders, childTaskId, rewardPendingReminderType),
    "已确认的小柚子任务不应继续出现在爸爸提醒里"
  );

  await request(baseUrl, taskApiPath(adultTaskId), {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "爸爸不应该能改妈妈创建的任务。",
      ownerIds: [dadUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "爸爸越权修改"
    },
    cookie: dadCookie,
    expectedStatus: 403,
    method: "PUT"
  });

  await request(baseUrl, taskApiPath(adultTaskId), {
    cookie: dadCookie,
    expectedStatus: 403,
    method: "DELETE"
  });

  const dadTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: personalCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "验证爸爸能管理自己创建的任务。",
      ownerIds: [dadUserId],
      priority: normalPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "爸爸自己的冒烟任务"
    },
    cookie: dadCookie,
    method: "POST"
  });
  const dadTaskId = dadTask.body.task?.id;
  assert(dadTaskId, "爸爸创建自己的任务失败");

  const updatedDadTask = await request(baseUrl, taskApiPath(dadTaskId), {
    body: {
      category: personalCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "爸爸可以编辑自己创建的任务。",
      ownerIds: [dadUserId],
      priority: importantPriority,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "爸爸自己的冒烟任务已编辑"
    },
    cookie: dadCookie,
    method: "PUT"
  });
  assert(updatedDadTask.body.task?.title === "爸爸自己的冒烟任务已编辑", "爸爸编辑自己任务失败");

  const dadComment = await request(baseUrl, taskCommentsApiPath(adultTaskId), {
    body: { content: "爸爸补一句：成人可见任务可以直接评论。" },
    cookie: dadCookie,
    method: "POST"
  });
  assert(
    hasComment(dadComment.body.task?.comments, dadUserId, "爸爸补一句：成人可见任务可以直接评论。"),
    "爸爸评论成人可见任务失败"
  );
  assert(
    hasCommentCreatedAt(dadComment.body.task?.comments, dadUserId, "爸爸补一句：成人可见任务可以直接评论。"),
    "爸爸评论没有保存真实创建时间"
  );

  const childLogin = await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: childUserId },
    method: "POST"
  });
  const childCookie = childLogin.cookie;
  assert(childLogin.body.user?.id === childUserId && childCookie, "小柚子登录失败");

  const childVisibleTasks = await request(baseUrl, tasksApiPath, { cookie: childCookie });
  assert(Array.isArray(childVisibleTasks.body.tasks), "小柚子任务列表返回异常");
  assert(
    !childVisibleTasks.body.tasks.some((task) => task.id === adultTaskId || task.id === dadTaskId),
    "小柚子看到了成人任务"
  );
  await request(baseUrl, taskApiPath(adultTaskId), {
    cookie: childCookie,
    expectedStatus: 404
  });
  await request(baseUrl, taskApiPath(dadTaskId), {
    cookie: childCookie,
    expectedStatus: 404
  });
  await request(baseUrl, taskCommentsApiPath(adultTaskId), {
    body: { content: "小柚子不应该能评论成人任务。" },
    cookie: childCookie,
    expectedStatus: 403,
    method: "POST"
  });
  await request(baseUrl, taskCompleteApiPath(adultTaskId), {
    cookie: childCookie,
    expectedStatus: 403,
    method: "POST"
  });

  const childCreatedTask = await request(baseUrl, tasksApiPath, {
    body: {
      category: familyCategory,
      dueDate: today,
      dueLabel: todayLabel,
      note: "小柚子创建任务时应自动归到自己名下。",
      ownerIds: [momUserId],
      priority: normalPriority,
      rewardStars: 9,
      taskDate: today,
      taskTimeLabel: todayLabel,
      title: "小柚子自己的冒烟任务"
    },
    cookie: childCookie,
    method: "POST"
  });
  const childCreatedTaskValue = childCreatedTask.body.task;
  assert(childCreatedTaskValue?.category === childStudyCategory, "小柚子创建的任务没有自动归到小柚子分类");
  assert(childCreatedTaskValue?.owners?.some((owner) => owner.id === childUserId), "小柚子创建的任务负责人异常");
  assert(childCreatedTaskValue?.rewardStars === undefined, "小柚子不应该能给自己设置小红花");

  const childComment = await request(baseUrl, taskCommentsApiPath(childCreatedTaskValue.id), {
    body: { content: "小柚子说：我完成啦。" },
    cookie: childCookie,
    method: "POST"
  });
  assert(
    hasComment(childComment.body.task?.comments, childUserId, "小柚子说：我完成啦。"),
    "小柚子评论自己的任务失败"
  );
  assert(
    hasCommentCreatedAt(childComment.body.task?.comments, childUserId, "小柚子说：我完成啦。"),
    "小柚子评论没有保存真实创建时间"
  );

  const childCompletedOwnTask = await request(baseUrl, taskCompleteApiPath(childCreatedTaskValue.id), {
    cookie: childCookie,
    method: "POST"
  });
  assert(childCompletedOwnTask.body.task?.status === pendingRewardStatus, "小柚子完成自己的任务后没有进入待确认");

  const childReminders = await request(baseUrl, remindersApiPath, { cookie: childCookie });
  assert(
    !hasReminder(childReminders.body.reminders, childCreatedTaskValue.id, rewardPendingReminderType),
    "小柚子不应该看到待确认提醒"
  );

  const dadReminders = await request(baseUrl, remindersApiPath, { cookie: dadCookie });
  assert(
    hasReminder(dadReminders.body.reminders, childCreatedTaskValue.id, rewardPendingReminderType),
    "爸爸提醒里没有小柚子待确认任务"
  );

  const dadDefaultSettings = await request(baseUrl, settingsApiPath, { cookie: dadCookie });
  assert(dadDefaultSettings.body.reminderSettings?.siteRemindersEnabled === true, "爸爸默认站内提醒没有开启");
  assert(dadDefaultSettings.body.reminderSettings?.rewardRemindersEnabled === true, "爸爸默认待确认提醒没有开启");
  await request(baseUrl, settingsApiPath, {
    body: {
      reminderSettings: {
        [overdueRemindersEnabledKey]: true,
        [rewardRemindersEnabledKey]: false,
        [siteRemindersEnabledKey]: true
      }
    },
    cookie: dadCookie,
    expectedStatus: 400,
    method: "PUT"
  });

  await request(baseUrl, settingsApiPath, {
    body: {
      reminderSettings: {
        [dailyDigestEnabledKey]: false,
        [overdueRemindersEnabledKey]: true,
        [rewardRemindersEnabledKey]: false,
        [siteRemindersEnabledKey]: true
      }
    },
    cookie: dadCookie,
    method: "PUT"
  });
  const dadSavedSettings = await request(baseUrl, settingsApiPath, { cookie: dadCookie });
  assert(
    dadSavedSettings.body.reminderSettings?.rewardRemindersEnabled === false,
    "爸爸提醒设置保存后，GET 没有读到已关闭的小柚子待确认提醒"
  );

  const dadReloginAfterSettings = await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: dadUserId },
    method: "POST"
  });
  const dadSettingsAfterRelogin = await request(baseUrl, settingsApiPath, { cookie: dadReloginAfterSettings.cookie });
  assert(
    dadSettingsAfterRelogin.body.reminderSettings?.rewardRemindersEnabled === false,
    "爸爸重新登录后提醒设置没有保留"
  );

  const dadRemindersAfterSettingOff = await request(baseUrl, remindersApiPath, { cookie: dadCookie });
  assert(
    !hasReminder(dadRemindersAfterSettingOff.body.reminders, childCreatedTaskValue.id, rewardPendingReminderType),
    "爸爸关闭小柚子待确认提醒后仍然看到了提醒"
  );

  await request(baseUrl, taskConfirmRewardApiPath(childCreatedTaskValue.id), {
    cookie: childCookie,
    expectedStatus: 403,
    method: "POST"
  });

  await assertExternalUserStoreReload(baseUrl);
  await assertLoginRateLimit(baseUrl);

  console.log("\n冒烟测试通过。");
}

async function request(baseUrl, path, options = {}) {
  const headers = {
    Accept: jsonContentType
  };
  if (options.body) headers[contentTypeHeaderName] = jsonContentType;
  if (options.cookie) headers.Cookie = options.cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
    method: options.method ?? "GET"
  });
  const body = await response.json().catch(() => null);

  const expectedStatus = options.expectedStatus;
  const isExpectedResponse = expectedStatus === undefined ? response.ok : response.status === expectedStatus;
  if (!isExpectedResponse) {
    throw new Error(`${options.method ?? "GET"} ${path} 返回 ${response.status}: ${JSON.stringify(body)}`);
  }

  return {
    body,
    cookie: response.headers.get("set-cookie")?.split(";")[0] ?? options.cookie ?? "",
    headers: response.headers
  };
}

async function assertEventStreamUnauthorized(baseUrl) {
  const response = await fetch(`${baseUrl}${eventsApiPath}`);
  assert(response.status === 401, "未登录时不应连接实时更新事件流");
}

async function assertEventStreamConnected(baseUrl, cookie) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${baseUrl}${eventsApiPath}`, {
      headers: { Cookie: cookie },
      signal: controller.signal
    });
    assert(response.ok, "登录后实时更新事件流连接失败");
    const reader = response.body?.getReader();
    assert(reader, "实时更新事件流没有响应体");
    const firstChunk = await reader.read();
    const text = new TextDecoder().decode(firstChunk.value ?? new Uint8Array());
    assert(text.includes(`event: ${connectedStreamEventType}`), "实时更新事件流没有返回 connected 事件");
    await reader.cancel();
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function waitForServer(baseUrl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 45000) {
    if (devServer.exitCode !== null) {
      throw new Error(`临时 dev 服务提前退出，退出码：${devServer.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}${healthApiPath}`);
      if (response.ok) return;
    } catch {
      // Keep waiting while Next.js starts and compiles the first route.
    }
    await sleep(500);
  }
  throw new Error("等待临时 dev 服务启动超时");
}

async function stopDevServer() {
  if (!devServer || devServer.exitCode !== null) return;
  await new Promise((resolve) => {
    devServer.once("exit", resolve);
    devServer.kill("SIGINT");
    setTimeout(() => {
      if (devServer.exitCode === null) devServer.kill("SIGTERM");
    }, 2500);
  });
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port >= 65536) {
        reject(new Error(`没有找到可用端口：已从 ${startPort} 检查到 65535`));
        return;
      }
      const server = net.createServer();
      server.once("error", (error) => {
        if (error && error.code === "EADDRINUSE") {
          tryPort(port + 1);
          return;
        }
        reject(new Error(`检查端口 ${port} 失败：${error?.code ?? error?.message ?? String(error)}`));
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };
    try {
      tryPort(startPort);
    } catch (error) {
      reject(error);
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoStoreHeader(headers, label) {
  const cacheControl = headers.get(cacheControlHeaderName) ?? "";
  assert(cacheControl.includes(noStoreCacheControlDirective), `${label} 没有设置 ${cacheControlHeaderName}: ${noStoreCacheControlDirective}`);
}

function assertAuthSetCookie(headers, label) {
  const setCookie = headers.get("set-cookie") ?? "";
  assert(setCookie.includes(`${authCookieName}=`), `${label} 没有设置登录 cookie`);
  assert(/;\s*HttpOnly/i.test(setCookie), `${label} cookie 没有 HttpOnly`);
  assert(/;\s*SameSite=Lax/i.test(setCookie), `${label} cookie 没有 SameSite=Lax`);
  assert(/;\s*Path=\//i.test(setCookie), `${label} cookie 没有 Path=/`);
}

function assertClearAuthSetCookie(headers, label) {
  const setCookie = headers.get("set-cookie") ?? "";
  assert(setCookie.includes(`${authCookieName}=`), `${label} 没有设置清空登录 cookie`);
  assert(/;\s*Max-Age=0/i.test(setCookie), `${label} cookie 没有 Max-Age=0`);
  assert(/;\s*HttpOnly/i.test(setCookie), `${label} cookie 没有 HttpOnly`);
  assert(/;\s*SameSite=Lax/i.test(setCookie), `${label} cookie 没有 SameSite=Lax`);
  assert(/;\s*Path=\//i.test(setCookie), `${label} cookie 没有 Path=/`);
}

function assertRetryAfterHeader(headers, label) {
  const retryAfter = Number(headers.get(retryAfterHeaderName));
  assert(Number.isInteger(retryAfter) && retryAfter >= 1, `${label} 没有返回有效 Retry-After 响应头`);
}

function hasReminder(reminders, taskId, type) {
  return Array.isArray(reminders) && reminders.some((reminder) => reminder.taskId === taskId && reminder.type === type);
}

function hasTask(tasks, taskId) {
  return Array.isArray(tasks) && tasks.some((task) => task.id === taskId);
}

function getFamilyUser(userId) {
  const user = familyUsers.find((candidate) => candidate.id === userId);
  if (!user) throw new Error(`缺少冒烟测试家庭成员：${userId}`);
  return user;
}

async function assertExternalTaskStoreReload(baseUrl, cookie, today, todayLabel) {
  const taskStorePath = join(TEMP_DATA_DIR, taskStoreFileName);
  const taskStore = JSON.parse(readFileSync(taskStorePath, "utf8"));
  await sleep(20);
  const externalTask = {
    id: "external-reload-task",
    title: "外部恢复后应自动刷新",
    note: "模拟命令行恢复或外部写入后的服务内存刷新。",
    createdById: momUserId,
    category: familyCategory,
    owners: [momUser],
    priority: normalPriority,
    taskTimeLabel: todayLabel,
    taskDate: today,
    dueLabel: todayLabel,
    dueDate: today,
    status: todoStatus
  };
  writeFileSync(
    taskStorePath,
    `${JSON.stringify({ ...taskStore, tasks: [externalTask, ...(taskStore.tasks ?? [])] }, null, 2)}\n`,
    "utf8"
  );

  const reloadedTasks = await request(baseUrl, tasksApiPath, { cookie });
  assert(hasTask(reloadedTasks.body.tasks, externalTask.id), "服务运行中外部恢复任务文件后，API 没有重新载入磁盘数据");
}

async function assertExternalPetStoreReload(baseUrl, cookie, fedFlowers) {
  const petStorePath = join(TEMP_DATA_DIR, petStoreFileName);
  await sleep(20);
  writeFileSync(
    petStorePath,
    `${JSON.stringify({ fedFlowers, updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8"
  );

  const reloadedPet = await request(baseUrl, petApiPath, { cookie });
  assert(
    reloadedPet.body.pet?.fedFlowers === fedFlowers,
    "服务运行中外部恢复小精灵文件后，API 没有重新载入磁盘数据"
  );
}

async function assertExternalUserStoreReload(baseUrl) {
  const userStorePath = join(TEMP_DATA_DIR, userStoreFileName);
  const userStore = JSON.parse(readFileSync(userStorePath, "utf8"));
  await sleep(20);
  writeFileSync(
    userStorePath,
    `${JSON.stringify({
      ...userStore,
      passwordHashes: {
        ...(userStore.passwordHashes ?? {}),
        [childUserId]: hashSync("external-child-123", 10)
      }
    }, null, 2)}\n`,
    "utf8"
  );

  const childLogin = await request(baseUrl, authLoginApiPath, {
    body: { password: "external-child-123", userId: childUserId },
    method: "POST"
  });
  assert(childLogin.body.user?.id === childUserId, "服务运行中外部恢复账号文件后，新密码无法登录");
}

async function assertLoginRateLimit(baseUrl) {
  for (let attempt = 1; attempt < maxFailedLoginAttempts; attempt += 1) {
    await request(baseUrl, authLoginApiPath, {
      body: { password: "wrong-password", userId: `unknown-user-${attempt}` },
      expectedStatus: 401,
      method: "POST"
    });
  }
  const blockedUnknownLogin = await request(baseUrl, authLoginApiPath, {
    body: { password: "wrong-password", userId: "unknown-user-after-many-attempts" },
    expectedStatus: 429,
    method: "POST"
  });
  assert(blockedUnknownLogin.body.error === "TOO_MANY_LOGIN_ATTEMPTS", "无效身份连续尝试没有进入统一登录限速");
  assertRetryAfterHeader(blockedUnknownLogin.headers, "无效身份登录限速");

  for (let attempt = 1; attempt < maxFailedLoginAttempts; attempt += 1) {
    await request(baseUrl, authLoginApiPath, {
      body: { password: `dad-wrong-password-${attempt}`, userId: dadUserId },
      expectedStatus: 401,
      method: "POST"
    });
  }
  const dadLoginAfterFailedAttempts = await request(baseUrl, authLoginApiPath, {
    body: { password: defaultFamilyPassword, userId: dadUserId },
    method: "POST"
  });
  assert(dadLoginAfterFailedAttempts.body.user?.id === dadUserId, "输错几次后，爸爸无法用正确密码登录");
  await request(baseUrl, authLoginApiPath, {
    body: { password: "dad-wrong-password-after-success", userId: dadUserId },
    expectedStatus: 401,
    method: "POST"
  });

  for (let attempt = 1; attempt < maxFailedLoginAttempts; attempt += 1) {
    await request(baseUrl, authLoginApiPath, {
      body: { password: `wrong-password-${attempt}`, userId: childUserId },
      expectedStatus: 401,
      method: "POST"
    });
  }

  const blockedLogin = await request(baseUrl, authLoginApiPath, {
    body: { password: "still-wrong", userId: childUserId },
    expectedStatus: 429,
    method: "POST"
  });
  assert(blockedLogin.body.error === "TOO_MANY_LOGIN_ATTEMPTS", "连续输错密码后没有触发登录限速");
  assert(blockedLogin.body.retryAfterSeconds >= 1, "登录限速没有返回重试等待时间");
  assertRetryAfterHeader(blockedLogin.headers, "小柚子登录限速");
}

function hasComment(comments, authorId, content) {
  return Array.isArray(comments) && comments.some((comment) => {
    return comment.author?.id === authorId && comment.content === content;
  });
}

function hasCommentCreatedAt(comments, authorId, content) {
  return Array.isArray(comments) && comments.some((comment) => {
    return (
      comment.author?.id === authorId &&
      comment.content === content &&
      typeof comment.createdAt === "string" &&
      !Number.isNaN(new Date(comment.createdAt).getTime())
    );
  });
}

function countManualBackups() {
  return countManualBackupsInDir(TEMP_DATA_DIR);
}

function countManualBackupsInDir(dataDir) {
  const manualBackupDir = join(dataDir, manualBackupDirName);
  return existsSync(manualBackupDir) ? readdirSync(manualBackupDir).length : 0;
}

function assertBackupReadmeHasManualRestoreHelp(dirName) {
  const readmePath = join(TEMP_DATA_DIR, manualBackupDirName, dirName, "README.txt");
  assert(existsSync(readmePath), "手动备份没有生成 README 说明");
  const readme = readFileSync(readmePath, "utf8");
  assert(
    readme.includes("npm run data:restore-manual -- latest"),
    "手动备份 README 没有包含整包恢复命令"
  );
  assert(readme.includes("关键文件状态：完整"), "手动备份 README 没有标记关键文件完整状态");
}

function assertManualBackupRestoreScript() {
  const restoreTestDir = mkdtempSync(join(tmpdir(), "super-family-restore-smoke-"));
  try {
    const originalTaskStore = { tasks: [{ id: "manual-backup-original", title: "恢复前任务" }], trashTasks: [] };
    writeFileSync(join(restoreTestDir, taskStoreFileName), JSON.stringify(originalTaskStore, null, 2), "utf8");
    writeFileSync(
      join(restoreTestDir, userStoreFileName),
      JSON.stringify({ passwordHashes: { mom: "hash" }, reminderSettings: {} }, null, 2),
      "utf8"
    );
    writeFileSync(join(restoreTestDir, petStoreFileName), JSON.stringify({ fedFlowers: 2 }, null, 2), "utf8");
    mkdirSync(join(restoreTestDir, autoSnapshotDirName, "nested-dir-should-be-ignored"), { recursive: true });
    writeFileSync(
      join(restoreTestDir, autoSnapshotDirName, `2026-01-01T00-00-00-000Z-${taskStoreFileName}`),
      JSON.stringify(originalTaskStore, null, 2),
      "utf8"
    );

    const collisionTimestamp = "2026-01-02T03-04-05.006Z";
    const collisionDirName = collisionTimestamp.replace(/[:.]/g, "-");
    runDataScript(["run", "data:backup"], restoreTestDir, {
      SUPER_FAMILY_TEST_BACKUP_TIMESTAMP: collisionTimestamp
    });
    writeFileSync(
      join(restoreTestDir, manualBackupDirName, collisionDirName, "collision-marker.txt"),
      "keep this file",
      "utf8"
    );
    runDataScript(["run", "data:backup"], restoreTestDir, {
      SUPER_FAMILY_TEST_BACKUP_TIMESTAMP: collisionTimestamp
    });
    assert(
      existsSync(join(restoreTestDir, manualBackupDirName, collisionDirName, "collision-marker.txt")),
      "同名手动备份覆盖了已有目录"
    );
    assert(
      existsSync(join(restoreTestDir, manualBackupDirName, `${collisionDirName}-2`, "README.txt")),
      "同名手动备份没有自动创建带序号的新目录"
    );

    runDataScript(["run", "data:backup"], restoreTestDir);
    writeFileSync(
      join(restoreTestDir, taskStoreFileName),
      JSON.stringify({ tasks: [{ id: "manual-backup-broken" }], trashTasks: [] }, null, 2),
      "utf8"
    );
    runDataScript(["run", "data:restore-manual", "--", "latest"], restoreTestDir);

    const restoredTaskStore = JSON.parse(readFileSync(join(restoreTestDir, taskStoreFileName), "utf8"));
    assert(
      restoredTaskStore.tasks?.[0]?.id === "manual-backup-original",
      "手动备份整包恢复没有恢复到原始任务数据"
    );
    assert(
      readdirSync(join(restoreTestDir, manualBackupDirName)).some((name) => name.includes("before-manual-restore")),
      "手动备份整包恢复前没有自动创建 before-manual-restore 备份"
    );

    const manualBackupCountBeforePasswordReset = countManualBackupsInDir(restoreTestDir);
    runDataScript(["run", "user:reset-password", "--", momUserId, " reset-mom-123 "], restoreTestDir);
    const resetUserStore = JSON.parse(readFileSync(join(restoreTestDir, userStoreFileName), "utf8"));
    assert(
      countManualBackupsInDir(restoreTestDir) > manualBackupCountBeforePasswordReset,
      "命令行重置密码前没有自动生成手动备份"
    );
    assert(compareSync("reset-mom-123", resetUserStore.passwordHashes?.[momUserId]), "命令行重置密码没有忽略前后空格");
  } finally {
    rmSync(restoreTestDir, { force: true, recursive: true });
  }
}

function assertDataRepairDateRepairScript() {
  const repairTestDir = mkdtempSync(join(tmpdir(), "super-family-repair-smoke-"));
  try {
    writeFileSync(
      join(repairTestDir, taskStoreFileName),
      JSON.stringify({
        tasks: [
          {
            id: "bad-date-task",
            title: "坏日期修复测试",
            note: "",
            createdById: momUserId,
            category: familyCategory,
            owners: [momUser],
            priority: normalPriority,
            taskDate: "2026-02-31",
            dueDate: "2026-99-99",
            dueLabel: "不存在",
            taskTimeLabel: "不存在",
            repeatUntil: "2026-13-01",
            repeatWeekdays: [1],
            status: todoStatus
          },
          {
            id: "overfed-pet-reward-task",
            title: "小精灵过量喂养修复测试",
            note: "",
            createdById: momUserId,
            category: childStudyCategory,
            owners: [childUser],
            priority: normalPriority,
            taskDate: "2026-01-01",
            dueDate: "2026-01-01",
            dueLabel: "1月1日 周四",
            taskTimeLabel: "1月1日 周四",
            rewardStars: 3,
            status: doneStatus
          }
        ],
        trashTasks: []
      }, null, 2),
      "utf8"
    );
    writeFileSync(
      join(repairTestDir, userStoreFileName),
      JSON.stringify({ passwordHashes: { mom: "hash" }, reminderSettings: {} }, null, 2),
      "utf8"
    );
    writeFileSync(join(repairTestDir, petStoreFileName), JSON.stringify({ fedFlowers: 99 }, null, 2), "utf8");
    mkdirSync(join(repairTestDir, autoSnapshotDirName, "nested-dir-should-be-ignored"), { recursive: true });

    runDataScript(["run", "data:repair", "--", "--write"], repairTestDir);

    const repairedTaskStore = JSON.parse(readFileSync(join(repairTestDir, taskStoreFileName), "utf8"));
    const repairedTask = repairedTaskStore.tasks?.[0];
    assert(isValidInputDate(repairedTask?.taskDate), "数据修复没有修复非法任务日期");
    assert(isValidInputDate(repairedTask?.dueDate), "数据修复没有修复非法最晚完成日期");
    assert(repairedTask.dueDate >= repairedTask.taskDate, "数据修复后最晚完成日期仍早于任务日期");
    assert(repairedTask.repeatUntil === undefined, "数据修复没有清理非法重复结束日期");
    const repairedPetStore = JSON.parse(readFileSync(join(repairTestDir, petStoreFileName), "utf8"));
    assert(repairedPetStore.fedFlowers === 15, "数据修复没有扣回超过可获得上限的小精灵喂养数");
    assert(
      readdirSync(join(repairTestDir, manualBackupDirName)).some((name) => name.includes("before-repair")),
      "数据修复写入前没有自动创建 before-repair 备份"
    );
  } finally {
    rmSync(repairTestDir, { force: true, recursive: true });
  }
}

function runDataScript(args, dataDir, extraEnv = {}) {
  const result = spawnSync(npmCommand, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv,
      SUPER_FAMILY_DATA_DIR: dataDir
    },
    stdio: "pipe"
  });

  if (result.status !== 0) {
    throw new Error(`数据脚本执行失败：npm ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  }
}

function findGeneratedTask(tasks, sourceTaskId) {
  return Array.isArray(tasks) ? tasks.find((task) => task.repeatGeneratedFromId === sourceTaskId) : undefined;
}

function restoreTypeFiles() {
  if (!originalTsconfig || !existsSync(TSCONFIG_PATH)) return;
  const currentTsconfig = readFileSync(TSCONFIG_PATH, "utf8");
  if (currentTsconfig !== originalTsconfig) {
    writeFileSync(TSCONFIG_PATH, originalTsconfig, "utf8");
  }

  if (!originalNextEnv || !existsSync(NEXT_ENV_PATH)) return;
  const currentNextEnv = readFileSync(NEXT_ENV_PATH, "utf8");
  if (currentNextEnv !== originalNextEnv) {
    writeFileSync(NEXT_ENV_PATH, originalNextEnv, "utf8");
  }
}

function installSignalHandlers() {
  const handleSignal = (signal) => {
    void cleanupArtifacts().finally(() => {
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
}

async function cleanupArtifacts() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  await stopDevServer();
  restoreTypeFiles();
  if (!keepTempData) {
    rmSync(TEMP_DATA_DIR, { force: true, recursive: true });
    rmSync(TEMP_DIST_DIR, { force: true, recursive: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTodayInputValue() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysInputValue(date, dayOffset) {
  const parsedDate = new Date(`${date}T00:00:00`);
  parsedDate.setDate(parsedDate.getDate() + dayOffset);
  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, "0");
  const day = String(parsedDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayValue(date) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const weekday = parsedDate.getDay();
  return weekday === 0 ? 7 : weekday;
}

function formatDateLabel(date) {
  const parsedDate = new Date(`${date}T00:00:00`);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return `${parsedDate.getMonth() + 1}月${parsedDate.getDate()}日 ${weekdays[parsedDate.getDay()]}`;
}

function isValidInputDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return (
    parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day
  );
}
