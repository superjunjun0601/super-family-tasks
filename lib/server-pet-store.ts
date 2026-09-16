import { notEnoughFlowersError } from "@/lib/api-error-codes";
import { petStoreFileName } from "@/lib/data-files";
import { petChangedEventType } from "@/lib/server-event-types";
import { publishServerEvent } from "@/lib/server-events";
import { getJsonFileMtime, readJsonFile, writeJsonFile } from "@/lib/server-json-store";
import { listTasks, listTrashTasks } from "@/lib/server-task-store";
import { hasDatabaseConfig } from "@/lib/server-db";
import { petStateKey, readPersistentState, writePersistentState } from "@/lib/server-state-store";
import { getAvailableFlowers } from "@/lib/pet-stats";
import { isChildTask } from "@/lib/task-helpers";
import { doneStatus } from "@/lib/task-values";
import type { Task } from "@/lib/types";

type PetStore = {
  archivedRewardFlowers: number;
  archivedRewardTaskIds: string[];
  fedFlowers: number;
  updatedAt?: string;
};

const defaultPetStore: PetStore = {
  archivedRewardFlowers: 0,
  archivedRewardTaskIds: [],
  fedFlowers: 0
};

const globalPetStore = globalThis as typeof globalThis & {
  __superFamilyPetStore?: PetStore;
  __superFamilyPetStoreMtime?: number;
};

const store =
  globalPetStore.__superFamilyPetStore ??
  (globalPetStore.__superFamilyPetStore = hasDatabaseConfig()
    ? sanitizePetStore(defaultPetStore)
    : sanitizePetStore(readJsonFile(petStoreFileName, defaultPetStore)));
let loadedPetStoreMtime =
  globalPetStore.__superFamilyPetStoreMtime ?? (hasDatabaseConfig() ? 0 : getJsonFileMtime(petStoreFileName));
globalPetStore.__superFamilyPetStoreMtime = loadedPetStoreMtime;

export async function getPetStore() {
  await refreshPetStoreFromDisk();
  return store;
}

export async function getFlowerBalance() {
  await refreshPetStoreFromDisk();
  const activeTasks = await listTasks();
  const trashTasks = await listTrashTasks();
  const archivedTaskIds = new Set(store.archivedRewardTaskIds);
  return getAvailableFlowers(
    [...activeTasks, ...trashTasks].filter((task) => isChildTask(task) && !archivedTaskIds.has(task.id)),
    store.fedFlowers,
    store.archivedRewardFlowers
  );
}

export async function archiveRewardFlowersFromTasks(tasks: Task[]) {
  await refreshPetStoreFromDisk();
  const archivedTaskIds = new Set(store.archivedRewardTaskIds);
  let archivedFlowerDelta = 0;

  for (const task of tasks) {
    if (
      task.status !== doneStatus ||
      !isChildTask(task) ||
      !task.rewardStars ||
      archivedTaskIds.has(task.id)
    ) {
      continue;
    }
    archivedTaskIds.add(task.id);
    archivedFlowerDelta += task.rewardStars;
  }

  if (!archivedFlowerDelta) return;
  store.archivedRewardFlowers += archivedFlowerDelta;
  store.archivedRewardTaskIds = [...archivedTaskIds];
  store.updatedAt = new Date().toISOString();
  await persistPetStore();
  publishServerEvent(petChangedEventType);
}

export async function feedPet(count = 1) {
  await refreshPetStoreFromDisk();
  const feedCount = Number.isInteger(count) && count > 0 ? count : 1;
  if ((await getFlowerBalance()) < feedCount) {
    return { ok: false as const, status: 400, error: notEnoughFlowersError };
  }

  store.fedFlowers += feedCount;
  store.updatedAt = new Date().toISOString();
  await persistPetStore();
  publishServerEvent(petChangedEventType);
  return { ok: true as const, pet: store, flowerBalance: await getFlowerBalance() };
}

async function persistPetStore() {
  await writePersistentState(petStateKey, petStoreFileName, store);
  if (!hasDatabaseConfig()) {
    loadedPetStoreMtime = getJsonFileMtime(petStoreFileName);
    globalPetStore.__superFamilyPetStoreMtime = loadedPetStoreMtime;
  }
}

async function refreshPetStoreFromDisk() {
  if (hasDatabaseConfig()) {
    const nextStore = sanitizePetStore(await readPersistentState(petStateKey, petStoreFileName, defaultPetStore));
    store.archivedRewardFlowers = nextStore.archivedRewardFlowers;
    store.archivedRewardTaskIds = nextStore.archivedRewardTaskIds;
    store.fedFlowers = nextStore.fedFlowers;
    store.updatedAt = nextStore.updatedAt;
    return;
  }
  const currentMtime = getJsonFileMtime(petStoreFileName);
  if (!currentMtime || currentMtime === loadedPetStoreMtime) return;
  const nextStore = sanitizePetStore(readJsonFile(petStoreFileName, defaultPetStore));
  store.archivedRewardFlowers = nextStore.archivedRewardFlowers;
  store.archivedRewardTaskIds = nextStore.archivedRewardTaskIds;
  store.fedFlowers = nextStore.fedFlowers;
  store.updatedAt = nextStore.updatedAt;
  loadedPetStoreMtime = currentMtime;
  globalPetStore.__superFamilyPetStoreMtime = loadedPetStoreMtime;
}

function sanitizePetStore(value: unknown): PetStore {
  if (!value || typeof value !== "object") return defaultPetStore;
  const archivedRewardFlowers = (value as { archivedRewardFlowers?: unknown }).archivedRewardFlowers;
  const archivedRewardTaskIds = (value as { archivedRewardTaskIds?: unknown }).archivedRewardTaskIds;
  const fedFlowers = (value as { fedFlowers?: unknown }).fedFlowers;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  return {
    archivedRewardFlowers:
      typeof archivedRewardFlowers === "number" &&
      Number.isInteger(archivedRewardFlowers) &&
      archivedRewardFlowers >= 0
        ? archivedRewardFlowers
        : 0,
    archivedRewardTaskIds: Array.isArray(archivedRewardTaskIds)
      ? archivedRewardTaskIds.filter((taskId): taskId is string => typeof taskId === "string")
      : [],
    fedFlowers: typeof fedFlowers === "number" && Number.isInteger(fedFlowers) && fedFlowers >= 0 ? fedFlowers : 0,
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined
  };
}
