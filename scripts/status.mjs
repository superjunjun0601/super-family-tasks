import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { healthApiPath } from "./api-paths.mjs";
import { checkAppHealth } from "./app-health-check.mjs";
import { getConfiguredPort } from "./env.mjs";
import { formatLocalAccessError, isLocalAccessBlocked } from "./local-access-error.mjs";
import { getNetworkUrls } from "./network-urls.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const STATUS_PORT = getConfiguredPort(ROOT_DIR, ["SUPER_FAMILY_STATUS_PORT", "SUPER_FAMILY_PREVIEW_PORT", "SUPER_FAMILY_START_PORT", "PORT"], 3035);
const LOCAL_URL = `http://localhost:${STATUS_PORT}/`;
const HEALTH_URL = `http://127.0.0.1:${STATUS_PORT}${healthApiPath}`;

console.log("超人家族任务清单运行状态");
console.log(`- 检查地址：${HEALTH_URL}`);

checkAppHealth(STATUS_PORT)
  .then((status) => {
    if (status === "running") {
      console.log("- 状态：正在运行");
      printUrls();
      return;
    }

    if (status === "occupied") {
      console.log("- 状态：端口有响应，但不是超人家族任务清单");
      console.log(`- 建议：换端口启动，或关闭占用 ${STATUS_PORT} 的服务。`);
      process.exit(1);
    }

    console.log("- 状态：未运行或当前权限无法访问");
    console.log("- 建议：先运行 npm run app:preview，再打开下面的地址。");
    printUrls();
    process.exit(1);
  })
  .catch((error) => {
    if (isLocalAccessBlocked(error)) {
      console.warn(`- 状态：当前环境无法访问本机检查地址`);
      console.warn(`- 原因：${formatStatusError(error)}`);
      console.warn("- 建议：如果浏览器能打开下面地址，服务本身通常就是正常的。");
      printUrls();
      process.exit(0);
    }

    console.error(`状态检查失败：${formatStatusError(error)}`);
    printUrls();
    process.exit(1);
  });

function printUrls() {
  console.log(`- 电脑本机：${LOCAL_URL}`);
  const networkUrls = getNetworkUrls(STATUS_PORT);
  if (networkUrls.length) {
    for (const url of networkUrls) console.log(`- 手机同 Wi-Fi：${url}`);
  } else {
    console.log("- 手机同 Wi-Fi：暂未识别到局域网 IPv4 地址");
  }
}

function formatStatusError(error) {
  return formatLocalAccessError(
    error,
    `当前环境不允许访问本机检查地址；请在普通终端运行 npm run app:status，或直接打开 http://localhost:${STATUS_PORT}/ 试一下。`
  );
}
