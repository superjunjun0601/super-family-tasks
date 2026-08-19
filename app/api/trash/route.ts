import { NextResponse } from "next/server";
import { unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { createManualDataBackup } from "@/lib/server-data-backup";
import { clearTrash, listVisibleTrashTasks } from "@/lib/server-task-store";

export async function GET(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  return NextResponse.json({ tasks: await listVisibleTrashTasks(currentUserId) });
}

export async function DELETE(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  await createManualDataBackup();
  const result = await clearTrash(currentUserId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
