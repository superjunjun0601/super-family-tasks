import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, getClearAuthCookieOptions } from "@/lib/server-auth";

export function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE_NAME, "", getClearAuthCookieOptions());
  return response;
}
