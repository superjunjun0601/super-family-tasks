import { unauthorizedError } from "@/lib/api-error-codes";
import {
  cacheControlHeaderName,
  connectionHeaderName,
  contentTypeHeaderName,
  eventStreamCacheControlValue,
  eventStreamContentType,
  keepAliveConnectionValue
} from "@/lib/http-headers";
import { formatConnectedStreamFrame, formatHeartbeatStreamFrame, serverEventHeartbeatMs } from "@/lib/server-event-stream";
import { subscribeToServerEvents } from "@/lib/server-events";
import { getCurrentUserId } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return Response.json({ error: unauthorizedError }, { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let close: (() => void) | undefined;
  let isClosed = false;
  const handleAbort = () => close?.();

  const stream = new ReadableStream({
    start(controller) {
      close = () => {
        if (isClosed) return;
        isClosed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe?.();
        request.signal.removeEventListener("abort", handleAbort);
        try {
          controller.close();
        } catch {
          // The stream may already be closed by the client.
        }
      };
      request.signal.addEventListener("abort", handleAbort);
      safeEnqueue(controller, encoder.encode(formatConnectedStreamFrame()));

      unsubscribe = subscribeToServerEvents((event) => {
        safeEnqueue(
          controller,
          encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        );
      });

      heartbeat = setInterval(() => {
        safeEnqueue(controller, encoder.encode(formatHeartbeatStreamFrame()));
      }, serverEventHeartbeatMs);
    },
    cancel() {
      close?.();
    }
  });

  return new Response(stream, {
    headers: {
      [cacheControlHeaderName]: eventStreamCacheControlValue,
      [connectionHeaderName]: keepAliveConnectionValue,
      [contentTypeHeaderName]: eventStreamContentType
    }
  });

  function safeEnqueue(controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) {
    if (isClosed) return;
    try {
      controller.enqueue(chunk);
    } catch {
      close?.();
    }
  }
}
