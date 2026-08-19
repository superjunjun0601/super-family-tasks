import { NextResponse } from "next/server";
import { invalidJsonBodyError, taskNotFoundError, unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { readJsonBody } from "@/lib/server-request";
import { deleteTask, getVisibleTask, updateTask } from "@/lib/server-task-store";
import { applyDraftPermission, parseTaskDraft } from "@/lib/server-task-validation";
import { seriesTaskUpdateScope, singleTaskUpdateScope } from "@/lib/task-update-scope";

export const dynamic = "force-dynamic";

type TaskRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: TaskRouteContext) {
  const { id } = await context.params;
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const task = await getVisibleTask(id, currentUserId);
  if (!task) return NextResponse.json({ error: taskNotFoundError }, { status: 404 });
  return NextResponse.json({ task });
}

export async function PUT(request: Request, context: TaskRouteContext) {
  const { id } = await context.params;
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
  const parsedDraft = parseTaskDraft(json.body);
  if (!parsedDraft.ok) return NextResponse.json({ error: parsedDraft.error }, { status: 400 });
  const updateScope = getUpdateScope(json.body);
  const result = await updateTask(id, applyDraftPermission(parsedDraft.draft, currentUserId), currentUserId, updateScope);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}

export async function DELETE(request: Request, context: TaskRouteContext) {
  const { id } = await context.params;
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const result = await deleteTask(id, currentUserId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}

function getUpdateScope(value: unknown) {
  if (!value || typeof value !== "object" || !("updateScope" in value)) return singleTaskUpdateScope;
  return value.updateScope === seriesTaskUpdateScope ? seriesTaskUpdateScope : singleTaskUpdateScope;
}
