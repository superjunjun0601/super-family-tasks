import type { Task } from "@/lib/types";
import { petBaseFlowers, petStarsPerLevel } from "@/lib/pet-values";
import { doneStatus } from "@/lib/task-values";

export type PetStats = {
  flowers: number;
  level: number;
  happiness: number;
  nextLevelIn: number;
  levelProgress: number;
};

export function getPetStats(tasks: Task[], fedFlowers: number): PetStats {
  const flowers = getAvailableFlowers(tasks, fedFlowers);
  const level = Math.floor(fedFlowers / petStarsPerLevel) + 1;
  const currentLevelStart = (level - 1) * petStarsPerLevel;
  const nextLevelAt = level * petStarsPerLevel;
  const progressFlowers = fedFlowers - currentLevelStart;
  const nextLevelIn = Math.max(0, nextLevelAt - fedFlowers);

  return {
    flowers,
    level,
    happiness: Math.min(100, 62 + fedFlowers * 4),
    nextLevelIn,
    levelProgress: Math.min(100, Math.round((progressFlowers / petStarsPerLevel) * 100))
  };
}

export function getAvailableFlowers(tasks: Task[], fedFlowers: number) {
  const earnedFlowers = tasks.reduce((total, task) => {
    if (task.status !== doneStatus) return total;
    return total + (task.rewardStars ?? 0);
  }, 0);
  return Math.max(0, petBaseFlowers + earnedFlowers - fedFlowers);
}
