import { accessSync, constants, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function getServerDataDir() {
  const configuredDataDir = process.env.SUPER_FAMILY_DATA_DIR?.trim();
  return configuredDataDir ? resolve(configuredDataDir) : join(process.cwd(), "data");
}

export function hasConfiguredServerDataDir() {
  return Boolean(process.env.SUPER_FAMILY_DATA_DIR?.trim());
}

export function canWriteServerDataDir() {
  try {
    const dataDir = getServerDataDir();
    mkdirSync(dataDir, { recursive: true });
    accessSync(dataDir, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
