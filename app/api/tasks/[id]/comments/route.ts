import { NextResponse } from "next/server";
import { invalidJsonBodyError, unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { readJsonBody } from "@/lib/server-request";
import { addComment } from "@/lib/server-task-store";

export const dynamic = "force-dynamic";

type TaskActionContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: TaskActionContext) {
  const { id } = await context.params;
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
  const body = json.body && typeof json.body === "object" ? json.body as Record<string, unknown> : {};
  const result = await addComment(id, String(body.content ?? ""), currentUserId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task }, { status: 201 });
}
