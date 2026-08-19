import { hasDatabaseConfig, prisma } from "@/lib/server-db";
import { readJsonFile, writeJsonFile } from "@/lib/server-json-store";

export const taskStateKey = "tasks";
export const userStateKey = "users";
export const petStateKey = "pet";

export async function readPersistentState<T>(key: string, fileName: string, fallback: T): Promise<T> {
  if (!hasDatabaseConfig()) return readJsonFile(fileName, fallback);
  const state = await prisma.appState.findUnique({ where: { key } });
  return (state?.value as T | undefined) ?? fallback;
}

export async function writePersistentState<T>(key: string, fileName: string, value: T) {
  if (!hasDatabaseConfig()) {
    writeJsonFile(fileName, value);
    return;
  }
  await prisma.appState.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object }
  });
}
