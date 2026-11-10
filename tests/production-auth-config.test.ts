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
  it("requires the publishable key and the verified runtime binding for prebuilt delivery", () => {
    const build = {
      VERCEL_ENV: "production",
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "tsilva/reshoot",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "fixture",
      VERCEL_PREBUILT_CLERK_RUNTIME_VERIFIED: "1",
    };
    expect(() => requireProductionClerkConfiguration(build)).not.toThrow();
    for (const patch of [
      { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined },
      { VERCEL_PREBUILT_CLERK_RUNTIME_VERIFIED: undefined },
      { GITHUB_ACTIONS: undefined },
      { GITHUB_REPOSITORY: "example/reshoot" },
    ]) {
      expect(() => requireProductionClerkConfiguration({ ...build, ...patch })).toThrow("Production requires");
    }
  });
  it("allows public local and Preview inspection without credentials", () => {
    expect(() => requireProductionClerkConfiguration({})).not.toThrow();
    expect(() => requireProductionClerkConfiguration({ VERCEL_ENV: "preview" })).not.toThrow();
  });
});
