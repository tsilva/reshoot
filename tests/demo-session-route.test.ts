import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ resolveUser: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ resolveCurrentUser: state.resolveUser }));

import { POST } from "../app/api/demo-session/route";

describe("shared workspace compatibility endpoint", () => {
  beforeEach(() => { state.resolveUser.mockReset(); });

  it.each([false, true])("opens the shared workspace without setting a browser cookie (inline: %s)", async (inline) => {
    const response = await POST(new Request("https://reshoot.tsilva.eu/api/demo-session", {
      method: "POST", headers: { origin: "https://reshoot.tsilva.eu", ...(inline ? { accept: "application/json" } : {}) },
    }));
    expect(response.status).toBe(inline ? 200 : 303);
    if (inline) {
      expect(await response.json()).toEqual({ ready: true });
    } else {
      expect(response.headers.get("location")).toBe("https://reshoot.tsilva.eu/");
    }
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(state.resolveUser).toHaveBeenCalledOnce();
  });

  it("rejects requests from another origin", async () => {
    const response = await POST(new Request("https://reshoot.tsilva.eu/api/demo-session", {
      method: "POST", headers: { origin: "https://another.example" },
    }));
    expect(response.status).toBe(403);
    expect(state.resolveUser).not.toHaveBeenCalled();
  });
});
