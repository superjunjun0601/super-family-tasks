import { NextResponse } from "next/server";
import { invalidCredentialsError, invalidJsonBodyError, tooManyLoginAttemptsError } from "@/lib/api-error-codes";
import { retryAfterHeaderName } from "@/lib/http-headers";
import { AUTH_COOKIE_NAME, createAuthCookieValue, getAuthCookieOptions } from "@/lib/server-auth";
import { clearFailedLogins, getLoginBlockStatus, recordFailedLogin } from "@/lib/server-login-rate-limit";
import { readJsonBody } from "@/lib/server-request";
import { findPrototypeUser, validatePassword } from "@/lib/server-user-store";

export async function POST(request: Request) {
  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });
  const body = json.body && typeof json.body === "object" ? json.body as Record<string, unknown> : {};
  const userId = String(body.userId ?? "");
  const blockStatus = await getLoginBlockStatus(request, userId);
  if (blockStatus.blocked) {
    return NextResponse.json(
      { error: tooManyLoginAttemptsError, retryAfterSeconds: blockStatus.retryAfterSeconds },
      {
        headers: { [retryAfterHeaderName]: String(blockStatus.retryAfterSeconds) },
        status: 429
      }
    );
  }

  const user = findPrototypeUser(userId);

  if (!user || !(await validatePassword(user.id, String(body.password ?? "")))) {
    const failedLogin = await recordFailedLogin(request, userId);
    if (failedLogin.blocked) {
      return NextResponse.json(
        { error: tooManyLoginAttemptsError, retryAfterSeconds: failedLogin.retryAfterSeconds },
        {
          headers: { [retryAfterHeaderName]: String(failedLogin.retryAfterSeconds) },
          status: 429
        }
      );
    }
    return NextResponse.json({ error: invalidCredentialsError }, { status: 401 });
  }

  await clearFailedLogins(request, user.id);
  const response = NextResponse.json({ user });
  response.cookies.set(AUTH_COOKIE_NAME, await createAuthCookieValue(user.id), getAuthCookieOptions());
  return response;
}
