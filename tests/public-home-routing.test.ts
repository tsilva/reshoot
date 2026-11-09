import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClerkMiddlewareAuth } from "@clerk/nextjs/server";
import middleware from "../middleware";

const state = vi.hoisted(() => ({ auth: vi.fn(), configured: vi.fn(), handshake: vi.fn() }));
vi.mock("@/lib/auth/config", () => ({ clerkConfigured: state.configured }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkMiddleware: (handler: (auth: ClerkMiddlewareAuth, request: NextRequest) => Promise<Response | undefined>) =>
    async (request: NextRequest) => state.handshake() ?? await handler(state.auth as unknown as ClerkMiddlewareAuth, request) ?? NextResponse.next(),
}));

const origin = "https://reshoot.example";

function route(path: string, options?: ConstructorParameters<typeof NextRequest>[1]) {
  const headers = new Headers({ accept: "text/html" });
  new Headers(options?.headers).forEach((value, name) => headers.set(name, value));
  const request = new NextRequest(new URL(path, origin), { ...options, headers });
  const event = { waitUntil: vi.fn() } as unknown as Parameters<typeof middleware>[1];
  return middleware(request, event);
}

describe("public homepage routing", () => {
  beforeEach(() => {
    state.auth.mockReset().mockResolvedValue({ userId: null });
    state.configured.mockReset().mockReturnValue(true);
    state.handshake.mockReset();
  });

  it("uses the prerender for a signed-out document request", async () => {
    const response = await route("/");
    expect(response?.headers.get("x-middleware-rewrite")).toBe(`${origin}/public-home.html`);
    expect(response?.headers.get("cache-control")).toBe("private, no-store");
    expect(response?.headers.get("cdn-cache-control")).toBe("private, no-store");
  });

  it("keeps a signed-in visitor on the account-aware homepage", async () => {
    state.auth.mockResolvedValue({ userId: "user_fixture" });
    const response = await route("/");
    expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response?.headers.get("x-middleware-next")).toBe("1");
  });

  it("preserves a Clerk handshake redirect before resolving a homepage variant", async () => {
    const handshake = NextResponse.redirect("https://clerk.example/handshake");
    state.handshake.mockReturnValue(handshake);
    expect(await route("/")).toBe(handshake);
    expect(state.auth).not.toHaveBeenCalled();
  });

  it("passes account links, write methods and bearer authentication through", async () => {
    for (const response of [
      await route("/?wallet=open"),
      await route("/?project=sample"),
      await route("/", { method: "POST" }),
      await route("/", { headers: { authorization: "Bearer fixture" } }),
    ]) {
      expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
    }
    expect(state.auth).not.toHaveBeenCalled();
  });

  it("keeps client navigation on the dynamic route", async () => {
    for (const response of [
      await route("/?_rsc=flight", { headers: { accept: "*/*", "sec-fetch-dest": "empty" } }),
      await route("/", { headers: { "sec-fetch-dest": "empty" } }),
    ]) {
      expect(response?.headers.get("x-middleware-rewrite")).toBeNull();
    }
    expect(state.auth).not.toHaveBeenCalled();
  });
});
