import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAppHealth } from "./app-health-check.mjs";
import { getConfiguredPort } from "./env.mjs";
import { formatLocalAccessError } from "./local-access-error.mjs";
import { runNpmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const buildPort = readBuildPort();

console.log("超人家族任务清单正式构建");
await ensureNoRunningAppOnBuildPort();

console.log("- 先运行隔离健康检查，确认数据、类型和生产构建都没问题。");
runNpmCommand(["run", "app:doctor", "--", "--with-build"], ROOT_DIR);

console.log("\n- 生成正式 .next 构建，供 npm run app:start 使用。");
runNpmCommand(["run", "build"], ROOT_DIR);

console.log("\n正式构建完成。可以运行：npm run app:start");

async function ensureNoRunningAppOnBuildPort() {
  try {
    const status = await checkAppHealth(buildPort);
    if (status !== "running") return;

    console.error(`检测到超人家族任务清单正在 http://localhost:${buildPort}/ 运行。`);
    console.error("正式构建会写入 .next，建议先停止 npm run app:preview 或 npm run app:start，再重新运行 npm run app:build。");
    process.exit(1);
  } catch (error) {
    console.error(`无法检查 ${buildPort} 端口是否正在运行：${formatPortCheckError(error)}`);
    console.error("为避免覆盖正在预览或正式运行中的 .next，请先确认服务已停止，再在普通终端重新运行 npm run app:build。");
    process.exit(1);
  }
}

function formatPortCheckError(error) {
  return formatLocalAccessError(error, "当前环境不允许检查本机端口。");
}

function readBuildPort() {
  try {
    return getConfiguredPort(ROOT_DIR, ["SUPER_FAMILY_PREVIEW_PORT", "SUPER_FAMILY_START_PORT", "PORT"], 3035);
  } catch (error) {
    console.error(formatPortCheckError(error));
    process.exit(1);
  }
}
