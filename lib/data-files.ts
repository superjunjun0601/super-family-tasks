export const taskStoreFileName = "task-store.json";
export const userStoreFileName = "user-store.json";
export const petStoreFileName = "pet-store.json";
export const autoSnapshotDirName = "backups";
export const manualBackupDirName = "manual-backups";
export const manualBackupSnapshotDirName = "snapshots";

export const criticalDataFiles = [
  { fileName: taskStoreFileName, label: "任务" },
  { fileName: userStoreFileName, label: "账号" },
  { fileName: petStoreFileName, label: "小精灵" }
] as const;

export const criticalDataFileNames = criticalDataFiles.map((file) => file.fileName);

export const backupDataFileNames = criticalDataFileNames.flatMap((fileName) => [
  fileName,
  `${fileName}.bak`
]);
