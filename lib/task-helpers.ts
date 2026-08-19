import type { FamilyUser, Task } from "@/lib/types";
import { childUserId } from "@/lib/family-users";
import { childStudyCategory } from "@/lib/task-values";

export function isChildTask(task: Pick<Task, "category" | "owners">) {
  return task.category === childStudyCategory || isTaskOwner(task, childUserId);
}

export function isTaskOwner(task: Pick<Task, "owners">, userId: string) {
  return hasOwnerId(task.owners, userId);
}

export function getTaskOwnerNames(task: Pick<Task, "owners">) {
  return task.owners.map((owner) => owner.name).join("、");
}

export function hasOwnerId(owners: Pick<FamilyUser, "id">[], userId: string) {
  return owners.some((owner) => owner.id === userId);
}
