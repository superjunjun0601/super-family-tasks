export function isLocalAccessBlocked(error) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  return code === "EPERM" || code === "EACCES";
}

export function formatLocalAccessError(error, blockedMessage) {
  const message = error instanceof Error ? error.message : String(error);
  return isLocalAccessBlocked(error) ? `${message}。${blockedMessage}` : message;
}
