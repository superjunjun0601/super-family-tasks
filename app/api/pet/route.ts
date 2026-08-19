import { NextResponse } from "next/server";
import { unauthorizedError } from "@/lib/api-error-codes";
import { getCurrentUserId } from "@/lib/server-auth";
import { getFlowerBalance, getPetStore } from "@/lib/server-pet-store";

export async function GET(request: Request) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) return NextResponse.json({ error: unauthorizedError }, { status: 401 });
  return NextResponse.json({ pet: await getPetStore(), flowerBalance: await getFlowerBalance() });
}
