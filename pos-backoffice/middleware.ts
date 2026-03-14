import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Eski /pos ile başlayan linkleri kalıcı olarak (301) root adreslerine yönlendirir.
 * Örn: /pos/login -> /login, /pos/dashboard -> /dashboard
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/pos")) {
    const newPath = pathname === "/pos" || pathname === "/pos/" ? "/" : pathname.replace(/^\/pos/, "") || "/";
    return NextResponse.redirect(new URL(newPath, request.url), 301);
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/pos/:path*",
};
