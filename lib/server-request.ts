const MAX_JSON_BODY_BYTES = 64 * 1024;

export async function readJsonBody(request: Request): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_JSON_BODY_BYTES) return { ok: false };

    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) return { ok: false };
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
