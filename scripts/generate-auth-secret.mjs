import { randomBytes } from "node:crypto";

const secret = randomBytes(32).toString("base64url");

console.log("可用于正式部署的 AUTH_SECRET：");
console.log(secret);
console.log("\n复制到 .env 或部署平台环境变量：");
console.log(`AUTH_SECRET="${secret}"`);
