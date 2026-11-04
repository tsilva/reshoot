import { describe, expect, it } from "vitest";
import { requireProductionClerkConfiguration } from "../lib/auth/config";

describe("production authentication configuration", () => {
  it("blocks production delivery with missing or incomplete Clerk configuration", () => {
    for (const settings of [{}, { CLERK_SECRET_KEY: "fixture" }, { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "fixture" }]) {
      expect(() => requireProductionClerkConfiguration({ VERCEL_ENV: "production", ...settings })).toThrow("Production requires");
    }
  });
  it("permits configured production without contacting a provider", () => {
    expect(() => requireProductionClerkConfiguration({ VERCEL_ENV: "production", CLERK_SECRET_KEY: "fixture", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "fixture" })).not.toThrow();
  });
  it("allows public local and Preview inspection without credentials", () => {
    expect(() => requireProductionClerkConfiguration({})).not.toThrow();
    expect(() => requireProductionClerkConfiguration({ VERCEL_ENV: "preview" })).not.toThrow();
  });
});
