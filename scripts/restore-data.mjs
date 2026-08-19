import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { autoSnapshotDirName, criticalDataFileNames, taskStoreFileName } from "./data-files.mjs";
import { getDataDir } from "./data-dir.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = getDataDir(ROOT_DIR);
const BACKUP_DIR = join(DATA_DIR, autoSnapshotDirName);
const allowedFiles = new Set(criticalDataFileNames);
const [, , action = "list", fileName = taskStoreFileName, snapshotName] = process.argv;

if (!allowedFiles.has(fileName)) {
  fail(`只能恢复 ${Array.from(allowedFiles).join(" 或 ")}。`);
}

const snapshots = listSnapshots(fileName);

if (action === "list") {
  if (!snapshots.length) {
    console.log(`${fileName} 暂时没有快照。`);
    process.exit(0);
  }

  console.log(`${fileName} 可恢复快照：`);
  for (const snapshot of snapshots) {
    console.log(`- ${snapshot.name}  ${snapshot.mtime.toISOString()}`);
  }
  process.exit(0);
}

if (action === "latest") {
  restoreSnapshot(fileName, snapshots[0]?.name);
  process.exit(0);
}

if (action === "restore") {
  restoreSnapshot(fileName, snapshotName);
  process.exit(0);
}

fail(`用法：npm run data:list -- ${taskStoreFileName} | npm run data:restore-latest -- ${taskStoreFileName} | npm run data:restore -- ${taskStoreFileName} 快照文件名`);

function restoreSnapshot(targetFileName, sourceSnapshotName) {
  if (!sourceSnapshotName) {
    fail(`${targetFileName} 没有可恢复快照。`);
  }

  if (!basename(sourceSnapshotName).endsWith(`-${targetFileName}`)) {
    fail(`快照文件和目标文件不匹配：${sourceSnapshotName} 不能恢复到 ${targetFileName}`);
  }

  const sourcePath = join(BACKUP_DIR, basename(sourceSnapshotName));
  if (!existsSync(sourcePath)) {
    fail(`找不到快照：${sourceSnapshotName}`);
  }

  const targetPath = join(DATA_DIR, targetFileName);
  let beforeRestorePath = "";
  if (existsSync(targetPath)) {
    beforeRestorePath = `${targetPath}.${timestamp()}.before-restore`;
    copyFileSync(targetPath, beforeRestorePath);
  }
  copyFileDurably(sourcePath, targetPath);
  console.log(`已恢复 ${targetFileName}：${basename(sourcePath)}`);
  if (beforeRestorePath) {
    console.log(`恢复前文件已保存为 ${basename(beforeRestorePath)}`);
  }
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function listSnapshots(sourceName) {
  if (!existsSync(BACKUP_DIR)) return [];
  return readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(`-${sourceName}`))
    .map((name) => ({
      mtime: statSync(join(BACKUP_DIR, name)).mtime,
      name
    }))
    .sort((first, second) => second.mtime.getTime() - first.mtime.getTime());
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
