import { NextRequest, NextResponse } from "next/server";
import { decryptSession } from "@/lib/session";

// Routes that do NOT require authentication
const PUBLIC_ROUTES = ["/", "/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(r + "/")
  );

  const token = req.cookies.get("simrs_session")?.value;
  const session = token ? await decryptSession(token) : null;

  // If not logged in and trying to access protected route → redirect to login
  if (!session && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If logged in and visiting landing or login → redirect to dashboard
  if (session && (pathname === "/login" || pathname === "/")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)",
  ],
};
