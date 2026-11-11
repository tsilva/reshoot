import { describe, expect, it, vi } from "vitest";
import { createDatabasePool } from "../lib/db/connection";

const capture = vi.hoisted(() => vi.fn());
vi.mock("@sentry/nextjs", () => ({ captureException: capture }));

describe("idle hosted database connections", () => {
  it("reports a disconnected idle client without crashing the process", async () => {
    const pool = createDatabasePool({
      DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/fixture",
    });
    const error = new Error("Connection terminated unexpectedly");
    try {
      expect(() => pool.emit("error", error)).not.toThrow();
      expect(capture).toHaveBeenCalledWith(error, {
        tags: { component: "database-pool" },
      });
      expect(pool.listenerCount("error")).toBe(1);
    } finally {
      await pool.end();
    }
  });
});
