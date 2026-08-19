export const connectedStreamEventType = "connected";
export const connectedStreamData = "{\"ok\":true}";
export const heartbeatStreamComment = "heartbeat";
export const serverEventHeartbeatMs = 25000;

export function formatConnectedStreamFrame() {
  return `event: ${connectedStreamEventType}\ndata: ${connectedStreamData}\n\n`;
}

export function formatHeartbeatStreamFrame() {
  return `: ${heartbeatStreamComment}\n\n`;
}
