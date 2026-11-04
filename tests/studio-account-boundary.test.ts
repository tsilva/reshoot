import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: vi.fn(), credits: vi.fn(), projects: vi.fn() }));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/lib/auth/current-user", () => ({ findCurrentUser: state.user }));
vi.mock("@/lib/credits/service", () => ({ getCreditSummary: state.credits }));
vi.mock("@/lib/projects/service", () => ({ listProjects: state.projects }));
vi.mock("@/components/StudioHome", () => ({ StudioHome: () => null }));
import { StudioPage } from "../components/StudioPage";

describe("studio account boundary", () => {
  beforeEach(() => {
    state.user.mockReset().mockResolvedValue(null);
    state.credits.mockReset().mockResolvedValue({ availableCredits: 0 });
    state.projects.mockReset().mockResolvedValue([]);
  });

  it("does not load a wallet or projects for public visitors", async () => {
    const page = await StudioPage({});
    expect(page.key).toBe("signed-out");
    expect(page.props).toMatchObject({ currentUser: null, initialCredits: null, initialProjects: [] });
    expect(state.credits).not.toHaveBeenCalled();
    expect(state.projects).not.toHaveBeenCalled();
  });

  it("remounts client state when the signed-in identity changes", async () => {
    state.user.mockResolvedValueOnce({ id: "one", displayName: "One", email: "one@example.invalid", isDemo: true })
      .mockResolvedValueOnce({ id: "two", displayName: "Two", email: "two@example.invalid", isDemo: true });
    const first = await StudioPage({});
    const second = await StudioPage({});
    expect(first.key).toBe("one");
    expect(second.key).toBe("two");
    expect(state.credits.mock.calls).toEqual([["one", true], ["two", true]]);
    expect(state.projects.mock.calls).toEqual([["one"], ["two"]]);
  });

  it("sends signed-out wallet visitors through sign-in with their return destination", async () => {
    await expect(StudioPage({ walletOpen: true })).rejects.toThrow("redirect:/login?returnTo=%2F%3Fwallet%3Dopen");
    expect(state.credits).not.toHaveBeenCalled();
  });
});
