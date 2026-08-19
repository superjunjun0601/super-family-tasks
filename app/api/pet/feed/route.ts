import { NextResponse } from "next/server";
import { unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { feedPet } from "@/lib/server-pet-store";

export async function POST(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  const result = await feedPet();
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ pet: result.pet, flowerBalance: result.flowerBalance });
}
