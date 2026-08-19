import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAppHealth } from "./app-health-check.mjs";
import { authSecretPlaceholderSnippet, localDevAuthSecret } from "./auth-values.mjs";
import { canWriteDataDir, getDataDir } from "./data-dir.mjs";
import { getConfiguredPort, getConfiguredSecret } from "./env.mjs";
import { formatLocalAccessError } from "./local-access-error.mjs";
import { getNetworkUrls } from "./network-urls.mjs";
import { npmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const START_PORT = getConfiguredPort(ROOT_DIR, ["SUPER_FAMILY_START_PORT", "PORT"], 3035);
const START_URL = `http://localhost:${START_PORT}/`;
const BUILD_ID_PATH = join(ROOT_DIR, ".next", "BUILD_ID");
const NETWORK_START_URLS = getNetworkUrls(START_PORT);

checkAppHealth(START_PORT)
  .then((status) => {
    if (status === "running") {
      console.log("超人家族任务清单已经在运行：");
      printStartUrls();
      return;
    }
    if (status === "occupied") {
      console.error(`端口 ${START_PORT} 已被其他服务占用。请先关闭它，或设置 SUPER_FAMILY_START_PORT 换一个端口。`);
      process.exit(1);
    }
    startProductionServer();
  })
  .catch((error) => {
    console.error(`启动正式服务前检查失败：${formatPortCheckError(error)}`);
    process.exit(1);
  });

function startProductionServer() {
  if (!existsSync(BUILD_ID_PATH)) {
    console.error("还没有正式构建产物 .next/BUILD_ID。请先运行：npm run app:build");
    process.exit(1);
  }

  if (!canWriteDataDir(ROOT_DIR)) {
    console.error(`数据目录不可读写：${getDataDir(ROOT_DIR)}`);
    console.error("请修复 SUPER_FAMILY_DATA_DIR 或目录权限后再启动。");
    process.exit(1);
  }

  if (!hasConfiguredAuthSecret()) {
    console.warn("提醒：当前未设置 AUTH_SECRET。正式部署前建议配置一个足够长的随机密钥。");
  }

  console.log("启动超人家族任务清单正式服务：");
  printStartUrls();
  const child = spawn(npmCommand, ["run", "start", "--", "-H", "0.0.0.0", "-p", String(START_PORT)], {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

function printStartUrls() {
  console.log(`- 电脑本机：${START_URL}`);
  if (NETWORK_START_URLS.length) {
    for (const url of NETWORK_START_URLS) {
      console.log(`- 手机同 Wi-Fi：${url}`);
    }
  } else {
    console.log("- 手机同 Wi-Fi：暂未识别到局域网 IPv4 地址");
  }
}

function hasConfiguredAuthSecret() {
  const authSecret = getConfiguredSecret(ROOT_DIR, ["AUTH_SECRET", "NEXTAUTH_SECRET"]);
  return Boolean(authSecret && authSecret !== localDevAuthSecret && !authSecret.includes(authSecretPlaceholderSnippet));
}

function formatPortCheckError(error) {
  return formatLocalAccessError(
    error,
    "当前环境不允许检查本机端口；请在服务器普通终端运行 npm run app:start，或确认安全软件/系统权限没有拦截 Node.js 本地网络访问。"
  );
}
