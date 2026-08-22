import { NextResponse } from "next/server";
import { unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { feedPet } from "@/lib/server-pet-store";

export async function POST(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const body = await request.json().catch(() => null);
  const count = body && typeof body === "object" ? (body as { count?: unknown }).count : undefined;
  const result = await feedPet(typeof count === "number" ? count : 1);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ pet: result.pet, flowerBalance: result.flowerBalance });
}
