import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

function lockedVersions(packageName: string): string[] {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  ${escaped}@([^:\\s(]+)(?:\\([^)]*\\))?:`, "gm");
  return [...new Set([...lockfile.matchAll(pattern)].map((match) => match[1]))].sort();
}

describe("dependency security boundaries", () => {
  it("keeps every formerly vulnerable package on a remediated version", () => {
    expect(lockedVersions("brace-expansion")).toEqual(["1.1.18", "2.1.4", "5.0.9"]);
    expect(lockedVersions("esbuild")).toEqual(["0.25.12", "0.28.1"]);
    expect(lockedVersions("fast-uri")).toEqual(["3.1.5"]);
    expect(lockedVersions("js-yaml")).toEqual(["4.3.1"]);
    expect(lockedVersions("nanoid")).toEqual(["3.3.18", "5.1.16"]);
    expect(lockedVersions("undici")).toEqual(["7.29.0"]);
  });

  it("has no known vulnerabilities in the complete dependency graph", () => {
    const audit = JSON.parse(
      execFileSync("pnpm", ["audit", "--json"], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
      }),
    );

    expect(audit.metadata.vulnerabilities).toEqual({
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
    });
  });

  it("rejects exotic and newly published package sources", () => {
    const importers = lockfile.slice(
      lockfile.indexOf("importers:"),
      lockfile.indexOf("packages:"),
    );
    expect(importers).not.toMatch(
      /specifier:\s*(?:git\+|github:|https?:|file:|link:|workspace:)/,
    );
    expect(readFileSync(".npmrc", "utf8")).toContain("minimum-release-age=10080");
    expect(readFileSync(".npmrc", "utf8")).toContain("block-exotic-subdeps=true");
    expect(readFileSync(".npmrc", "utf8")).toContain("ignore-scripts=true");
  });
});
