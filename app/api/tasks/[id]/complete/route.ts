import { NextResponse } from "next/server";
import { unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { completeTask } from "@/lib/server-task-store";

export const dynamic = "force-dynamic";

type TaskActionContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: TaskActionContext) {
  const { id } = await context.params;
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const result = await completeTask(id, currentUserId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ task: result.task });
}
