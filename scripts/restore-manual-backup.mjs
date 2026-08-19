import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  autoSnapshotDirName,
  backupDataFileNames,
  manualBackupDirName,
  manualBackupSnapshotDirName
} from "./data-files.mjs";
import { getDataDir } from "./data-dir.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = getDataDir(ROOT_DIR);
const MANUAL_BACKUP_DIR = join(DATA_DIR, manualBackupDirName);
const [, , action = "list", backupName] = process.argv;

if (action === "list") {
  printManualBackups();
  process.exit(0);
}

if (action === "latest") {
  restoreManualBackup(listManualBackups()[0]?.name);
  process.exit(0);
}

if (action === "restore") {
  restoreManualBackup(backupName);
  process.exit(0);
}

fail("用法：npm run data:restore-manual -- list | npm run data:restore-manual -- latest | npm run data:restore-manual -- restore 手动备份目录名");

function printManualBackups() {
  const backups = listManualBackups();
  if (!backups.length) {
    console.log("暂时没有手动备份。");
    return;
  }

  console.log("可恢复手动备份：");
  for (const backup of backups) {
    console.log(`- ${backup.name}  ${backup.mtime.toISOString()}`);
  }
}

function restoreManualBackup(sourceBackupName) {
  if (!sourceBackupName) fail("没有可恢复的手动备份。");
  const safeBackupName = basename(sourceBackupName);
  const sourceDir = join(MANUAL_BACKUP_DIR, safeBackupName);
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    fail(`找不到手动备份目录：${safeBackupName}`);
  }

  const sourceFiles = backupDataFileNames.filter((fileName) => existsSync(join(sourceDir, fileName)));
  if (!sourceFiles.some((fileName) => fileName.endsWith(".json"))) {
    fail(`手动备份目录里没有可恢复的数据文件：${safeBackupName}`);
  }

  const beforeRestoreDir = createBeforeRestoreBackup(safeBackupName);
  for (const fileName of sourceFiles) {
    copyFileDurably(join(sourceDir, fileName), join(DATA_DIR, fileName));
  }

  const sourceSnapshotDir = join(sourceDir, manualBackupSnapshotDirName);
  let restoredSnapshotCount = 0;
  if (existsSync(sourceSnapshotDir) && statSync(sourceSnapshotDir).isDirectory()) {
    const targetSnapshotDir = join(DATA_DIR, autoSnapshotDirName);
    mkdirSync(targetSnapshotDir, { recursive: true });
    for (const fileName of readdirSync(sourceSnapshotDir)) {
      const sourcePath = join(sourceSnapshotDir, fileName);
      if (!statSync(sourcePath).isFile()) continue;
      copyFileDurably(sourcePath, join(targetSnapshotDir, fileName));
      restoredSnapshotCount += 1;
    }
  }

  console.log(`已从手动备份恢复：${safeBackupName}`);
  console.log(`恢复文件：${sourceFiles.join(", ")}`);
  if (restoredSnapshotCount) console.log(`恢复自动快照：${restoredSnapshotCount} 个`);
  console.log(`恢复前数据已备份到：${beforeRestoreDir}`);
}

function createBeforeRestoreBackup(sourceBackupName) {
  const targetDir = createUniqueBackupDir(`${timestamp()}-before-manual-restore`);

  const copiedFiles = [];
  for (const fileName of backupDataFileNames) {
    const sourcePath = join(DATA_DIR, fileName);
    if (!existsSync(sourcePath)) continue;
    copyFileDurably(sourcePath, join(targetDir, fileName));
    copiedFiles.push(fileName);
  }

  const snapshotDir = join(DATA_DIR, autoSnapshotDirName);
  if (existsSync(snapshotDir) && statSync(snapshotDir).isDirectory()) {
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
    [
      "超人家族任务清单恢复前自动备份",
      `备份时间：${new Date().toISOString()}`,
      `恢复来源：${sourceBackupName}`,
      `包含文件：${copiedFiles.join(", ") || "无"}`,
      "",
      "如果本次恢复不符合预期，可再从这个目录恢复。"
    ].join("\n")
  );
  syncDirectoryBestEffort(targetDir);

  return targetDir;
}

function listManualBackups() {
  if (!existsSync(MANUAL_BACKUP_DIR)) return [];
  return readdirSync(MANUAL_BACKUP_DIR)
    .map((name) => {
      const absolutePath = join(MANUAL_BACKUP_DIR, name);
      const stats = statSync(absolutePath);
      return stats.isDirectory() ? { mtime: stats.mtime, name } : null;
    })
    .filter(Boolean)
    .sort((first, second) => second.mtime.getTime() - first.mtime.getTime());
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function copyFileDurably(sourcePath, targetPath) {
  const tempPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    copyFileSync(sourcePath, tempPath);
    fsyncFile(tempPath);
    renameSync(tempPath, targetPath);
    syncDirectoryBestEffort(dirname(targetPath));
  } finally {
    rmSync(tempPath, { force: true });
  }
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
  throw new Error("无法创建唯一恢复前备份目录");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
