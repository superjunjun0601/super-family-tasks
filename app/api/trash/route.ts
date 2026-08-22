import { NextResponse } from "next/server";
import { invalidJsonBodyError, unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { createManualDataBackup } from "@/lib/server-data-backup";
import { readJsonBody } from "@/lib/server-request";
import { clearTrash, listVisibleTrashTasks } from "@/lib/server-task-store";

export async function GET(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  return NextResponse.json({ tasks: await listVisibleTrashTasks(currentUserId) });
}

export async function DELETE(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  let taskIds: string[] | undefined;
  if (Number(request.headers.get("content-length") ?? 0) > 0) {
    const json = await readJsonBody(request);
    if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
    const rawTaskIds = isRecord(json.body) ? json.body.taskIds : undefined;
    if (rawTaskIds !== undefined) {
      if (!Array.isArray(rawTaskIds) || rawTaskIds.some((taskId) => typeof taskId !== "string")) {
        return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
      }
      taskIds = rawTaskIds;
    }
  }
  await createManualDataBackup();
  const result = await clearTrash(currentUserId, taskIds);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
