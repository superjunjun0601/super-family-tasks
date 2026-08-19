import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { getDataDir } from "./data-dir.mjs";
import { petStoreFileName, taskStoreFileName, userStoreFileName } from "./data-files.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = getDataDir(rootDir);
const prisma = new PrismaClient();
const files = [
  ["tasks", taskStoreFileName],
  ["users", userStoreFileName],
  ["pet", petStoreFileName]
];

try {
  for (const [key, fileName] of files) {
    const value = JSON.parse(await readFile(join(dataDir, fileName), "utf8"));
    await prisma.appState.upsert({
      where: { key },
      create: { key, value },
      update: { value }
    });
    console.log(`已导入 ${fileName}`);
  }
  console.log("JSON 数据已导入 PostgreSQL。");
} finally {
  await prisma.$disconnect();
}
