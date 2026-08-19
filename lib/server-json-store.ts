import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { autoSnapshotDirName } from "@/lib/data-files";
import { getServerDataDir } from "@/lib/server-data-dir";

const DATA_DIR = getServerDataDir();
const BACKUP_DIR = join(DATA_DIR, autoSnapshotDirName);
const MAX_SNAPSHOT_COUNT = 10;

export function readJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = join(DATA_DIR, fileName);
  const backupFilePath = `${filePath}.bak`;
  const latestSnapshotPath = listSnapshots(fileName)[0]?.path;
  const mainValue = readJsonPath<T>(filePath);
  if (mainValue !== null) return mainValue;

  const backupValue = readJsonPath<T>(backupFilePath);
  if (backupValue !== null) return backupValue;

  const snapshotValue = readJsonPath<T>(latestSnapshotPath);
  if (snapshotValue !== null) return snapshotValue;

  if (!existsSync(filePath) && !existsSync(backupFilePath) && !latestSnapshotPath) {
    writeJsonFile(fileName, fallback);
  }
  return fallback;
}

export function writeJsonFile<T>(fileName: string, value: T) {
  const filePath = join(DATA_DIR, fileName);
  const backupFilePath = `${filePath}.bak`;
  const tempFilePath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  mkdirSync(dirname(filePath), { recursive: true });
  try {
    if (existsSync(filePath)) {
      copyFileSync(filePath, backupFilePath);
      writeSnapshot(filePath);
    }
    writeDurableJsonTempFile(tempFilePath, value);
    renameSync(tempFilePath, filePath);
    syncDirectoryBestEffort(dirname(filePath));
  } finally {
    try {
      rmSync(tempFilePath, { force: true });
    } catch {
      // Ignore cleanup failures. The target file already contains the latest snapshot.
    }
  }
}

function writeDurableJsonTempFile<T>(tempFilePath: string, value: T) {
  const fd = openSync(tempFilePath, "w");
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

function syncDirectoryBestEffort(dirPath: string) {
  try {
    const fd = openSync(dirPath, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Some filesystems do not support fsync on directories; the atomic file write is still valid.
  }
}

export function getJsonFileStatus(fileName: string) {
  const filePath = join(DATA_DIR, fileName);
  const backupFilePath = `${filePath}.bak`;
  const snapshots = listSnapshots(fileName);

  return {
    backupExists: existsSync(backupFilePath),
    exists: existsSync(filePath),
    latestUsableSource: getLatestUsableSource(fileName),
    readable: readJsonPath(filePath) !== null,
    snapshotCount: snapshots.length,
    latestSnapshotAt: snapshots[0]?.mtime.toISOString() ?? null,
    updatedAt: existsSync(filePath) ? statSync(filePath).mtime.toISOString() : null
  };
}

export function getJsonFileMtime(fileName: string) {
  const filePath = join(DATA_DIR, fileName);
  return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
}

function getLatestUsableSource(fileName: string) {
  const filePath = join(DATA_DIR, fileName);
  const backupFilePath = `${filePath}.bak`;
  const latestSnapshotPath = listSnapshots(fileName)[0]?.path;

  if (readJsonPath(filePath) !== null) return "main";
  if (readJsonPath(backupFilePath) !== null) return "backup";
  if (readJsonPath(latestSnapshotPath) !== null) return "snapshot";
  return "fallback";
}

function writeSnapshot(filePath: string) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const sourceName = basename(filePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  copyFileSync(filePath, join(BACKUP_DIR, `${timestamp}-${sourceName}`));
  pruneSnapshots(sourceName);
  syncDirectoryBestEffort(BACKUP_DIR);
}

function pruneSnapshots(sourceName: string) {
  const snapshots = listSnapshots(sourceName);
  for (const snapshot of snapshots.slice(MAX_SNAPSHOT_COUNT)) {
    rmSync(snapshot.path, { force: true });
  }
}

function listSnapshots(sourceName: string) {
  try {
    if (!existsSync(BACKUP_DIR)) return [];
    return readdirSync(BACKUP_DIR)
      .filter((fileName) => fileName.endsWith(`-${sourceName}`))
      .map((fileName) => {
        const path = join(BACKUP_DIR, fileName);
        return {
          fileName,
          mtime: statSync(path).mtime,
          path
        };
      })
      .sort((first, second) => second.mtime.getTime() - first.mtime.getTime());
  } catch {
    return [];
  }
}

function readJsonPath<T>(filePath?: string): T | null {
  try {
    if (!filePath) return null;
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}
