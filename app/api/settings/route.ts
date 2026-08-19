import { NextResponse } from "next/server";
import { invalidJsonBodyError, invalidReminderSettingsError, unauthorizedError } from "@/lib/api-error-codes";
import { parseReminderSettingsUpdate } from "@/lib/reminder-settings";
import { getCurrentUserId } from "@/lib/server-auth";
import { readJsonBody } from "@/lib/server-request";
import { getReminderSettings, updateReminderSettings } from "@/lib/server-user-store";

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  return NextResponse.json({ reminderSettings: await getReminderSettings(userId) });
}

export async function PUT(request: Request) {
  const userId = await getCurrentUserId(request);
  if (!userId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });

  const json = await readJsonBody(request);
  if (!json.ok) return NextResponse.json({ error: invalidJsonBodyError }, { status: 400 });

  const parsedSettings = parseReminderSettingsUpdate(json.body);
  if (!parsedSettings) return NextResponse.json({ error: invalidReminderSettingsError }, { status: 400 });

  const result = await updateReminderSettings(userId, parsedSettings);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ reminderSettings: result.settings });
}
