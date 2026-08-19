import { contentTypeHeaderName, jsonContentType } from "@/lib/http-headers";

export class ApiRequestError extends Error {
  error?: string;
  status: number;

  constructor(status: number, error?: string) {
    super(`Request failed: ${status}`);
    this.error = error;
    this.status = status;
  }
}

export async function apiRequest<T>(
  url: string,
  options: { body?: unknown; method?: string } = {}
): Promise<T> {
  const response = await fetch(url, {
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin",
    headers: {
      ...(options.body ? { [contentTypeHeaderName]: jsonContentType } : {})
    },
    method: options.method ?? "GET"
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(response.status, typeof data?.error === "string" ? data.error : undefined);
  }

  return data as T;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}
