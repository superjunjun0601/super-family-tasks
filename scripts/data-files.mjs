export const taskStoreFileName = "task-store.json";
export const userStoreFileName = "user-store.json";
export const petStoreFileName = "pet-store.json";
export const autoSnapshotDirName = "backups";
export const manualBackupDirName = "manual-backups";
export const manualBackupSnapshotDirName = "snapshots";

export const criticalDataFileNames = [
  taskStoreFileName,
  userStoreFileName,
  petStoreFileName
];

export const backupDataFileNames = criticalDataFileNames.flatMap((fileName) => [
  fileName,
  `${fileName}.bak`
]);
