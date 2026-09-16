import type { Task } from "@/lib/types";
import { petBaseFlowers } from "@/lib/pet-values";
import { getCurrentLevel, getFlowersToNextLevel, getNextLevel, getProgressPercent } from "@/lib/pet-levels";
import { doneStatus } from "@/lib/task-values";

export type PetStats = {
  flowers: number;
  level: number;
  happiness: number;
  nextLevelIn: number;
  levelProgress: number;
  currentLevel: ReturnType<typeof getCurrentLevel>;
  nextLevelLabel: string | null;
};

export function getPetStats(tasks: Task[], fedFlowers: number, authoritativeFlowerBalance?: number): PetStats {
  const flowers =
    typeof authoritativeFlowerBalance === "number" &&
    Number.isInteger(authoritativeFlowerBalance) &&
    authoritativeFlowerBalance >= 0
      ? authoritativeFlowerBalance
      : getAvailableFlowers(tasks, fedFlowers);
  const happiness = Math.max(0, Math.floor(fedFlowers));
  const currentLevel = getCurrentLevel(happiness);
  const nextLevel = getNextLevel(happiness);
  const nextLevelIn = getFlowersToNextLevel(happiness);
  const levelProgress = getProgressPercent(happiness);

  return {
    flowers,
    level: currentLevel.level,
    happiness,
    nextLevelIn,
    levelProgress,
    currentLevel,
    nextLevelLabel: nextLevel ? `Lv.${nextLevel.level} ${nextLevel.name}` : null
  };
}

export function getAvailableFlowers(tasks: Task[], fedFlowers: number, archivedRewardFlowers = 0) {
  const earnedFlowers = tasks.reduce((total, task) => {
    if (task.status !== doneStatus) return total;
    return total + (task.rewardStars ?? 0);
  }, 0);
  return Math.max(0, petBaseFlowers + archivedRewardFlowers + earnedFlowers - fedFlowers);
}
