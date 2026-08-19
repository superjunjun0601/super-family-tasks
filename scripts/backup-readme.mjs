import { criticalDataFileNames, taskStoreFileName } from "./data-files.mjs";

export function createBackupReadme({ copiedFiles, createdAt }) {
  const missingFiles = criticalDataFileNames.filter((fileName) => !copiedFiles.includes(fileName));
  return [
    "超人家族任务清单数据备份",
    `备份时间：${createdAt}`,
    `包含文件：${copiedFiles.join(", ") || "无"}`,
    `关键文件状态：${missingFiles.length ? `缺少 ${missingFiles.join(", ")}` : "完整"}`,
    "",
    `恢复最近自动快照：npm run data:restore-latest -- ${taskStoreFileName}`,
    `恢复指定自动快照：npm run data:restore -- ${taskStoreFileName} 快照文件名`,
    "查看手动备份：npm run data:restore-manual -- list",
    "恢复最近手动备份：npm run data:restore-manual -- latest",
    `可恢复文件：${criticalDataFileNames.join(" / ")}`
  ].join("\n");
}
