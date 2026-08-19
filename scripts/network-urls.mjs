import { networkInterfaces } from "node:os";

export function getNetworkUrls(port) {
  const urls = [];
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      urls.push(`http://${address.address}:${port}/`);
    }
  }
  return Array.from(new Set(urls));
}
