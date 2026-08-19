import { spawnSync } from "node:child_process";

export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

export function runNpmCommand(args, cwd) {
  const result = spawnSync(npmCommand, args, {
    cwd,
    encoding: "utf8",
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
