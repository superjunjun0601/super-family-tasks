export type FairyLevel = {
  description: string;
  image: string;
  level: number;
  name: string;
  threshold: number;
};

export type CurrentPetLevel = FairyLevel & {
  label: string;
};

export const FAIRY_LEVELS: FairyLevel[] = [
  {
    level: 1,
    name: "梦幻精灵蛋",
    threshold: 0,
    image: "/assets/fairy/level-1.png",
    description: "小精灵正在蛋里睡觉，收到彩虹花会慢慢醒来哦。"
  },
  {
    level: 2,
    name: "初生小精灵",
    threshold: 12,
    image: "/assets/fairy/level-2.png",
    description: "小精灵出生啦！它最喜欢你送的彩虹花。"
  },
  {
    level: 3,
    name: "幼年小精灵",
    threshold: 30,
    image: "/assets/fairy/level-3.png",
    description: "小精灵长高了一点点！"
  },
  {
    level: 4,
    name: "花芽小精灵",
    threshold: 60,
    image: "/assets/fairy/level-4.png",
    description: "因为你的努力，小精灵开出了第一朵小花。"
  },
  {
    level: 5,
    name: "花冠小精灵",
    threshold: 100,
    image: "/assets/fairy/level-5.png",
    description: "小精灵拥有漂亮花冠啦！"
  },
  {
    level: 6,
    name: "花园小精灵",
    threshold: 150,
    image: "/assets/fairy/level-6.png",
    description: "小精灵的小花园越来越漂亮了。"
  },
  {
    level: 7,
    name: "守护小精灵",
    threshold: 210,
    image: "/assets/fairy/level-7.png",
    description: "小精灵成为花园守护者啦！"
  }
];

export function getCurrentLevel(happiness: number): CurrentPetLevel {
  const normalizedHappiness = Math.max(0, Math.floor(happiness));
  const currentLevel = [...FAIRY_LEVELS]
    .reverse()
    .find((level) => normalizedHappiness >= level.threshold) ?? FAIRY_LEVELS[0];

  return {
    ...currentLevel,
    label: `Lv.${currentLevel.level} ${currentLevel.name}`
  };
}

export function getNextLevel(happiness: number) {
  const currentLevel = getCurrentLevel(happiness);
  const index = FAIRY_LEVELS.findIndex((level) => level.level === currentLevel.level);
  if (index < 0) return null;
  return FAIRY_LEVELS[index + 1] ?? null;
}

export function getFlowersToNextLevel(happiness: number) {
  const normalizedHappiness = Math.max(0, Math.floor(happiness));
  const nextLevel = getNextLevel(normalizedHappiness);
  return nextLevel ? Math.max(0, nextLevel.threshold - normalizedHappiness) : 0;
}

export function getProgressPercent(happiness: number) {
  const normalizedHappiness = Math.max(0, Math.floor(happiness));
  const currentLevel = getCurrentLevel(normalizedHappiness);
  const nextLevel = getNextLevel(normalizedHappiness);
  if (!nextLevel) return 100;

  const currentThreshold = currentLevel.threshold;
  const nextThreshold = nextLevel.threshold;
  if (nextThreshold <= currentThreshold) return 100;

  const stageProgress = ((normalizedHappiness - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
  return Math.min(100, Math.max(0, stageProgress));
}

export function getPetLevelByHappiness(happiness: number): CurrentPetLevel {
  return getCurrentLevel(happiness);
}

export function getNextPetLevel(currentLevel: number) {
  const index = FAIRY_LEVELS.findIndex((level) => level.level === currentLevel);
  if (index < 0) return null;
  return FAIRY_LEVELS[index + 1] ?? null;
}
