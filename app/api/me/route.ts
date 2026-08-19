import { NextResponse } from "next/server";
import { userNotFoundError } from "@/lib/api-error-codes";
import { findFamilyUser, getCurrentUserId } from "@/lib/server-auth";

export async function GET(request: Request) {
  const user = findFamilyUser(await getCurrentUserId(request));

  if (!user) {
    return NextResponse.json({ error: userNotFoundError }, { status: 401 });
  }

  return NextResponse.json({ user });
}
