import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { clerkConfigured } from "@/lib/auth/config";

// The static HTML route is excluded by the proxy matcher.
const PUBLIC_HOME_PATH = "/public-home.html";
const HOME_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "private, no-store",
};

function isPublicHomeCandidate(request: NextRequest) {
  return request.nextUrl.pathname === "/"
    && !request.nextUrl.search
    && (request.method === "GET" || request.method === "HEAD")
    && !request.headers.has("authorization")
    && request.headers.get("sec-fetch-dest") !== "empty"
    && request.headers.get("accept")?.includes("text/html");
}

function rewritePublicHome(request: NextRequest) {
  return NextResponse.rewrite(new URL(PUBLIC_HOME_PATH, request.url), {
    // The build artifact is public. The response at "/" is selected per session.
    headers: HOME_RESPONSE_HEADERS,
  });
}

const withClerk = clerkMiddleware(async (auth, request) => {
  if (isPublicHomeCandidate(request) && (await auth()).userId === null) {
    return rewritePublicHome(request);
  }
});

export default function proxy(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  // Never provision a keyless Clerk application or fall back to the shared demo.
  if (!clerkConfigured()) {
    return isPublicHomeCandidate(request) ? rewritePublicHome(request) : NextResponse.next();
  }
  return withClerk(request, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
