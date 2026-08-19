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
import { createBackupReadme } from "@/lib/backup-readme";
import { autoSnapshotDirName, backupDataFileNames, manualBackupDirName, manualBackupSnapshotDirName } from "@/lib/data-files";
import { manualBackupWarningCount } from "@/lib/data-safety-values";
import { getServerDataDir } from "@/lib/server-data-dir";
import { hasDatabaseConfig } from "@/lib/server-db";

const DATA_DIR = getServerDataDir();
const MANUAL_BACKUP_DIR = join(DATA_DIR, manualBackupDirName);

export function createManualDataBackup() {
  const createdAt = new Date().toISOString();
  if (hasDatabaseConfig()) {
    return {
      copiedFiles: ["postgresql"],
      createdAt,
      dirName: `database-${createdAt.replace(/[:.]/g, "-")}`,
      path: "PostgreSQL（由云数据库负责持久化）"
    };
  }
  const { dirName, targetDir } = createUniqueBackupDir(createdAt.replace(/[:.]/g, "-"));


  const copiedFiles: string[] = [];
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

  return {
    copiedFiles,
    createdAt,
    dirName,
    path: targetDir
  };
}

function createUniqueBackupDir(baseDirName: string) {
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

function copyFileDurably(sourcePath: string, targetPath: string) {
  copyFileSync(sourcePath, targetPath);
  fsyncFile(targetPath);
  syncDirectoryBestEffort(dirname(targetPath));
}

function writeTextDurably(filePath: string, content: string) {
  const fd = openSync(filePath, "w");
  try {
    writeFileSync(fd, content, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  syncDirectoryBestEffort(dirname(filePath));
}

function fsyncFile(filePath: string) {
  const fd = openSync(filePath, "r");
  try {
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
    // Some filesystems do not support fsync on directories.
  }
}

export function getManualBackupStatus() {
  if (hasDatabaseConfig()) {
    return {
      count: 0,
      latestCopiedFiles: ["postgresql"],
      latestCreatedAt: null,
      latestDirName: null,
      pruneSuggested: false
    };
  }
  try {
    if (!existsSync(MANUAL_BACKUP_DIR)) {
      return {
        count: 0,
        latestCopiedFiles: [],
        latestCreatedAt: null,
        latestDirName: null,
        pruneSuggested: false
      };
    }

    const backups = readdirSync(MANUAL_BACKUP_DIR)
      .map((dirName) => {
        const backupPath = join(MANUAL_BACKUP_DIR, dirName);
        const stats = statSync(backupPath);
        return stats.isDirectory()
          ? {
              dirName,
              files: listBackupDataFiles(backupPath),
              mtime: stats.mtime
            }
          : null;
      })
      .filter((backup): backup is { dirName: string; files: string[]; mtime: Date } => Boolean(backup))
      .sort((first, second) => second.mtime.getTime() - first.mtime.getTime());

    return {
      count: backups.length,
      latestCopiedFiles: backups[0]?.files ?? [],
      latestCreatedAt: backups[0]?.mtime.toISOString() ?? null,
      latestDirName: backups[0]?.dirName ?? null,
      pruneSuggested: backups.length >= manualBackupWarningCount
    };
  } catch {
    return {
      count: 0,
      latestCopiedFiles: [],
      latestCreatedAt: null,
      latestDirName: null,
      pruneSuggested: false
    };
  }
}

function listBackupDataFiles(backupPath: string) {
  try {
    return readdirSync(backupPath)
      .filter((fileName) => backupDataFileNames.includes(fileName))
      .sort((first, second) => backupDataFileNames.indexOf(first) - backupDataFileNames.indexOf(second));
  } catch {
    return [];
  }
}
