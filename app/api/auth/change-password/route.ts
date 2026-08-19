import { NextResponse } from "next/server";
import { invalidJsonBodyError, unauthorizedError } from "@/lib/api-error-codes";
import { AUTH_COOKIE_NAME, createAuthCookieValue, getAuthCookieOptions, getCurrentUserId } from "@/lib/server-auth";
import { readJsonBody } from "@/lib/server-request";
import { changePassword } from "@/lib/server-user-store";

export async function POST(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
  const body = json.body && typeof json.body === "object" ? json.body as Record<string, unknown> : {};
  const result = await changePassword(
    userId,
    String(body.currentPassword ?? ""),
    String(body.nextPassword ?? "")
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const response = NextResponse.json({ user: result.user });
  response.cookies.set(AUTH_COOKIE_NAME, await createAuthCookieValue(userId), getAuthCookieOptions());
  return response;
}
