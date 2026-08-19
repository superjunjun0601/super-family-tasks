import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createBackupReadme } from "./backup-readme.mjs";
import {
  autoSnapshotDirName,
  backupDataFileNames,
  criticalDataFileNames,
  manualBackupDirName,
  manualBackupSnapshotDirName
} from "./data-files.mjs";
import { getDataDir } from "./data-dir.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = getDataDir(ROOT_DIR);
const MANUAL_BACKUP_DIR = join(DATA_DIR, manualBackupDirName);

const createdAt = process.env.SUPER_FAMILY_TEST_BACKUP_TIMESTAMP || new Date().toISOString();
const { targetDir } = createUniqueBackupDir(createdAt.replace(/[:.]/g, "-"));

const copiedFiles = [];
for (const fileName of backupDataFileNames) {
  const sourcePath = join(DATA_DIR, fileName);
  if (!existsSync(sourcePath)) continue;

  copyFileDurably(sourcePath, join(targetDir, basename(fileName)));
  copiedFiles.push(fileName);
}

const snapshotDir = join(DATA_DIR, autoSnapshotDirName);
if (existsSync(snapshotDir)) {
  const targetSnapshotDir = join(targetDir, manualBackupSnapshotDirName);
  mkdirSync(targetSnapshotDir, { recursive: true });
  for (const fileName of readdirSync(snapshotDir)) {
    const sourcePath = join(snapshotDir, fileName);
    if (!statSync(sourcePath).isFile()) continue;
    copyFileDurably(sourcePath, join(targetSnapshotDir, fileName));
  }
}

writeTextDurably(
  join(targetDir, "README.txt"),
  createBackupReadme({ copiedFiles, createdAt }),
);
syncDirectoryBestEffort(targetDir);

const missingFiles = criticalDataFileNames.filter((fileName) => !copiedFiles.includes(fileName));
console.log(`已备份到 ${targetDir}`);
console.log(`包含文件：${copiedFiles.join(", ") || "无"}`);
if (missingFiles.length) {
  console.warn(`提醒：本次备份缺少关键文件：${missingFiles.join(", ")}。建议先运行 npm run app:doctor 初始化或修复数据。`);
} else {
  console.log("关键文件状态：完整");
}

function createUniqueBackupDir(baseDirName) {
  mkdirSync(MANUAL_BACKUP_DIR, { recursive: true });
  for (let index = 1; index <= 1000; index += 1) {
    const dirName = index === 1 ? baseDirName : `${baseDirName}-${index}`;
    const targetDir = join(MANUAL_BACKUP_DIR, dirName);
    try {
      mkdirSync(targetDir);
      return { dirName, targetDir };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("无法创建唯一手动备份目录");
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
