import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runNpmCommand } from "./npm-runner.mjs";

const ROOT_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

console.log("超人家族任务清单试用前检查");
console.log("- 第 1 步：检查真实数据、资源和类型。");
runNpmCommand(["run", "app:doctor"], ROOT_DIR);

console.log("\n- 第 2 步：用临时数据跑完整冒烟测试。");
runNpmCommand(["run", "app:smoke"], ROOT_DIR);

console.log("\n- 第 3 步：再次检查真实数据和类型文件，确认临时测试已清理干净。");
runNpmCommand(["run", "app:doctor"], ROOT_DIR);

console.log("\n试用前检查通过。可以运行：npm run app:preview");
