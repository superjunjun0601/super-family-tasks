import { spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkAppHealth } from "./app-health-check.mjs";
import { getConfiguredPort } from "./env.mjs";
import { formatLocalAccessError } from "./local-access-error.mjs";
import { getNetworkUrls } from "./network-urls.mjs";
import { npmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const PREVIEW_PORT = getConfiguredPort(ROOT_DIR, ["SUPER_FAMILY_PREVIEW_PORT"], 3035);
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/`;
const NETWORK_PREVIEW_URLS = getNetworkUrls(PREVIEW_PORT);

checkAppHealth(PREVIEW_PORT)
  .then((status) => {
    if (status === "running") {
      console.log("超人家族任务清单已经在运行：");
      printPreviewUrls();
      return;
    }
    if (status === "occupied") {
      console.error(`端口 ${PREVIEW_PORT} 已被其他服务占用。请先关闭它，或设置 SUPER_FAMILY_PREVIEW_PORT 换一个端口。`);
      process.exit(1);
    }
    startPreview();
  })
  .catch((error) => {
    console.error(`启动预览前检查失败：${formatPortCheckError(error)}`);
    process.exit(1);
  });

function startPreview() {
  console.log("启动超人家族任务清单预览：");
  printPreviewUrls();
  const child = spawn(npmCommand, ["run", "dev", "--", "-H", "0.0.0.0", "-p", String(PREVIEW_PORT)], {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

function printPreviewUrls() {
  console.log(`- 电脑本机：${PREVIEW_URL}`);
  if (NETWORK_PREVIEW_URLS.length) {
    for (const url of NETWORK_PREVIEW_URLS) {
      console.log(`- 手机同 Wi-Fi：${url}`);
    }
  } else {
    console.log("- 手机同 Wi-Fi：暂未识别到局域网 IPv4 地址");
  }
}

function formatPortCheckError(error) {
  return formatLocalAccessError(
    error,
    "当前环境不允许检查本机端口；请在普通终端运行 npm run app:preview，或确认安全软件/系统权限没有拦截 Node.js 本地网络访问。"
  );
}
