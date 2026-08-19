import { accessSync, constants, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { getConfiguredValue } from "./env.mjs";

export function getDataDir(rootDir) {
  const configuredDataDir = getConfiguredValue(rootDir, ["SUPER_FAMILY_DATA_DIR"]);
  return configuredDataDir ? resolve(rootDir, configuredDataDir) : join(rootDir, "data");
}

export function canWriteDataDir(rootDir) {
  try {
    const dataDir = getDataDir(rootDir);
    mkdirSync(dataDir, { recursive: true });
    accessSync(dataDir, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}
