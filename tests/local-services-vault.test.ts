import { afterEach, describe, expect, it, vi } from "vitest";
import { clerkConfigured } from "../lib/auth/config";
import { CLERK_PLACEHOLDER, clerkRequestAllowed, validateClerkSession } from "../lib/auth/vault-session.mjs";
import { createVaultStorage, validateStorageSession } from "../lib/storage/vault-storage.mjs";

const common = { NODE_ENV: "development", NODE_USE_ENV_PROXY: "1", HTTP_PROXY: "http://fake:fixture@127.0.0.1:8283",
  HTTPS_PROXY: "http://fake:fixture@127.0.0.1:8283" };
const clerk = { ...common, RESHOOT_CLERK_TRANSPORT: "agent-vault", CLERK_SECRET_KEY: CLERK_PLACEHOLDER,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_" + Buffer.from("fixture.clerk.accounts.dev$").toString("base64") };
const storage = { ...common, RESHOOT_STORAGE_TRANSPORT: "agent-vault", RESHOOT_STORAGE_TOKEN: "reshoot_storage_public_placeholder",
  RESHOOT_STORAGE_BASE_URL: "http://127.0.0.1:16783/" };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("local sign-in and storage Vault policy", () => {
  it("preserves missing Clerk configuration with ordinary defaults", () => {
    vi.stubEnv("RESHOOT_CLERK_TRANSPORT", undefined); vi.stubEnv("CLERK_SECRET_KEY", undefined);
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", undefined); expect(clerkConfigured()).toBe(false);
  });
  it("accepts only Development public keys and placeholder backend keys", () => {
    expect(validateClerkSession(clerk)).toBe(true);
    for (const patch of [{CLERK_SECRET_KEY:"sk_test_fake_private"}, {NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:"pk_live_fake"},
      {NODE_ENV:"production"}, {RESHOOT_CLERK_TRANSPORT:""}, {VERCEL:"1"}, {CLERK_JWT_KEY:"fake"},
      {CLERK_API_URL:"https://unrelated.invalid"}, {NO_PROXY:"*"}, {NODE_TLS_REJECT_UNAUTHORIZED:"0"}]) {
      expect(() => validateClerkSession({...clerk, ...patch})).toThrow();
    }
  });
  it("allows verification, profile and handshake reads; denies writes, lists and arbitrary queries", () => {
    const headers = new Headers({Authorization:`Bearer ${CLERK_PLACEHOLDER}`});
    for (const path of ["/v1/jwks", "/v1/users/user_fixture", "/v1/clients/handshake_payload?nonce=fixture-nonce"])
      expect(clerkRequestAllowed(new URL(path,"https://api.clerk.com"),"GET",headers)).toBe(true);
    for (const path of ["/v1/users", "/v1/jwks?extra=1", "/v1/users/user_fixture/tokens", "/v1/clients/handshake_payload?nonce=x&nonce=y"])
      expect(clerkRequestAllowed(new URL(path,"https://api.clerk.com"),"GET",headers)).toBe(false);
    expect(clerkRequestAllowed(new URL("https://api.clerk.com/v1/users/user_fixture"),"POST",headers)).toBe(false);
  });
  it("rejects storage fallback, hosted runs, source keys and bypasses", () => {
    expect(validateStorageSession(storage)).toBe(storage.RESHOOT_STORAGE_BASE_URL);
    for (const patch of [{RESHOOT_STORAGE_TOKEN:"fake-private"}, {R2_SECRET_ACCESS_KEY:"fake"}, {AWS_ACCESS_KEY_ID:"fake"},
      {RESHOOT_STORAGE_TRANSPORT:""}, {NODE_ENV:"production"}, {VERCEL_ENV:"preview"},
      {RESHOOT_STORAGE_BASE_URL:"http://unrelated.invalid/"}, {HTTP_PROXY:"http://127.0.0.1:8283"}, {NO_PROXY:"*"}])
      expect(() => createVaultStorage({...storage, ...patch})).toThrow();
  });
  it("never returns provider errors or retries ambiguous storage writes", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("fake-private-provider-diagnostic", {status:503}));
    vi.stubGlobal("fetch",fetch);
    const client = createVaultStorage(storage);
    await expect(client.putObject({key:"users/a/projects/b/archive.zip",body:Buffer.from("fake"),mimeType:"application/zip"})).rejects.toThrow("details withheld");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].headers["Reshoot-Storage-Token"]).toBe("reshoot_storage_public_placeholder");
  });
  it("rejects unreviewed download URL origins", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({url:"https://unrelated.invalid/object"})));
    await expect(createVaultStorage(storage).signRead("users/a/projects/b/source")).rejects.toThrow("Invalid local storage capability");
  });
});
