import { NextResponse } from "next/server";
import { invalidJsonBodyError, unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { readJsonBody } from "@/lib/server-request";
import { createTask, listVisibleTasks } from "@/lib/server-task-store";
import { applyDraftPermission, parseTaskDraft } from "@/lib/server-task-validation";

export async function GET(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  return NextResponse.json({ tasks: await listVisibleTasks(currentUserId) });
}

export async function POST(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
  const parsedDraft = parseTaskDraft(json.body);
  if (!parsedDraft.ok) return NextResponse.json({ error: parsedDraft.error }, { status: 400 });
  const task = await createTask(applyDraftPermission(parsedDraft.draft, currentUserId), currentUserId);
  return NextResponse.json({ task }, { status: 201 });
}
