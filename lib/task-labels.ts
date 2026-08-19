import type { Priority, TaskCategory } from "@/lib/types";
import {
  childStudyCategory,
  familyCategory,
  importantPriority,
  normalPriority,
  personalCategory,
  urgentPriority
} from "@/lib/task-values";

export const taskCategoryLabels: Record<TaskCategory, string> = {
  [childStudyCategory]: "小柚子学习",
  [familyCategory]: "家庭待办",
  [personalCategory]: "个人待办"
};

export const taskPriorityLabels: Record<Priority, string> = {
  [importantPriority]: "重要",
  [normalPriority]: "普通",
  [urgentPriority]: "紧急"
};

export const taskCategoryOptions: readonly { label: string; value: TaskCategory }[] = [
  { label: taskCategoryLabels[familyCategory], value: familyCategory },
  { label: taskCategoryLabels[personalCategory], value: personalCategory },
  { label: taskCategoryLabels[childStudyCategory], value: childStudyCategory }
];

export const taskPriorityOptions: readonly { label: string; value: Priority }[] = [
  { label: taskPriorityLabels[normalPriority], value: normalPriority },
  { label: taskPriorityLabels[importantPriority], value: importantPriority },
  { label: taskPriorityLabels[urgentPriority], value: urgentPriority }
];
