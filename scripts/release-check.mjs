import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runNpmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

console.log("超人家族任务清单正式发布前检查");
console.log("- 第 1 步：运行家庭试用完整检查。");
runNpmCommand(["run", "app:trial-check"], ROOT_DIR);

console.log("\n- 第 2 步：运行隔离生产构建检查。");
runNpmCommand(["run", "app:doctor", "--", "--with-build"], ROOT_DIR);

console.log("\n正式发布前检查通过。生成正式构建前请先停止 app:preview 或 app:start，然后运行：npm run app:build");
