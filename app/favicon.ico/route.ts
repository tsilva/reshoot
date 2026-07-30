import { NextResponse } from "next/server";

const FAVICON_PATH = "/brand/web-seo/favicon/favicon.ico";

export function GET(request: Request) {
  return NextResponse.redirect(new URL(FAVICON_PATH, request.url), 308);
}
