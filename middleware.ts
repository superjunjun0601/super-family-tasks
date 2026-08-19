import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cacheControlHeaderName, noStoreCacheControlValue } from "@/lib/http-headers";

export function middleware(_request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set(cacheControlHeaderName, noStoreCacheControlValue);
  return response;
}

export const config = {
  matcher: ["/api/:path*"]
};
