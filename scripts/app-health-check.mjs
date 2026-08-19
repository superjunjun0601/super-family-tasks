import { request } from "node:http";
import { healthApiPath } from "./api-paths.mjs";
import { appServiceName } from "./app-metadata.mjs";

export function checkAppHealth(port) {
  return new Promise((resolve, reject) => {
    const req = request(`http://127.0.0.1:${port}${healthApiPath}`, { method: "GET", timeout: 1400 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed?.service === appServiceName ? "running" : "occupied");
        } catch {
          resolve("occupied");
        }
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("端口检查超时"));
    });
    req.on("error", (error) => {
      if (error && "code" in error && error.code === "ECONNREFUSED") {
        resolve("empty");
        return;
      }
      reject(error);
    });
    req.end();
  });
}
