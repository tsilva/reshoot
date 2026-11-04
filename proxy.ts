import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { clerkConfigured } from "@/lib/auth/config";

const withClerk = clerkMiddleware();

export default function proxy(request: NextRequest, event: Parameters<typeof withClerk>[1]) {
  // Never provision a keyless Clerk application or fall back to the shared demo.
  if (!clerkConfigured()) return NextResponse.next();
  return withClerk(request, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
