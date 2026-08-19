import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import * as apiErrorCodeConstants from "./api-error-codes.mjs";
import {
  authChangePasswordApiPath,
  authLoginApiPath,
  authLogoutApiPath,
  backupsApiPath,
  eventsApiPath,
  healthApiPath,
  meApiPath,
  petApiPath,
  petFeedApiPath,
  remindersApiPath,
  settingsApiPath,
  tasksApiPath,
  trashApiPath
} from "./api-paths.mjs";
import { appServiceName } from "./app-metadata.mjs";
import {
  authCookieName,
  authCookieVersion,
  authSecretPlaceholderSnippet,
  defaultFamilyPassword,
  localDevAuthSecret,
  maxFailedLoginAttempts,
  maxPasswordLength,
  minPasswordLength
} from "./auth-values.mjs";
import { canWriteDataDir, getDataDir } from "./data-dir.mjs";
import {
  autoSnapshotDirName,
  criticalDataFileNames,
  manualBackupDirName,
  manualBackupSnapshotDirName,
  petStoreFileName,
  taskStoreFileName,
  userStoreFileName
} from "./data-files.mjs";
import { manualBackupStaleDays, manualBackupWarningCount } from "./data-safety-values.mjs";
import { getConfiguredSecret } from "./env.mjs";
import { familyUserIds, familyUsers as scriptFamilyUsers } from "./family-users.mjs";
import {
  cacheControlHeaderName,
  connectionHeaderName,
  contentTypeHeaderName,
  eventStreamCacheControlValue,
  eventStreamContentType,
  jsonContentType,
  keepAliveConnectionValue,
  noStoreCacheControlDirective,
  noStoreCacheControlValue,
  retryAfterHeaderName
} from "./http-headers.mjs";
import { babyPage, homePage, listPage, mainPages, mePage, remindersPage, settingsPage, trashPage } from "./main-pages.mjs";
import { petBaseFlowers, petStarsPerLevel } from "./pet-values.mjs";
import { defaultReminderSettings, reminderSettingKeys } from "./reminder-settings.mjs";
import { dueSoonReminderType, overdueReminderType, rewardPendingReminderType } from "./reminder-types.mjs";
import {
  connectedStreamData,
  connectedStreamEventType,
  heartbeatStreamComment,
  serverEventHeartbeatMs
} from "./server-event-stream.mjs";
import { petChangedEventType, tasksChangedEventType, serverEventTypes } from "./server-event-types.mjs";
import {
  maxCommentLength,
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
} from "./task-limits.mjs";
import {
  childStudyCategory,
  dayAfterTimeBucket,
  doneStatus,
  familyCategory,
  importantPriority,
  normalPriority,
  overdueTimeBucket,
  pastTimeBucket,
  pendingRewardStatus,
  personalCategory,
  taskCategoryValues,
  taskPriorityValues,
  taskStatusValues,
  taskTimeBucketValues,
  todayTimeBucket,
  todoStatus,
  tomorrowTimeBucket,
  weekTimeBucket,
  urgentPriority
} from "./task-values.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = getDataDir(ROOT_DIR);
const DOCS_DIR = join(ROOT_DIR, "docs");
const PUBLIC_DIR = join(ROOT_DIR, "public");
const TSCONFIG_PATH = join(ROOT_DIR, "tsconfig.json");
const NEXT_ENV_PATH = join(ROOT_DIR, "next-env.d.ts");
const originalTsconfig = existsSync(TSCONFIG_PATH) ? readFileSync(TSCONFIG_PATH, "utf8") : "";
const originalNextEnv = existsSync(NEXT_ENV_PATH) ? readFileSync(NEXT_ENV_PATH, "utf8") : "";
const DOCTOR_BUILD_DIST_DIR = ".next-doctor-build";
const DOCTOR_BUILD_DIST_PATH = join(ROOT_DIR, DOCTOR_BUILD_DIST_DIR);
const withBuild = process.argv.includes("--with-build");
const problems = [];
const warnings = [];
let cleanupStarted = false;

installSignalHandlers();

console.log("超人家族任务清单健康检查");
console.log(`- 项目目录：${ROOT_DIR}`);
console.log(`- 数据目录：${DATA_DIR}`);
console.log(`- 模式：${withBuild ? "包含生产构建" : "快速只读检查"}`);

checkPackageScripts();
checkScriptRootDetection();
checkScriptNetworkUrlHelpers();
checkScriptAppHealthHelpers();
checkScriptLocalAccessErrorHelpers();
checkScriptNpmRunnerUsage();
checkScriptNpmCommandConstantsUsage();
checkScriptDataFileConstantsUsage();
checkScriptFamilyUserConstantsUsage();
checkScriptTaskValueConstantsUsage();
checkScriptAuthConstantsUsage();
checkLoginRateLimitConstantsUsage();
checkScriptReminderSettingsConstantsUsage();
checkScriptReminderTypeConstantsUsage();
checkScriptPetConstantsUsage();
checkScriptTaskLimitConstantsUsage();
checkEnvironment();
checkSmokeArtifacts();
checkDataDirAccess();
checkTypeFileReferences();
checkSharedAppMetadataConstants();
checkSharedApiPathConstants();
checkSharedHttpHeaderConstants();
checkSharedDataFileConstants();
checkSharedDataSafetyConstants();
checkSharedApiErrorCodeConstants();
checkSharedServerEventTypeConstants();
checkSharedServerEventStreamConstants();
checkSharedMainPageConstants();
checkSharedAuthConstants();
checkSharedFamilyUserConstants();
checkSharedTaskValueConstants();
checkSharedTaskLabels();
checkSharedReminderSettingsConstants();
checkSharedReminderTypeConstants();
checkSharedPetConstants();
checkSharedTaskLimitConstants();
checkTypeScriptDataFileConstantsUsage();
checkTypeScriptApiErrorCodeConstantsUsage();
checkTypeScriptServerEventTypeConstantsUsage();
checkServerEventStreamConstantsUsage();
checkTypeScriptMainPageConstantsUsage();
checkTypeScriptAppMetadataConstantsUsage();
checkScriptAppMetadataConstantsUsage();
checkTypeScriptApiPathConstantsUsage();
checkScriptApiPathConstantsUsage();
checkTypeScriptHttpHeaderConstantsUsage();
checkScriptHttpHeaderConstantsUsage();
checkTypeScriptAuthConstantsUsage();
checkTypeScriptFamilyUserConstantsUsage();
checkTypeScriptReminderSettingsConstantsUsage();
checkTypeScriptReminderTypeConstantsUsage();
checkTypeScriptTaskValueConstantsUsage();
checkTypeScriptTaskUpdateScopeConstantsUsage();
checkTypeScriptTaskLabelConstantsUsage();
checkTypeScriptTaskLimitConstantsUsage();
checkDocs();
checkBackupReadmeHelpers();
checkBackupDirectorySafety();
checkBackupCreationDurability();
checkPublicAssets();
checkProductionBuildGuard();
checkAuthCookieConsistency();
checkJsonStoreDurability();
checkDataToolDurability();
checkApiMiddleware();
checkApiRequestBodies();
checkUiCopy();
checkBrowserCompatibility();
checkDataFiles();
runDataCheck();
runTypeCheck();

if (withBuild) {
  console.log(`\n运行生产构建检查（独立缓存：${DOCTOR_BUILD_DIST_DIR}）...`);
  rmSync(DOCTOR_BUILD_DIST_PATH, { force: true, recursive: true });
  try {
    runCommand("npm", ["run", "build"], {
      NEXT_DIST_DIR: DOCTOR_BUILD_DIST_DIR
    });
  } finally {
    restoreTypeFiles();
  }
  if (!problems.length) rmSync(DOCTOR_BUILD_DIST_PATH, { force: true, recursive: true });
  warnings.push("本次是隔离构建检查，不会生成给 npm run app:start 使用的 .next。正式部署构建请执行 npm run app:build。");
} else {
  warnings.push("未运行生产构建检查。正式部署前请执行 npm run app:doctor -- --with-build。");
}

printResult();

if (problems.length) process.exit(1);

function checkPackageScripts() {
  const packageJson = readJson("package.json", ROOT_DIR);
  if (!packageJson) return;
  const requiredScripts = [
    "dev",
    "build",
    "app:build",
    "app:smoke",
    "app:status",
    "app:trial-check",
    "app:release-check",
    "app:preview",
    "app:start",
    "data:backup",
    "data:check",
    "data:list",
    "data:repair",
    "data:restore",
    "data:restore-latest",
    "data:restore-manual",
    "auth:secret",
    "user:reset-password"
  ];

  for (const scriptName of requiredScripts) {
    if (!packageJson.scripts?.[scriptName]) problems.push(`package.json 缺少脚本：${scriptName}`);
  }
}

function checkScriptRootDetection() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const cwdCall = "process." + "cwd()";
  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs")) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (source.includes(cwdCall)) {
      problems.push(`${relativePath(filePath)} 不应依赖 ${cwdCall} 推导项目根目录；请使用 import.meta.url 按脚本位置推导。`);
    }
  }
}

function checkScriptNetworkUrlHelpers() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const networkApiName = "network" + "Interfaces";
  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || fileName === "network-urls.mjs") continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (source.includes(networkApiName)) {
      problems.push(`${relativePath(filePath)} 应复用 scripts/network-urls.mjs 生成手机同 Wi-Fi 地址，避免重复维护局域网地址逻辑。`);
    }
  }
}

function checkScriptAppHealthHelpers() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const httpImport = "node:" + "http";
  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || fileName === "app-health-check.mjs") continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (source.includes(httpImport)) {
      problems.push(`${relativePath(filePath)} 应复用 scripts/app-health-check.mjs 探测应用健康状态，避免重复维护 /api/health 端口检查逻辑。`);
    }
  }
}

function checkScriptLocalAccessErrorHelpers() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const blockedErrorCodes = ["EP" + "ERM", "EA" + "CCES"];
  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || fileName === "local-access-error.mjs") continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (blockedErrorCodes.some((code) => source.includes(code))) {
      problems.push(`${relativePath(filePath)} 应复用 scripts/local-access-error.mjs 判断本机端口访问权限错误，避免重复维护 ${blockedErrorCodes.join("/")} 逻辑。`);
    }
  }
}

function checkScriptNpmRunnerUsage() {
  const scriptNames = ["trial-check.mjs", "release-check.mjs", "production-build.mjs"];
  for (const fileName of scriptNames) {
    const filePath = join(ROOT_DIR, "scripts", fileName);
    if (!existsSync(filePath)) {
      problems.push(`缺少脚本：${relativePath(filePath)}`);
      continue;
    }

    const source = readFileSync(filePath, "utf8");
    if (!source.includes("import { runNpmCommand } from \"./npm-runner.mjs\"") || !source.includes("runNpmCommand(")) {
      problems.push(`${relativePath(filePath)} 应复用 scripts/npm-runner.mjs 执行同步 npm 命令，避免重复维护退出码处理。`);
    }
  }
}

function checkScriptNpmCommandConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["npm-runner.mjs"]);
  const npmPlatformSnippet = "process.platform === \"win32\"";

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (source.includes(npmPlatformSnippet)) {
      problems.push(`${relativePath(filePath)} 应复用 scripts/npm-runner.mjs 的 npmCommand，避免重复维护 npm/npm.cmd 判断。`);
    }
  }
}

function checkScriptDataFileConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["data-files.mjs"]);
  const dataStorageNames = [
    ...criticalDataFileNames,
    autoSnapshotDirName,
    manualBackupDirName,
    manualBackupSnapshotDirName
  ];

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const dataStorageName of dataStorageNames) {
      if (sourceIncludesStringLiteral(source, dataStorageName)) {
        problems.push(`${relativePath(filePath)} 不应手写 ${dataStorageName}，请复用 scripts/data-files.mjs。`);
      }
    }
  }
}

function checkScriptFamilyUserConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["family-users.mjs"]);

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const userId of familyUserIds) {
      if (source.includes(`"${userId}"`)) {
        problems.push(`${relativePath(filePath)} 不应手写家庭成员 ID "${userId}"，请复用 scripts/family-users.mjs。`);
      }
    }
  }
}

function checkScriptTaskValueConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["reminder-types.mjs", "task-values.mjs"]);
  const taskValues = [
    ...taskCategoryValues,
    ...taskPriorityValues,
    ...taskStatusValues,
    ...taskTimeBucketValues
  ];

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const taskValue of taskValues) {
      if (source.includes(`"${taskValue}"`)) {
        problems.push(`${relativePath(filePath)} 不应手写任务值 "${taskValue}"，请复用 scripts/task-values.mjs。`);
      }
    }
  }
}

function checkScriptAuthConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["auth-values.mjs"]);
  const authStringValues = [
    authCookieName,
    authCookieVersion,
    defaultFamilyPassword,
    localDevAuthSecret,
    authSecretPlaceholderSnippet
  ];

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const authStringValue of authStringValues) {
      if (sourceIncludesStringLiteral(source, authStringValue)) {
        problems.push(`${relativePath(filePath)} 不应手写登录常量 "${authStringValue}"，请复用 scripts/auth-values.mjs。`);
      }
    }
  }
}

function checkLoginRateLimitConstantsUsage() {
  const rateLimitPath = join(ROOT_DIR, "lib", "server-login-rate-limit.ts");
  const smokePath = join(ROOT_DIR, "scripts", "smoke-test.mjs");

  if (!existsSync(rateLimitPath)) {
    problems.push("缺少登录限速模块：lib/server-login-rate-limit.ts");
  } else {
    const source = readFileSync(rateLimitPath, "utf8");
    if (!source.includes("maxFailedLoginAttempts")) {
      problems.push("lib/server-login-rate-limit.ts 应复用 lib/auth-values.ts 的 maxFailedLoginAttempts。");
    }
    if (source.includes("MAX_FAILED_ATTEMPTS")) {
      problems.push("lib/server-login-rate-limit.ts 不应重新定义 MAX_FAILED_ATTEMPTS，请复用 lib/auth-values.ts。");
    }
  }

  if (!existsSync(smokePath)) {
    problems.push("缺少冒烟测试脚本：scripts/smoke-test.mjs");
  } else {
    const source = readFileSync(smokePath, "utf8");
    if (!source.includes("maxFailedLoginAttempts")) {
      problems.push("scripts/smoke-test.mjs 应复用 scripts/auth-values.mjs 的 maxFailedLoginAttempts。");
    }
    if (source.includes("<= 5")) {
      problems.push("scripts/smoke-test.mjs 不应手写登录限速次数前置尝试数量，请复用 maxFailedLoginAttempts。");
    }
  }
}

function checkScriptReminderSettingsConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["doctor.mjs", "reminder-settings.mjs"]);

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const key of reminderSettingKeys) {
      if (source.includes(`"${key}"`)) {
        problems.push(`${relativePath(filePath)} 不应手写提醒设置键 "${key}"，请复用 scripts/reminder-settings.mjs。`);
      }
    }
  }
}

function checkScriptReminderTypeConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["doctor.mjs", "reminder-types.mjs"]);
  const reminderTypeValues = [dueSoonReminderType, rewardPendingReminderType];

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const reminderType of reminderTypeValues) {
      if (sourceIncludesStringLiteral(source, reminderType)) {
        problems.push(`${relativePath(filePath)} 不应手写提醒类型 "${reminderType}"，请复用 scripts/reminder-types.mjs。`);
      }
    }
  }
}

function checkScriptPetConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["doctor.mjs", "pet-values.mjs", "smoke-test.mjs"]);

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    if (source.includes("PET_BASE_FLOWERS") || source.includes("STARS_PER_LEVEL")) {
      problems.push(`${relativePath(filePath)} 不应本地维护小精灵数值常量，请复用 scripts/pet-values.mjs。`);
    }
  }
}

function checkScriptTaskLimitConstantsUsage() {
  const scriptsDir = join(ROOT_DIR, "scripts");
  const allowedFiles = new Set(["doctor.mjs", "smoke-test.mjs", "task-limits.mjs"]);
  const forbiddenSnippets = [
    ".slice(0, 300)",
    "length > 300",
    "Math.min(value, 99)",
    "value <= 3",
    "day <= 7"
  ];

  for (const fileName of readdirSync(scriptsDir)) {
    if (!fileName.endsWith(".mjs") || allowedFiles.has(fileName)) continue;
    const filePath = join(scriptsDir, fileName);
    const source = readFileSync(filePath, "utf8");
    for (const snippet of forbiddenSnippets) {
      if (source.includes(snippet)) {
        problems.push(`${relativePath(filePath)} 不应手写任务边界 ${snippet}，请复用 scripts/task-limits.mjs。`);
      }
    }
  }
}

function checkDataDirAccess() {
  const dataDirSourcePath = join(ROOT_DIR, "scripts", "data-dir.mjs");
  if (existsSync(dataDirSourcePath)) {
    const dataDirSource = readFileSync(dataDirSourcePath, "utf8");
    if (!dataDirSource.includes("getConfiguredValue(rootDir, [\"SUPER_FAMILY_DATA_DIR\"])")) {
      problems.push("数据脚本应读取 .env.local/.env 里的 SUPER_FAMILY_DATA_DIR，避免脚本和 Next 应用使用不同数据目录。");
    }
  }

  if (!canWriteDataDir(ROOT_DIR)) {
    problems.push(`数据目录不可读写：${DATA_DIR}`);
  }
}

function checkSmokeArtifacts() {
  const smokeDistDir = join(ROOT_DIR, ".next-smoke");
  if (existsSync(smokeDistDir)) {
    warnings.push("检测到 .next-smoke 冒烟测试缓存目录；如果不是正在排查失败，可以删除它。");
  }
  if (existsSync(DOCTOR_BUILD_DIST_PATH)) {
    warnings.push(`检测到 ${DOCTOR_BUILD_DIST_DIR} 构建检查缓存目录；如果不是正在排查失败，可以删除它。`);
  }
}

function checkTypeFileReferences() {
  const forbiddenDistDirs = [".next-smoke", DOCTOR_BUILD_DIST_DIR];
  const filesToCheck = [
    { label: "tsconfig.json", path: TSCONFIG_PATH },
    { label: "next-env.d.ts", path: NEXT_ENV_PATH }
  ];

  for (const file of filesToCheck) {
    if (!existsSync(file.path)) {
      problems.push(`缺少类型配置文件：${file.label}`);
      continue;
    }

    const source = readFileSync(file.path, "utf8");
    for (const distDir of forbiddenDistDirs) {
      if (source.includes(distDir)) {
        problems.push(`${file.label} 仍引用隔离检查目录 ${distDir}，请恢复为 .next 类型引用。`);
      }
    }
  }
}

function checkSharedAppMetadataConstants() {
  const expectedValues = {
    appServiceName
  };
  const sharedAppMetadataModules = [
    "lib/app-metadata.ts",
    "scripts/app-metadata.mjs"
  ];

  for (const filePath of sharedAppMetadataModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少应用元数据常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少应用元数据常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function checkSharedApiPathConstants() {
  const expectedValues = {
    authChangePasswordApiPath,
    authLoginApiPath,
    authLogoutApiPath,
    backupsApiPath,
    eventsApiPath,
    healthApiPath,
    meApiPath,
    petApiPath,
    petFeedApiPath,
    remindersApiPath,
    settingsApiPath,
    tasksApiPath,
    trashApiPath
  };
  const sharedApiPathModules = [
    "lib/api-paths.ts",
    "scripts/api-paths.mjs"
  ];

  for (const filePath of sharedApiPathModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少 API 路径常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少 API 路径常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }

    for (const helperName of [
      "taskApiPath",
      "taskCommentsApiPath",
      "taskCompleteApiPath",
      "taskConfirmRewardApiPath",
      "taskRestoreApiPath",
      "taskUncompleteApiPath"
    ]) {
      if (!source.includes(`function ${helperName}(`)) {
        problems.push(`${filePath} 缺少 API 路径生成函数：${helperName}`);
      }
    }
  }
}

function checkSharedHttpHeaderConstants() {
  const expectedValues = {
    cacheControlHeaderName,
    connectionHeaderName,
    contentTypeHeaderName,
    eventStreamCacheControlValue,
    eventStreamContentType,
    jsonContentType,
    keepAliveConnectionValue,
    noStoreCacheControlDirective,
    noStoreCacheControlValue,
    retryAfterHeaderName
  };
  const sharedHttpHeaderModules = [
    "lib/http-headers.ts",
    "scripts/http-headers.mjs"
  ];

  for (const filePath of sharedHttpHeaderModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少 HTTP header 常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少 HTTP header 常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function checkSharedDataFileConstants() {
  const expectedFileNames = {
    autoSnapshotDirName,
    manualBackupDirName,
    manualBackupSnapshotDirName,
    petStoreFileName,
    taskStoreFileName,
    userStoreFileName
  };
  const sharedDataFileModules = [
    "lib/data-files.ts",
    "scripts/data-files.mjs"
  ];

  for (const filePath of sharedDataFileModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少数据文件常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedFileNames)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少数据存储常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function checkSharedDataSafetyConstants() {
  const expectedValues = {
    manualBackupStaleDays,
    manualBackupWarningCount
  };
  const sharedDataSafetyModules = [
    "lib/data-safety-values.ts",
    "scripts/data-safety-values.mjs"
  ];

  for (const filePath of sharedDataSafetyModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少数据安全常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedNumberConst(source, exportName);
      if (actualValue === undefined) {
        problems.push(`${filePath} 缺少数据安全常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function readExportedStringConst(source, exportName) {
  const match = new RegExp(`export const ${exportName} = "((?:\\\\.|[^"])*)"[^;]*;`).exec(source);
  if (!match) return "";
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

function sourceIncludesStringLiteral(source, value) {
  return new RegExp(`(["'\`])${escapeRegExp(value)}\\1`).test(source);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function checkSharedAuthConstants() {
  const expectedValues = {
    authCookieName,
    authCookieVersion,
    authSecretPlaceholderSnippet,
    defaultFamilyPassword,
    localDevAuthSecret,
    maxFailedLoginAttempts,
    maxPasswordLength,
    minPasswordLength
  };
  const sharedAuthModules = [
    "lib/auth-values.ts",
    "scripts/auth-values.mjs"
  ];

  for (const filePath of sharedAuthModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少登录常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue =
        typeof expectedValue === "number"
          ? readExportedNumberConst(source, exportName)
          : readExportedStringConst(source, exportName);
      if (actualValue === undefined || actualValue === "") {
        problems.push(`${filePath} 缺少登录常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function readExportedNumberConst(source, exportName) {
  const match = new RegExp(`export const ${exportName} = (\\d+);`).exec(source);
  return match ? Number(match[1]) : undefined;
}

function checkSharedApiErrorCodeConstants() {
  const expectedValues = Object.fromEntries(
    Object.entries(apiErrorCodeConstants).filter(([exportName, value]) => exportName.endsWith("Error") && typeof value === "string")
  );
  const sharedApiErrorCodeModules = [
    "lib/api-error-codes.ts",
    "scripts/api-error-codes.mjs"
  ];

  for (const filePath of sharedApiErrorCodeModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少 API 错误码常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少 API 错误码常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function checkSharedServerEventTypeConstants() {
  const expectedValues = {
    tasksChangedEventType,
    petChangedEventType
  };
  const expectedArrayExports = Object.keys(expectedValues);
  const sharedServerEventTypeModules = [
    "lib/server-event-types.ts",
    "scripts/server-event-types.mjs"
  ];

  for (const filePath of sharedServerEventTypeModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少服务端事件类型常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少服务端事件类型常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }

    const actualArrayExports = readConstIdentifierArrayValues(source, "serverEventTypes");
    if (!sameStringList(actualArrayExports, expectedArrayExports)) {
      problems.push(`${filePath} 的 serverEventTypes 应包含：${expectedArrayExports.join(" / ")}。`);
    }
  }
}

function checkSharedServerEventStreamConstants() {
  const expectedValues = {
    connectedStreamData,
    connectedStreamEventType,
    heartbeatStreamComment,
    serverEventHeartbeatMs
  };
  const sharedServerEventStreamModules = [
    "lib/server-event-stream.ts",
    "scripts/server-event-stream.mjs"
  ];

  for (const filePath of sharedServerEventStreamModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少服务端事件流常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue =
        typeof expectedValue === "number"
          ? readExportedNumberConst(source, exportName)
          : readExportedStringConst(source, exportName);
      if (actualValue === undefined || actualValue === "") {
        problems.push(`${filePath} 缺少服务端事件流常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }

    for (const helperName of ["formatConnectedStreamFrame", "formatHeartbeatStreamFrame"]) {
      if (!source.includes(`function ${helperName}(`)) {
        problems.push(`${filePath} 缺少服务端事件流格式化函数：${helperName}`);
      }
    }
  }
}

function checkSharedMainPageConstants() {
  const expectedValues = {
    homePage,
    listPage,
    babyPage,
    mePage,
    settingsPage,
    trashPage,
    remindersPage
  };
  const expectedArrayExports = Object.keys(expectedValues);
  const sharedMainPageModules = [
    "lib/main-pages.ts",
    "scripts/main-pages.mjs"
  ];

  for (const filePath of sharedMainPageModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少主页面常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少主页面常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }

    const actualArrayExports = readConstIdentifierArrayValues(source, "mainPages");
    if (!sameStringList(actualArrayExports, expectedArrayExports)) {
      problems.push(`${filePath} 的 mainPages 应包含：${expectedArrayExports.join(" / ")}。`);
    }
  }
}

function checkSharedFamilyUserConstants() {
  const familyUsersPath = join(ROOT_DIR, "lib", "family-users.ts");
  if (!existsSync(familyUsersPath)) {
    problems.push("缺少家庭成员常量模块：lib/family-users.ts");
    return;
  }

  const appFamilyUsers = readFamilyUsersFromConstants(readFileSync(familyUsersPath, "utf8"));
  if (!appFamilyUsers.length) {
    problems.push("lib/family-users.ts 缺少可检查的 familyUsers 成员清单。");
    return;
  }

  if (appFamilyUsers.length !== scriptFamilyUsers.length) {
    problems.push(`scripts/family-users.mjs 的成员数量应和 lib/family-users.ts 一致：${appFamilyUsers.length} 个。`);
  }

  for (const appUser of appFamilyUsers) {
    const scriptUser = scriptFamilyUsers.find((user) => user.id === appUser.id);
    if (!scriptUser) {
      problems.push(`scripts/family-users.mjs 缺少家庭成员：${appUser.id}`);
      continue;
    }
    if (scriptUser.name !== appUser.name || scriptUser.role !== appUser.role) {
      problems.push(
        `scripts/family-users.mjs 的 ${appUser.id} 应为 ${appUser.name}/${appUser.role}，当前为 ${scriptUser.name}/${scriptUser.role}`
      );
    }
  }
}

function readFamilyUsersFromConstants(source) {
  return scriptFamilyUsers
    .map((user) => {
      const id = readExportedStringConst(source, `${user.id}UserId`);
      const name = readExportedStringConst(source, `${user.id}UserName`);
      return id && name ? { id, name, role: id } : null;
    })
    .filter(Boolean);
}

function checkSharedTaskValueConstants() {
  const typesPath = join(ROOT_DIR, "lib", "types.ts");
  if (!existsSync(typesPath)) {
    problems.push("缺少任务类型定义：lib/types.ts");
    return;
  }

  const expectedValues = {
    childStudyCategory,
    dayAfterTimeBucket,
    doneStatus,
    familyCategory,
    importantPriority,
    normalPriority,
    overdueTimeBucket,
    pastTimeBucket,
    pendingRewardStatus,
    personalCategory,
    todayTimeBucket,
    todoStatus,
    tomorrowTimeBucket,
    urgentPriority,
    weekTimeBucket
  };
  const sharedTaskValueModules = [
    "lib/task-values.ts",
    "scripts/task-values.mjs"
  ];

  for (const filePath of sharedTaskValueModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少任务值常量模块：${filePath}`);
      continue;
    }

    const valueSource = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(valueSource, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少任务值常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }

  const source = readFileSync(typesPath, "utf8");
  const expectations = [
    { label: "TaskCategory", scriptValues: taskCategoryValues },
    { label: "Priority", scriptValues: taskPriorityValues },
    { label: "TaskStatus", scriptValues: taskStatusValues },
    { label: "TaskTimeBucket", scriptValues: taskTimeBucketValues }
  ];

  for (const expectation of expectations) {
    const typeValues = readStringUnionTypeValues(source, expectation.label);
    if (!typeValues.length) {
      problems.push(`lib/types.ts 缺少可检查的 ${expectation.label} 联合类型。`);
      continue;
    }
    if (!sameStringList(typeValues, expectation.scriptValues)) {
      problems.push(
        `scripts/task-values.mjs 的 ${expectation.label} 值应和 lib/types.ts 一致：${typeValues.join(" / ")}。`
      );
    }
  }
}

function checkSharedTaskLabels() {
  const labelsPath = join(ROOT_DIR, "lib", "task-labels.ts");
  if (!existsSync(labelsPath)) {
    problems.push("缺少任务展示标签模块：lib/task-labels.ts");
    return;
  }

  const source = readFileSync(labelsPath, "utf8");
  const requiredSnippets = [
    "taskCategoryLabels",
    "taskPriorityLabels",
    "taskCategoryOptions",
    "taskPriorityOptions",
    "家庭待办",
    "个人待办",
    "小柚子学习",
    "紧急",
    "重要",
    "普通"
  ];

  for (const snippet of requiredSnippets) {
    if (!source.includes(snippet)) {
      problems.push(`lib/task-labels.ts 缺少任务展示标签内容：${snippet}`);
    }
  }
}

function checkSharedReminderSettingsConstants() {
  const reminderSettingsPath = join(ROOT_DIR, "lib", "reminder-settings.ts");
  if (!existsSync(reminderSettingsPath)) {
    problems.push("缺少提醒设置工具：lib/reminder-settings.ts");
    return;
  }

  const source = readFileSync(reminderSettingsPath, "utf8");
  const tsDefaults = readExportedObjectBooleanValues(source, "defaultReminderSettings");
  if (!Object.keys(tsDefaults).length) {
    problems.push("lib/reminder-settings.ts 缺少可检查的 defaultReminderSettings。");
  } else if (!sameObjectEntries(tsDefaults, defaultReminderSettings)) {
    problems.push("scripts/reminder-settings.mjs 的默认提醒设置应和 lib/reminder-settings.ts 一致。");
  }

  const tsKeys = readConstStringArrayValues(source, "reminderSettingKeys");
  if (!tsKeys.length) {
    problems.push("lib/reminder-settings.ts 缺少可检查的 reminderSettingKeys。");
  } else if (!sameStringList(tsKeys, reminderSettingKeys)) {
    problems.push(`scripts/reminder-settings.mjs 的提醒设置键应和 lib/reminder-settings.ts 一致：${tsKeys.join(" / ")}。`);
  }
}

function checkSharedReminderTypeConstants() {
  const expectedValues = {
    dueSoonReminderType,
    overdueReminderType,
    rewardPendingReminderType
  };
  const sharedReminderTypeModules = [
    "lib/reminder-types.ts",
    "scripts/reminder-types.mjs"
  ];

  for (const filePath of sharedReminderTypeModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少提醒类型常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedStringConst(source, exportName);
      if (!actualValue) {
        problems.push(`${filePath} 缺少提醒类型常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function checkSharedPetConstants() {
  const expectedValues = {
    petBaseFlowers,
    petStarsPerLevel
  };
  const sharedPetModules = [
    "lib/pet-values.ts",
    "scripts/pet-values.mjs"
  ];

  for (const filePath of sharedPetModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少小精灵常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedNumberConst(source, exportName);
      if (actualValue === undefined) {
        problems.push(`${filePath} 缺少小精灵常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function checkSharedTaskLimitConstants() {
  const expectedValues = {
    maxCommentLength,
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
  };
  const sharedTaskLimitModules = [
    "lib/task-limits.ts",
    "scripts/task-limits.mjs"
  ];

  for (const filePath of sharedTaskLimitModules) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少任务边界常量模块：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const [exportName, expectedValue] of Object.entries(expectedValues)) {
      const actualValue = readExportedNumberConst(source, exportName);
      if (actualValue === undefined) {
        problems.push(`${filePath} 缺少任务边界常量：${exportName}`);
      } else if (actualValue !== expectedValue) {
        problems.push(`${filePath} 的 ${exportName} 应为 ${expectedValue}，当前为 ${actualValue}`);
      }
    }
  }
}

function readExportedObjectBooleanValues(source, exportName) {
  const match = new RegExp(`export const ${exportName}[^=]*= \\{([\\s\\S]*?)\\};`).exec(source);
  if (!match) return {};
  return Object.fromEntries(
    Array.from(match[1].matchAll(/(\w+): (true|false)/g)).map((valueMatch) => [
      valueMatch[1],
      valueMatch[2] === "true"
    ])
  );
}

function readConstStringArrayValues(source, constName) {
  const match = new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((valueMatch) => valueMatch[1]);
}

function readConstIdentifierArrayValues(source, constName) {
  const match = new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\]`).exec(source);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[A-Za-z_$][\w$]*$/.test(value));
}

function readStringUnionTypeValues(source, typeName) {
  const match = new RegExp(`export type ${typeName} = ([^;]+);`).exec(source);
  if (!match) return [];
  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((valueMatch) => valueMatch[1]);
}

function sameStringList(first, second) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function sameObjectEntries(first, second) {
  const firstEntries = Object.entries(first);
  const secondEntries = Object.entries(second);
  return (
    firstEntries.length === secondEntries.length &&
    firstEntries.every(([key, value]) => second[key] === value)
  );
}

function checkTypeScriptDataFileConstantsUsage() {
  const allowedFiles = new Set(["lib/data-files.ts"]);
  const dataStorageNames = [
    ...criticalDataFileNames,
    autoSnapshotDirName,
    manualBackupDirName,
    manualBackupSnapshotDirName
  ];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const dataStorageName of dataStorageNames) {
      if (sourceIncludesStringLiteral(source, dataStorageName)) {
        problems.push(`${fileRelativePath} 不应手写 ${dataStorageName}，请复用 lib/data-files.ts。`);
      }
    }
  }
}

function checkTypeScriptApiErrorCodeConstantsUsage() {
  const allowedFiles = new Set(["lib/api-error-codes.ts"]);
  const apiErrorCodes = apiErrorCodeConstants.apiErrorCodes ?? [];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const apiErrorCode of apiErrorCodes) {
      if (sourceIncludesStringLiteral(source, apiErrorCode)) {
        problems.push(`${fileRelativePath} 不应手写 API 错误码 "${apiErrorCode}"，请复用 lib/api-error-codes.ts。`);
      }
    }
  }
}

function checkTypeScriptServerEventTypeConstantsUsage() {
  const allowedFiles = new Set(["lib/server-event-types.ts"]);
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const serverEventType of serverEventTypes) {
      if (sourceIncludesStringLiteral(source, serverEventType)) {
        problems.push(`${fileRelativePath} 不应手写服务端事件类型 "${serverEventType}"，请复用 lib/server-event-types.ts。`);
      }
    }
  }
}

function checkServerEventStreamConstantsUsage() {
  const routePath = join(ROOT_DIR, "app", "api", "events", "route.ts");
  const smokePath = join(ROOT_DIR, "scripts", "smoke-test.mjs");
  const streamStringValues = [
    connectedStreamData,
    connectedStreamEventType,
    heartbeatStreamComment
  ];

  if (!existsSync(routePath)) {
    problems.push("缺少实时事件流接口：app/api/events/route.ts");
  } else {
    const routeSource = readFileSync(routePath, "utf8");
    for (const requiredName of ["formatConnectedStreamFrame", "formatHeartbeatStreamFrame", "serverEventHeartbeatMs"]) {
      if (!routeSource.includes(requiredName)) {
        problems.push(`app/api/events/route.ts 应复用 lib/server-event-stream.ts 的 ${requiredName}。`);
      }
    }
    for (const streamStringValue of streamStringValues) {
      if (sourceIncludesStringLiteral(routeSource, streamStringValue)) {
        problems.push(`app/api/events/route.ts 不应手写服务端事件流常量 "${streamStringValue}"，请复用 lib/server-event-stream.ts。`);
      }
    }
  }

  if (!existsSync(smokePath)) {
    problems.push("缺少冒烟测试脚本：scripts/smoke-test.mjs");
  } else {
    const smokeSource = readFileSync(smokePath, "utf8");
    if (!smokeSource.includes("connectedStreamEventType")) {
      problems.push("scripts/smoke-test.mjs 应复用 scripts/server-event-stream.mjs 的 connectedStreamEventType。");
    }
    for (const streamStringValue of streamStringValues) {
      if (sourceIncludesStringLiteral(smokeSource, streamStringValue)) {
        problems.push(`scripts/smoke-test.mjs 不应手写服务端事件流常量 "${streamStringValue}"，请复用 scripts/server-event-stream.mjs。`);
      }
    }
  }
}

function checkTypeScriptMainPageConstantsUsage() {
  const allowedFiles = new Set(["lib/main-pages.ts"]);
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];
  const mainPageContextPattern = /\b(activePage|setActivePage|changeActivePage|MainPage)\b/;

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      if (!mainPageContextPattern.test(line)) return;
      for (const mainPage of mainPages) {
        if (sourceIncludesStringLiteral(line, mainPage)) {
          problems.push(
            `${fileRelativePath}:${index + 1} 不应手写主页面标识 "${mainPage}"，请复用 lib/main-pages.ts。`
          );
        }
      }
    });
  }
}

function checkTypeScriptAppMetadataConstantsUsage() {
  const allowedFiles = new Set(["lib/app-metadata.ts"]);
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    if (sourceIncludesStringLiteral(source, appServiceName)) {
      problems.push(`${fileRelativePath} 不应手写应用服务标识 "${appServiceName}"，请复用 lib/app-metadata.ts。`);
    }
  }
}

function checkScriptAppMetadataConstantsUsage() {
  const allowedFiles = new Set(["scripts/app-metadata.mjs"]);
  const filesToCheck = listScriptFiles(join(ROOT_DIR, "scripts"));

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    if (sourceIncludesStringLiteral(source, appServiceName)) {
      problems.push(`${fileRelativePath} 不应手写应用服务标识 "${appServiceName}"，请复用 scripts/app-metadata.mjs。`);
    }
  }
}

function checkTypeScriptApiPathConstantsUsage() {
  const allowedFiles = new Set(["lib/api-paths.ts"]);
  const apiPaths = [
    authChangePasswordApiPath,
    authLoginApiPath,
    authLogoutApiPath,
    backupsApiPath,
    eventsApiPath,
    healthApiPath,
    meApiPath,
    petApiPath,
    petFeedApiPath,
    remindersApiPath,
    settingsApiPath,
    tasksApiPath,
    trashApiPath
  ];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const apiPath of apiPaths) {
      if (source.includes(apiPath)) {
        problems.push(`${fileRelativePath} 不应手写 API 路径 "${apiPath}"，请复用 lib/api-paths.ts。`);
      }
    }
  }
}

function checkScriptApiPathConstantsUsage() {
  const allowedFiles = new Set(["scripts/api-paths.mjs", "scripts/doctor.mjs"]);
  const apiPaths = [
    authChangePasswordApiPath,
    authLoginApiPath,
    authLogoutApiPath,
    backupsApiPath,
    eventsApiPath,
    healthApiPath,
    meApiPath,
    petApiPath,
    petFeedApiPath,
    remindersApiPath,
    settingsApiPath,
    tasksApiPath,
    trashApiPath
  ];
  const filesToCheck = listScriptFiles(join(ROOT_DIR, "scripts"));

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const apiPath of apiPaths) {
      if (source.includes(apiPath)) {
        problems.push(`${fileRelativePath} 不应手写 API 路径 "${apiPath}"，请复用 scripts/api-paths.mjs。`);
      }
    }
  }
}

function checkTypeScriptHttpHeaderConstantsUsage() {
  const allowedFiles = new Set(["lib/http-headers.ts"]);
  const headerValues = [
    cacheControlHeaderName,
    connectionHeaderName,
    contentTypeHeaderName,
    eventStreamCacheControlValue,
    eventStreamContentType,
    jsonContentType,
    keepAliveConnectionValue,
    noStoreCacheControlDirective,
    noStoreCacheControlValue,
    retryAfterHeaderName
  ];
  const middlewarePath = join(ROOT_DIR, "middleware.ts");
  const filesToCheck = [
    ...(existsSync(middlewarePath) ? [middlewarePath] : []),
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const headerValue of headerValues) {
      if (sourceIncludesStringLiteral(source, headerValue)) {
        problems.push(`${fileRelativePath} 不应手写 HTTP header 常量 "${headerValue}"，请复用 lib/http-headers.ts。`);
      }
    }
  }
}

function checkScriptHttpHeaderConstantsUsage() {
  const allowedFiles = new Set(["scripts/doctor.mjs", "scripts/http-headers.mjs"]);
  const headerValues = [
    cacheControlHeaderName,
    connectionHeaderName,
    contentTypeHeaderName,
    eventStreamCacheControlValue,
    eventStreamContentType,
    jsonContentType,
    keepAliveConnectionValue,
    noStoreCacheControlDirective,
    noStoreCacheControlValue,
    retryAfterHeaderName
  ];
  const filesToCheck = listScriptFiles(join(ROOT_DIR, "scripts"));

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const headerValue of headerValues) {
      if (sourceIncludesStringLiteral(source, headerValue)) {
        problems.push(`${fileRelativePath} 不应手写 HTTP header 常量 "${headerValue}"，请复用 scripts/http-headers.mjs。`);
      }
    }
  }
}

function checkTypeScriptAuthConstantsUsage() {
  const allowedFiles = new Set(["lib/auth-values.ts"]);
  const authStringValues = [
    authCookieName,
    authCookieVersion,
    defaultFamilyPassword,
    localDevAuthSecret,
    authSecretPlaceholderSnippet
  ];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const authStringValue of authStringValues) {
      if (sourceIncludesStringLiteral(source, authStringValue)) {
        problems.push(`${fileRelativePath} 不应手写登录常量 "${authStringValue}"，请复用 lib/auth-values.ts。`);
      }
    }
  }
}

function checkTypeScriptFamilyUserConstantsUsage() {
  const allowedFiles = new Set(["lib/family-users.ts", "lib/mock-data.ts", "lib/types.ts"]);
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const userId of familyUserIds) {
      if (source.includes(`"${userId}"`)) {
        problems.push(`${fileRelativePath} 不应手写家庭成员 ID "${userId}"，请复用 lib/family-users.ts。`);
      }
    }
  }
}

function checkTypeScriptReminderSettingsConstantsUsage() {
  const allowedFiles = new Set(["lib/reminder-settings.ts", "lib/types.ts"]);
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const key of reminderSettingKeys) {
      if (sourceIncludesStringLiteral(source, key)) {
        problems.push(`${fileRelativePath} 不应手写提醒设置键 "${key}"，请复用 lib/reminder-settings.ts。`);
      }
    }
  }
}

function checkTypeScriptReminderTypeConstantsUsage() {
  const allowedFiles = new Set(["lib/reminder-types.ts"]);
  const reminderTypeValues = [dueSoonReminderType, rewardPendingReminderType];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const reminderType of reminderTypeValues) {
      if (sourceIncludesStringLiteral(source, reminderType)) {
        problems.push(`${fileRelativePath} 不应手写提醒类型 "${reminderType}"，请复用 lib/reminder-types.ts。`);
      }
    }
  }
}

function checkTypeScriptTaskValueConstantsUsage() {
  const allowedFiles = new Set(["lib/mock-data.ts", "lib/reminder-types.ts", "lib/task-values.ts", "lib/types.ts"]);
  const taskValues = [
    ...taskCategoryValues,
    ...taskPriorityValues,
    ...taskStatusValues,
    ...taskTimeBucketValues
  ];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const taskValue of taskValues) {
      if (source.includes(`"${taskValue}"`)) {
        problems.push(`${fileRelativePath} 不应手写任务值 "${taskValue}"，请复用 lib/task-values.ts。`);
      }
    }
  }
}

function checkTypeScriptTaskUpdateScopeConstantsUsage() {
  const allowedFiles = new Set(["lib/task-update-scope.ts"]);
  const taskUpdateScopes = ["single", "series"];
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const taskUpdateScope of taskUpdateScopes) {
      if (sourceIncludesStringLiteral(source, taskUpdateScope)) {
        problems.push(`${fileRelativePath} 不应手写任务更新范围 "${taskUpdateScope}"，请复用 lib/task-update-scope.ts。`);
      }
    }
  }
}

function checkTypeScriptTaskLabelConstantsUsage() {
  const displayFiles = [
    "app/page.tsx",
    "components/task-card.tsx",
    "components/task-detail-sheet.tsx",
    "components/task-form-sheet.tsx"
  ];
  const forbiddenSnippets = [
    "const categoryLabel",
    "const priorityLabel",
    ">家庭待办<",
    ">个人待办<",
    ">小柚子学习<",
    ">紧急<",
    ">重要<",
    ">普通<",
    "\"家庭待办\"",
    "\"个人待办\"",
    "\"小柚子学习\"",
    "\"紧急\"",
    "\"重要\"",
    "\"普通\""
  ];

  for (const filePath of displayFiles) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少任务展示文件：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    for (const snippet of forbiddenSnippets) {
      if (source.includes(snippet)) {
        problems.push(`${filePath} 不应手写任务展示标签 ${snippet}，请复用 lib/task-labels.ts。`);
      }
    }
  }
}

function checkTypeScriptTaskLimitConstantsUsage() {
  const allowedFiles = new Set(["lib/task-limits.ts"]);
  const filesToCheck = [
    ...listTypeScriptFiles(join(ROOT_DIR, "app")),
    ...listTypeScriptFiles(join(ROOT_DIR, "components")),
    ...listTypeScriptFiles(join(ROOT_DIR, "lib"))
  ];
  const forbiddenSnippets = [
    ".max(80)",
    ".max(500)",
    ".max(40)",
    ".max(3)",
    ".max(7)",
    ".max(99)",
    ".slice(0, 80)",
    "maxLength={80}",
    "maxLength={500}",
    "maxLength={300}",
    "Math.min(days, 3)",
    "Math.min(99",
    "Math.min(value.rewardStars, 99)",
    "day <= 7"
  ];

  for (const filePath of filesToCheck) {
    const fileRelativePath = relativePath(filePath);
    if (allowedFiles.has(fileRelativePath)) continue;
    const source = readFileSync(filePath, "utf8");
    for (const snippet of forbiddenSnippets) {
      if (source.includes(snippet)) {
        problems.push(`${fileRelativePath} 不应手写任务边界 ${snippet}，请复用 lib/task-limits.ts。`);
      }
    }
  }
}

function checkDocs() {
  const requiredDocs = [
    "DATA_AND_API.md",
    "DEPLOYMENT.md",
    "PRD.md",
    "RELEASE_CHECKLIST.md",
    "TECHNICAL_DESIGN.md",
    "TRIAL_GUIDE.md",
    "UI_DESIGN.md"
  ];

  for (const docPath of requiredDocs) {
    const absolutePath = join(DOCS_DIR, docPath);
    if (!existsSync(absolutePath)) problems.push(`缺少文档：docs/${docPath}`);
    else if (statSync(absolutePath).size <= 0) problems.push(`文档为空：docs/${docPath}`);
  }

  const uiDesignPath = join(DOCS_DIR, "UI_DESIGN.md");
  if (existsSync(uiDesignPath)) {
    const uiDesignSource = readFileSync(uiDesignPath, "utf8");
    if (/\bbaby\s+page\b/i.test(uiDesignSource)) {
      problems.push("docs/UI_DESIGN.md 仍包含旧命名 Baby page，应统一为“小柚子页”。");
    }
  }
}

function checkBackupReadmeHelpers() {
  const helpers = [
    "scripts/backup-readme.mjs",
    "lib/backup-readme.ts"
  ];
  const requiredSnippets = [
    "关键文件状态",
    ...criticalDataFileNames,
    "data:restore-manual -- latest"
  ];
  const dataFilesSourcePaths = [
    join(ROOT_DIR, "lib/data-files.ts"),
    join(ROOT_DIR, "scripts/data-files.mjs")
  ];
  const dataFilesSource = dataFilesSourcePaths
    .filter((sourcePath) => existsSync(sourcePath))
    .map((sourcePath) => readFileSync(sourcePath, "utf8"))
    .join("\n");

  for (const filePath of helpers) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少备份说明模板：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    const usesSharedDataFiles = source.includes("@/lib/data-files") || source.includes("./data-files.mjs");
    const searchableSource = usesSharedDataFiles ? `${source}\n${dataFilesSource}` : source;
    for (const snippet of requiredSnippets) {
      if (!searchableSource.includes(snippet)) {
        problems.push(`${filePath} 缺少备份说明关键内容：${snippet}`);
      }
    }
  }
}

function checkBackupDirectorySafety() {
  const backupScripts = [
    "lib/server-data-backup.ts",
    "scripts/backup-data.mjs",
    "scripts/restore-manual-backup.mjs",
    "scripts/repair-data.mjs"
  ];

  for (const filePath of backupScripts) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少备份目录安全文件：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    if (!source.includes("createUniqueBackupDir")) {
      problems.push(`${filePath} 创建手动备份目录时应避让重名目录，避免极短时间内重复备份互相覆盖。`);
    }
  }
}

function checkBackupCreationDurability() {
  const backupWriters = [
    "lib/server-data-backup.ts",
    "scripts/backup-data.mjs",
    "scripts/restore-manual-backup.mjs",
    "scripts/repair-data.mjs"
  ];

  for (const filePath of backupWriters) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少备份写入文件：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    if (!source.includes("fsyncSync")) {
      problems.push(`${filePath} 创建备份文件时应刷盘，避免刚备份完断电导致备份不完整。`);
    }
    if (!source.includes("syncDirectoryBestEffort")) {
      problems.push(`${filePath} 创建备份文件后应尽量同步备份目录。`);
    }
    if (!source.includes("writeTextDurably")) {
      problems.push(`${filePath} 备份 README 应使用耐久写入。`);
    }
  }
}

function checkEnvironment() {
  if (!isUsableSecret(getConfiguredSecret(ROOT_DIR, ["AUTH_SECRET", "NEXTAUTH_SECRET"]))) {
    warnings.push("当前未设置 AUTH_SECRET。正式部署前请配置一个足够长的随机密钥，用于登录 cookie 签名。");
  }
}

function isUsableSecret(value) {
  return Boolean(value && value !== localDevAuthSecret && !value.includes(authSecretPlaceholderSnippet));
}

function checkPublicAssets() {
  const requiredAssets = [
    "manifest.webmanifest",
    "sw.js",
    "icon.svg",
    "icon-192.png",
    "icon-512.png",
    "avatars/child.png",
    "avatars/mom.png",
    "avatars/dad.png"
  ];

  for (const assetPath of requiredAssets) {
    const absolutePath = join(PUBLIC_DIR, assetPath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少资源文件：public/${assetPath}`);
      continue;
    }
    if (statSync(absolutePath).size <= 0) problems.push(`资源文件为空：public/${assetPath}`);
  }

  const manifest = readJson("manifest.webmanifest", PUBLIC_DIR);
  if (manifest) {
    if (manifest.name !== "超人家族任务清单") warnings.push("manifest.webmanifest 应用名称不是“超人家族任务清单”。");
    if (manifest.display !== "standalone") warnings.push("manifest.webmanifest display 不是 standalone。");
    if (!Array.isArray(manifest.icons) || manifest.icons.length < 3) {
      warnings.push("manifest.webmanifest 建议同时包含 SVG、192 PNG 和 512 PNG 图标。");
    }
  }

  const swPath = join(PUBLIC_DIR, "sw.js");
  if (existsSync(swPath)) {
    const swSource = readFileSync(swPath, "utf8");
    if (!swSource.includes("event.request.method !== \"GET\"")) {
      problems.push("public/sw.js 应跳过非 GET 请求，避免误缓存表单或其他写入请求。");
    }
    if (!swSource.includes("requestUrl.pathname.startsWith(\"/api/\")")) {
      problems.push("public/sw.js 应跳过 /api/ 请求，避免任务数据被缓存。");
    }
    if (!swSource.includes("event.request.mode === \"navigate\"") || !swSource.includes("event.respondWith(fetch(event.request))")) {
      problems.push("public/sw.js 页面导航应走网络请求，避免手机长期卡在旧界面。");
    }
    if (!swSource.includes("if (!APP_SHELL.includes(requestUrl.pathname))")) {
      problems.push("public/sw.js 应只缓存 manifest 和图标，其他前端资源走网络，避免手机看到旧界面。");
    }
  }
}

function checkProductionBuildGuard() {
  const productionBuildPath = join(ROOT_DIR, "scripts", "production-build.mjs");
  if (!existsSync(productionBuildPath)) {
    problems.push("缺少正式构建脚本：scripts/production-build.mjs");
    return;
  }

  const source = readFileSync(productionBuildPath, "utf8");
  if (!source.includes("ensureNoRunningAppOnBuildPort")) {
    problems.push("正式构建前应检查当前应用是否仍在运行，避免一边预览一边覆盖 .next。");
  }
  if (!source.includes("import { getConfiguredPort } from \"./env.mjs\"") || !source.includes("getConfiguredPort(ROOT_DIR")) {
    problems.push("正式构建脚本应复用 scripts/env.mjs 读取端口配置，确保 .env.local/.env 中的端口也参与运行中服务检查。");
  }
  if (!source.includes("app:preview") || !source.includes("app:start")) {
    problems.push("正式构建保护提示应说明先停止 app:preview 或 app:start。");
  }
  if (source.includes("将继续构建")) {
    problems.push("正式构建脚本无法检查端口时不应继续构建，避免覆盖正在运行中的 .next。");
  }
  if (!source.includes("无法检查") || !source.includes("process.exit(1);")) {
    problems.push("正式构建脚本在端口检查失败时应明确停止。");
  }
}

function checkAuthCookieConsistency() {
  const authPath = join(ROOT_DIR, "lib", "server-auth.ts");
  if (!existsSync(authPath)) {
    problems.push("缺少登录会话工具：lib/server-auth.ts");
    return;
  }

  const authSource = readFileSync(authPath, "utf8");
  if (!authSource.includes("getAuthCookieOptions") || !authSource.includes("getClearAuthCookieOptions")) {
    problems.push("登录 cookie 参数应集中在 lib/server-auth.ts，避免登录、退出、改密码设置不一致。");
  }
  if (!authSource.includes("httpOnly: true") || !authSource.includes("sameSite: \"lax\"") || !authSource.includes("secure: process.env.NODE_ENV === \"production\"")) {
    problems.push("登录 cookie 应保持 HttpOnly、SameSite=Lax，并在生产环境启用 Secure。");
  }

  const authRoutes = [
    "app/api/auth/login/route.ts",
    "app/api/auth/logout/route.ts",
    "app/api/auth/change-password/route.ts"
  ];
  for (const filePath of authRoutes) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少登录接口文件：${filePath}`);
      continue;
    }
    const source = readFileSync(absolutePath, "utf8");
    if (source.includes("sameSite:") || source.includes("httpOnly:") || source.includes("secure: process.env.NODE_ENV")) {
      problems.push(`${filePath} 不应手写 cookie 安全参数，请使用 lib/server-auth.ts 的统一函数。`);
    }
  }
}

function checkJsonStoreDurability() {
  const jsonStorePath = join(ROOT_DIR, "lib", "server-json-store.ts");
  if (!existsSync(jsonStorePath)) {
    problems.push("缺少 JSON 存储文件：lib/server-json-store.ts");
    return;
  }

  const source = readFileSync(jsonStorePath, "utf8");
  if (!source.includes("randomUUID()") || !source.includes(".tmp")) {
    problems.push("JSON 写入应先写入唯一临时文件，避免半截文件覆盖主数据。");
  }
  if (!source.includes("renameSync(tempFilePath, filePath)")) {
    problems.push("JSON 写入应通过 renameSync 原子替换主数据文件。");
  }
  if (!source.includes("fsyncSync")) {
    problems.push("JSON 临时文件写入后应 fsyncSync 刷盘，降低突然断电时的数据风险。");
  }
  if (!source.includes("syncDirectoryBestEffort(dirname(filePath))")) {
    problems.push("JSON 原子替换后应尽量同步数据目录，降低目录项未落盘风险。");
  }
  if (!source.includes("copyFileSync(filePath, backupFilePath)") || !source.includes("writeSnapshot(filePath)")) {
    problems.push("JSON 写入前应保留 .bak 和自动快照。");
  }
}

function checkDataToolDurability() {
  const durableWriteScripts = [
    "scripts/restore-data.mjs",
    "scripts/reset-password.mjs",
    "scripts/repair-data.mjs",
    "scripts/restore-manual-backup.mjs"
  ];

  for (const filePath of durableWriteScripts) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少数据工具脚本：${filePath}`);
      continue;
    }

    const source = readFileSync(absolutePath, "utf8");
    if (!source.includes("randomUUID()") || !source.includes(".tmp")) {
      problems.push(`${filePath} 写入真实数据时应先写入唯一临时文件。`);
    }
    if (!source.includes("fsyncSync")) {
      problems.push(`${filePath} 写入真实数据时应刷盘后再替换目标文件。`);
    }
    if (!source.includes("renameSync")) {
      problems.push(`${filePath} 写入真实数据时应通过 renameSync 原子替换。`);
    }
    if (!source.includes("syncDirectoryBestEffort")) {
      problems.push(`${filePath} 写入真实数据后应尽量同步数据目录。`);
    }
  }
}

function checkApiMiddleware() {
  const middlewarePath = join(ROOT_DIR, "middleware.ts");
  if (!existsSync(middlewarePath)) {
    problems.push("缺少 middleware.ts，/api/ 响应需要统一设置 no-store。");
    return;
  }

  const source = readFileSync(middlewarePath, "utf8");
  if (!source.includes("cacheControlHeaderName") || !source.includes("noStoreCacheControlValue")) {
    problems.push("middleware.ts 应为 /api/ 响应设置 Cache-Control: no-store。");
  }
  if (!source.includes("/api/:path*")) {
    problems.push("middleware.ts matcher 应限制到 /api/:path*。");
  }
}

function checkApiRequestBodies() {
  for (const filePath of listRouteFiles(join(ROOT_DIR, "app", "api"))) {
    const source = readFileSync(filePath, "utf8");
    if (source.includes("request.json(") || source.includes(".json()")) {
      problems.push(`${relativePath(filePath)} 直接读取 JSON 请求体，应使用 lib/server-request.ts 的 readJsonBody 限制大小。`);
    }
  }
}

function checkUiCopy() {
  const taskDisplayFiles = [
    "components/task-card.tsx",
    "components/task-detail-sheet.tsx"
  ];
  const forbiddenDisplayLabels = ["任务时间：", "最晚完成："];

  for (const filePath of taskDisplayFiles) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) {
      problems.push(`缺少任务展示文件：${filePath}`);
      continue;
    }
    const source = readFileSync(absolutePath, "utf8");
    for (const label of forbiddenDisplayLabels) {
      if (source.includes(label)) {
        problems.push(`${filePath} 仍包含旧任务展示文案：${label}，任务展示应统一使用“完成时间”。`);
      }
    }
  }

  const pwaRegisterPath = join(ROOT_DIR, "components/pwa-register.tsx");
  if (!existsSync(pwaRegisterPath)) {
    problems.push("缺少 PWA 注册组件：components/pwa-register.tsx");
    return;
  }
  const pwaRegisterSource = readFileSync(pwaRegisterPath, "utf8");
  const localPreviewIndex = pwaRegisterSource.indexOf("const isLocalhostPreview");
  const productionGuardIndex = pwaRegisterSource.indexOf("process.env.NODE_ENV !== \"production\"");
  const cleanupCallIndex = pwaRegisterSource.indexOf("clearPwaArtifacts();");
  const registerIndex = pwaRegisterSource.indexOf(".register(\"/sw.js\")");
  if (
    localPreviewIndex < 0 ||
    productionGuardIndex < 0 ||
    cleanupCallIndex < productionGuardIndex ||
    registerIndex < cleanupCallIndex
  ) {
    problems.push("PWA 开发预览应先清理旧 service worker 和缓存，正式环境才注册 /sw.js。");
  }

  const taskCardPath = join(ROOT_DIR, "components", "task-card.tsx");
  if (!existsSync(taskCardPath)) {
    problems.push("缺少任务卡片组件：components/task-card.tsx");
  } else {
    const taskCardSource = readFileSync(taskCardPath, "utf8");
    if (!taskCardSource.includes("className=\"sr-only\"") || !taskCardSource.includes("查看任务详情：{task.title}")) {
      problems.push("任务卡片应提供隐藏的详情按钮，避免把外层卡片做成嵌套交互按钮。");
    }
    if (taskCardSource.includes("role={onOpen ? \"button\" : undefined}") || taskCardSource.includes("tabIndex={onOpen ? 0 : undefined}")) {
      problems.push("任务卡片外层不应设置 button 角色或 tabIndex，避免和内部完成/确认按钮形成嵌套交互。");
    }
  }

  const bottomNavPath = join(ROOT_DIR, "components", "bottom-nav.tsx");
  if (!existsSync(bottomNavPath)) {
    problems.push("缺少底部导航组件：components/bottom-nav.tsx");
  } else {
    const bottomNavSource = readFileSync(bottomNavPath, "utf8");
    if (!bottomNavSource.includes("aria-label=\"底部导航\"")) {
      problems.push("底部导航应设置 aria-label，方便手机辅助功能识别导航区域。");
    }
    if (!bottomNavSource.includes("aria-label={`切换到${item.label}`}")) {
      problems.push("底部导航按钮应使用“切换到...”的明确名称，避免和任务卡片文字混淆。");
    }
    if (!bottomNavSource.includes("aria-current={isActive ? \"page\" : undefined}")) {
      problems.push("底部导航应标记当前页面 aria-current。");
    }
  }

  const taskFormPath = join(ROOT_DIR, "components", "task-form-sheet.tsx");
  if (!existsSync(taskFormPath)) {
    problems.push("缺少任务表单组件：components/task-form-sheet.tsx");
  } else {
    const taskFormSource = readFileSync(taskFormPath, "utf8");
    if (!taskFormSource.includes("aria-labelledby={formTitleId}") || !taskFormSource.includes("role=\"dialog\"")) {
      problems.push("完整任务表单底部弹窗应使用 dialog 语义并关联标题。");
    }
    if (!taskFormSource.includes("aria-label={`${label}：${value || placeholder}`}")) {
      problems.push("任务表单日期、提醒、重复选择按钮应带字段名，避免多个按钮只有相同日期或占位文本。");
    }
    if (!taskFormSource.includes("aria-pressed={ownerIds.includes(user.id)}")) {
      problems.push("任务表单负责人多选按钮应设置 aria-pressed。");
    }
    if (!taskFormSource.includes("aria-current={day.isToday ? \"date\" : undefined}") || !taskFormSource.includes("aria-pressed={isSelected}")) {
      problems.push("任务日期选择器应标记今天和当前选中日期。");
    }
    if (!taskFormSource.includes("aria-pressed={selectedDays === option.days}")) {
      problems.push("提醒规则选择器应标记当前选中的提醒选项。");
    }
    if (!taskFormSource.includes("aria-pressed={nextWeekdays.includes(weekday.value)}")) {
      problems.push("重复规则周几按钮应标记选中状态。");
    }
    if (!taskFormSource.includes("role=\"dialog\"") || !taskFormSource.includes("aria-modal=\"true\"")) {
      problems.push("日期、提醒和重复选择弹窗应使用 dialog 语义。");
    }
  }

  const taskDetailPath = join(ROOT_DIR, "components", "task-detail-sheet.tsx");
  if (!existsSync(taskDetailPath)) {
    problems.push("缺少任务详情组件：components/task-detail-sheet.tsx");
  } else {
    const taskDetailSource = readFileSync(taskDetailPath, "utf8");
    if (!taskDetailSource.includes("aria-labelledby={detailTitleId}") || !taskDetailSource.includes("role=\"dialog\"")) {
      problems.push("任务详情底部弹窗应使用 dialog 语义并关联任务标题。");
    }
  }

  const appPagePath = join(ROOT_DIR, "app", "page.tsx");
  if (!existsSync(appPagePath)) {
    problems.push("缺少主页面文件：app/page.tsx");
  } else {
    const appPageSource = readFileSync(appPagePath, "utf8");
    if (!appPageSource.includes("htmlFor={quickTextInputId}") || !appPageSource.includes("id={quickTextInputId}")) {
      problems.push("快捷新增的一句话输入框应通过 label htmlFor 显式关联。");
    }
    if (!appPageSource.includes("aria-labelledby={quickCreateTitleId}") || !appPageSource.includes("role=\"dialog\"")) {
      problems.push("快捷新增底部弹窗应使用 dialog 语义并关联标题。");
    }
    if (!appPageSource.includes("role=\"switch\"") || !appPageSource.includes("aria-checked={checked}")) {
      problems.push("提醒设置开关应使用 switch 语义并暴露当前开关状态。");
    }
    if (!appPageSource.includes("role={notice.tone === \"success\" ? \"status\" : \"alert\"}")) {
      problems.push("顶部操作反馈应按成功/错误使用 status 或 alert 语义。");
    }
    if (!appPageSource.includes("aria-live={notice.tone === \"success\" ? \"polite\" : \"assertive\"}")) {
      problems.push("顶部错误反馈应使用 assertive live region，成功反馈保持 polite。");
    }
    if (!appPageSource.includes("className=\"login-error\" role=\"alert\"")) {
      problems.push("登录错误提示应使用 alert 语义。");
    }
    if (!appPageSource.includes("autoComplete=\"current-password\"") || !appPageSource.includes("autoComplete=\"new-password\"")) {
      problems.push("登录和修改密码输入框应设置 autocomplete，方便手机键盘和密码管理器正确识别。");
    }
    if (!appPageSource.includes("role=\"status\">{savedMessage}")) {
      problems.push("修改密码成功提示应使用 status 语义。");
    }
  }
}

function listRouteFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) return listRouteFiles(absolutePath);
    return entry.isFile() && entry.name === "route.ts" ? [absolutePath] : [];
  });
}

function listTypeScriptFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) return listTypeScriptFiles(absolutePath);
    return entry.isFile() && /\.(ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

function listScriptFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) return listScriptFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".mjs") ? [absolutePath] : [];
  });
}

function checkBrowserCompatibility() {
  const filesToCheck = [
    "app/page.tsx",
    "components/task-card.tsx",
    "components/task-detail-sheet.tsx",
    "components/task-form-sheet.tsx"
  ];

  for (const filePath of filesToCheck) {
    const absolutePath = join(ROOT_DIR, filePath);
    if (!existsSync(absolutePath)) continue;
    const source = readFileSync(absolutePath, "utf8");
    if (source.includes(".toSorted(")) {
      problems.push(`${filePath} 使用了 toSorted()，部分旧手机浏览器不支持，请改用 [...list].sort()。`);
    }
    if (filePath.startsWith("app/") || filePath.startsWith("components/")) {
      const usesRandomUuid = source.includes("crypto.randomUUID()");
      const hasCompatibilityFallback =
        source.includes("typeof crypto !== \"undefined\"") && source.includes("typeof crypto.randomUUID === \"function\"");
      if (usesRandomUuid && !hasCompatibilityFallback) {
        problems.push(`${filePath} 直接使用了 crypto.randomUUID()，请提供旧手机浏览器兼容兜底。`);
      }
    }
  }
}

function checkDataFiles() {
  const requiredDataFiles = [taskStoreFileName, userStoreFileName];
  for (const fileName of requiredDataFiles) {
    if (!readJson(fileName, DATA_DIR)) continue;
  }

  const taskStore = readJson(taskStoreFileName, DATA_DIR, false);
  if (taskStore) {
    console.log(`- 任务：${Array.isArray(taskStore.tasks) ? taskStore.tasks.length : "异常"}`);
    console.log(`- 回收站：${Array.isArray(taskStore.trashTasks) ? taskStore.trashTasks.length : "异常"}`);
  }

  const userStore = readJson(userStoreFileName, DATA_DIR, false);
  if (userStore) {
    const accountCount = userStore.passwordHashes && typeof userStore.passwordHashes === "object"
      ? Object.keys(userStore.passwordHashes).length
      : 0;
    console.log(`- 密码账号：${accountCount}`);
  }

  const petStore = readJson(petStoreFileName, DATA_DIR, false);
  if (petStore) console.log(`- 小精灵已喂养：${Number.isInteger(petStore.fedFlowers) ? petStore.fedFlowers : "异常"} 朵`);
}

function runDataCheck() {
  console.log("\n运行数据自检...");
  runCommand("npm", ["run", "data:check"]);
}

function runTypeCheck() {
  console.log("\n运行 TypeScript 检查...");
  runCommand("npx", ["tsc", "--noEmit"]);
}

function runCommand(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: {
      ...process.env,
      ...extraEnv
    },
    stdio: "pipe"
  });

  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) problems.push(`${command} ${args.join(" ")} 执行失败`);
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
  restoreTypeFiles();
  rmSync(DOCTOR_BUILD_DIST_PATH, { force: true, recursive: true });
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

function readJson(fileName, dir, required = true) {
  const filePath = join(dir, fileName);
  if (!existsSync(filePath)) {
    if (required) problems.push(`找不到文件：${filePath}`);
    return null;
  }

  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    problems.push(`JSON 解析失败：${filePath}`);
    return null;
  }
}

function relativePath(filePath) {
  return relative(ROOT_DIR, filePath);
}

function printResult() {
  if (warnings.length) {
    console.log("\n提醒：");
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (problems.length) {
    console.error("\n发现问题：");
    for (const problem of problems) console.error(`- ${problem}`);
    return;
  }

  console.log("\n健康检查通过。");
}
