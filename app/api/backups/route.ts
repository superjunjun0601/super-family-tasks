import { NextResponse } from "next/server";
import { noPermissionError, unauthorizedError } from "@/lib/api-error-codes";
import { momUserId } from "@/lib/family-users";
import { findFamilyUser, getCurrentUserId } from "@/lib/server-auth";
import { createManualDataBackup } from "@/lib/server-data-backup";

export async function POST(request: Request) {
  const currentUser = findFamilyUser(await getCurrentUserId(request));
  if (!currentUser) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  if (currentUser.role !== momUserId) return NextResponse.json({ error: noPermissionError }, { status: 403 });

  const backup = await createManualDataBackup();
  return NextResponse.json({ backup }, { status: 201 });
}
