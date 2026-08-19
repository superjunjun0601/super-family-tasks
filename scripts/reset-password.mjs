import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { hashSync } from "bcryptjs";
import { maxPasswordLength, minPasswordLength } from "./auth-values.mjs";
import { userStoreFileName } from "./data-files.mjs";
import { getDataDir } from "./data-dir.mjs";
import { familyUserIds, momUserId } from "./family-users.mjs";
import { npmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const USER_STORE_PATH = join(getDataDir(ROOT_DIR), userStoreFileName);
const allowedUserIds = new Set(familyUserIds);
const [, , userId, nextPassword] = process.argv;
const normalizedNextPassword = nextPassword?.trim() ?? "";

if (!allowedUserIds.has(userId)) {
  fail(`用法：npm run user:reset-password -- ${momUserId} 新密码`);
}

if (normalizedNextPassword.length < minPasswordLength) {
  fail(`新密码至少 ${minPasswordLength} 位。`);
}

if (normalizedNextPassword.length > maxPasswordLength) {
  fail(`新密码最多 ${maxPasswordLength} 位。`);
}

const store = readUserStore();
runManualBackup();
const beforeResetPath = `${USER_STORE_PATH}.${timestamp()}.before-password-reset`;
copyFileSync(USER_STORE_PATH, beforeResetPath);

store.passwordHashes[userId] = hashSync(normalizedNextPassword, 10);
writeJsonDurably(USER_STORE_PATH, store);

console.log(`已重置 ${userId} 的密码。`);
console.log("重置前已生成手动备份。");
console.log(`重置前文件已保存为 ${basename(beforeResetPath)}`);

function readUserStore() {
  if (!existsSync(USER_STORE_PATH)) {
    fail(`找不到 data/${userStoreFileName}。请先启动应用或运行数据初始化流程。`);
  }

  try {
    const value = JSON.parse(readFileSync(USER_STORE_PATH, "utf8"));
    const passwordHashes = value.passwordHashes && typeof value.passwordHashes === "object" ? value.passwordHashes : {};
    return {
      passwordHashes: Object.fromEntries(
        familyUserIds.map((id) => [id, typeof passwordHashes[id] === "string" ? passwordHashes[id] : ""])
      ),
      ...(value.reminderSettings && typeof value.reminderSettings === "object"
        ? { reminderSettings: value.reminderSettings }
        : {})
    };
  } catch {
    fail(`${userStoreFileName} 不是有效 JSON。请先从备份恢复。`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function runManualBackup() {
  const result = spawnSync(npmCommand, ["run", "data:backup"], {
    cwd: ROOT_DIR,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeJsonDurably(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const fd = openSync(tempPath, "w");
    try {
      writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tempPath, filePath);
    syncDirectoryBestEffort(dirname(filePath));
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
