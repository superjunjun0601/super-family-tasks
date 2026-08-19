import { criticalDataFiles } from "@/lib/data-files";
import { manualBackupStaleDays } from "@/lib/data-safety-values";

type ManualBackupStatus = {
  count: number;
  latestCopiedFiles: string[];
  latestCreatedAt: string | null;
  pruneSuggested?: boolean;
};

export function getBackupWarning(status?: ManualBackupStatus) {
  if (!status) return "";
  if (status.count <= 0) return "还没有手动备份。正式试用、改密码或清空回收站前，建议先备份一次。";
  if (status.pruneSuggested) return `手动备份已经有 ${status.count} 份了。可以找时间把很久以前的备份移到电脑硬盘或网盘里，应用不会自动删除。`;
  if (!status.latestCreatedAt) return "";
  const latestBackupTime = new Date(status.latestCreatedAt).getTime();
  if (Number.isNaN(latestBackupTime)) return "";
  const backupAgeDays = Math.floor((Date.now() - latestBackupTime) / 86400000);
  if (backupAgeDays >= manualBackupStaleDays) return `最近一次手动备份已经是 ${backupAgeDays} 天前，建议今天补一次。`;
  return "";
}

export function getBackupFileWarning(status?: ManualBackupStatus) {
  if (!status || status.count <= 0) return "";
  const missingLabels = getBackupFileLabels(status.latestCopiedFiles, "missing");
  return missingLabels.length ? `最近手动备份缺少${missingLabels.join("、")}数据，建议立即重新备份一次。` : "";
}

export function formatBackupFileSummary(files: string[]) {
  const labels = getBackupFileLabels(files, "included");
  return labels.length ? labels.join("、") : `${files.length} 个数据文件`;
}

export function formatStorageTime(value?: string | null) {
  if (!value) return "暂无";
  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;
  const month = parsedDate.getMonth() + 1;
  const day = parsedDate.getDate();
  const hour = String(parsedDate.getHours()).padStart(2, "0");
  const minute = String(parsedDate.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

function getBackupFileLabels(files: string[], mode: "included" | "missing") {
  return criticalDataFiles
    .filter((file) => (mode === "included" ? files.includes(file.fileName) : !files.includes(file.fileName)))
    .map((file) => file.label);
}
