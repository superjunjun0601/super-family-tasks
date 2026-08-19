import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readEnvFileValue(rootDir, fileName, key) {
  const filePath = join(rootDir, fileName);
  if (!existsSync(filePath)) return "";

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const equalsIndex = trimmedLine.indexOf("=");
    if (equalsIndex <= 0) continue;
    if (trimmedLine.slice(0, equalsIndex).trim() !== key) continue;
    return trimmedLine.slice(equalsIndex + 1).trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

export function getConfiguredValue(rootDir, envNames, fallbackValue = "") {
  for (const envName of envNames) {
    const rawValue = process.env[envName]?.trim();
    if (rawValue) return rawValue;
  }

  for (const envName of envNames) {
    const fileValue = readEnvFileValue(rootDir, ".env.local", envName) || readEnvFileValue(rootDir, ".env", envName);
    if (fileValue) return fileValue;
  }

  return fallbackValue;
}

export function getConfiguredPort(rootDir, envNames, fallbackPort) {
  const rawValue = getConfiguredValue(rootDir, envNames, "");
  if (!rawValue) return fallbackPort;
  const port = Number(rawValue);
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) {
    const envName = envNames.find((name) => process.env[name]?.trim()) ?? envNames[0];
    throw new Error(`${envName} 必须是 1-65535 之间的端口数字，当前值：${rawValue}`);
  }
  return port;
}

export function getConfiguredSecret(rootDir, envNames) {
  return getConfiguredValue(rootDir, envNames, "");
}
