import { notEnoughFlowersError } from "@/lib/api-error-codes";
import { petStoreFileName } from "@/lib/data-files";
import { petChangedEventType } from "@/lib/server-event-types";
import { publishServerEvent } from "@/lib/server-events";
import { getJsonFileMtime, readJsonFile, writeJsonFile } from "@/lib/server-json-store";
import { listTasks } from "@/lib/server-task-store";
import { hasDatabaseConfig } from "@/lib/server-db";
import { petStateKey, readPersistentState, writePersistentState } from "@/lib/server-state-store";
import { getAvailableFlowers } from "@/lib/pet-stats";
import { isChildTask } from "@/lib/task-helpers";

type PetStore = {
  fedFlowers: number;
  updatedAt?: string;
};

const defaultPetStore: PetStore = {
  fedFlowers: 0
};

const globalPetStore = globalThis as typeof globalThis & {
  __superFamilyPetStore?: PetStore;
  __superFamilyPetStoreMtime?: number;
};

const store =
  globalPetStore.__superFamilyPetStore ??
  (globalPetStore.__superFamilyPetStore = sanitizePetStore(readJsonFile(petStoreFileName, defaultPetStore)));
let loadedPetStoreMtime = globalPetStore.__superFamilyPetStoreMtime ?? getJsonFileMtime(petStoreFileName);
globalPetStore.__superFamilyPetStoreMtime = loadedPetStoreMtime;

export async function getPetStore() {
  await refreshPetStoreFromDisk();
  return store;
}

export async function getFlowerBalance() {
  await refreshPetStoreFromDisk();
  return getAvailableFlowers((await listTasks()).filter(isChildTask), store.fedFlowers);
}

export async function feedPet() {
  await refreshPetStoreFromDisk();
  if ((await getFlowerBalance()) <= 0) {
    return { ok: false as const, status: 400, error: notEnoughFlowersError };
  }

  store.fedFlowers += 1;
  store.updatedAt = new Date().toISOString();
  await persistPetStore();
  publishServerEvent(petChangedEventType);
  return { ok: true as const, pet: store, flowerBalance: await getFlowerBalance() };
}

async function persistPetStore() {
  await writePersistentState(petStateKey, petStoreFileName, store);
  loadedPetStoreMtime = getJsonFileMtime(petStoreFileName);
  globalPetStore.__superFamilyPetStoreMtime = loadedPetStoreMtime;
}

async function refreshPetStoreFromDisk() {
  if (hasDatabaseConfig()) {
    const nextStore = sanitizePetStore(await readPersistentState(petStateKey, petStoreFileName, defaultPetStore));
    store.fedFlowers = nextStore.fedFlowers;
    store.updatedAt = nextStore.updatedAt;
    return;
  }
  const currentMtime = getJsonFileMtime(petStoreFileName);
  if (!currentMtime || currentMtime === loadedPetStoreMtime) return;
  const nextStore = sanitizePetStore(readJsonFile(petStoreFileName, defaultPetStore));
  store.fedFlowers = nextStore.fedFlowers;
  store.updatedAt = nextStore.updatedAt;
  loadedPetStoreMtime = currentMtime;
  globalPetStore.__superFamilyPetStoreMtime = loadedPetStoreMtime;
}

function sanitizePetStore(value: unknown): PetStore {
  if (!value || typeof value !== "object") return defaultPetStore;
  const fedFlowers = (value as { fedFlowers?: unknown }).fedFlowers;
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  return {
    fedFlowers: typeof fedFlowers === "number" && Number.isInteger(fedFlowers) && fedFlowers >= 0 ? fedFlowers : 0,
    updatedAt: typeof updatedAt === "string" ? updatedAt : undefined
  };
}
