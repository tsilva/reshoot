import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const lockfile = readFileSync("pnpm-lock.yaml", "utf8");
const resolvedPackages = lockfile.slice(lockfile.indexOf("\npackages:"));

function lockedVersions(packageName: string): string[] {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '?${escaped}@([^:'\\s(]+)(?:\\([^)]*\\))?'?:`, "gm");
  return [...new Set([...resolvedPackages.matchAll(pattern)].map((match) => match[1]))].sort();
}

describe("dependency security boundaries", () => {
  it("excludes the unused Nest compiler and both unpatched dependency chains", () => {
    for (const name of ["@workflow/nest", "@swc/cli", "http-cache-semantics", "braces"]) {
      expect(lockedVersions(name)).toEqual([]);
    }
    expect(lockedVersions("@workflow/next")).not.toEqual([]);
    expect(lockedVersions("@workflow/core")).not.toEqual([]);
  });

  it("preserves Next lint directory discovery and internal-link enforcement", async () => {
    const directory = mkdtempSync(join(tmpdir(), "reshoot-lint-roots-"));
    const require = createRequire(import.meta.url);
    const configRequire = createRequire(require.resolve("eslint-config-next"));
    const plugin = configRequire.resolve("@next/eslint-plugin-next");
    const { getRootDirs } = require(join(dirname(plugin), "utils/get-root-dirs.js")) as {
      getRootDirs(context: { cwd: string; settings: { next?: { rootDir: string | string[] } } }): string[];
    };
    try {
      for (const name of ["alpha", "beta"]) mkdirSync(join(directory, name));
      writeFileSync(join(directory, "alpha.txt"), "Not a project directory");
      const roots = (rootDir: string | string[]) =>
        getRootDirs({ cwd: directory, settings: { next: { rootDir } } })
          .map((path) => resolve(path)).sort();
      expect(getRootDirs({ cwd: directory, settings: {} })).toEqual([directory]);
      expect(roots(join(directory, "alpha"))).toEqual([join(directory, "alpha")]);
      expect(roots(join(directory, "*"))).toEqual([join(directory, "alpha"), join(directory, "beta")]);
      expect(roots(join(directory, "{alpha,beta}"))).toEqual([join(directory, "alpha"), join(directory, "beta")]);
      expect(roots([join(directory, "alpha"), join(directory, "missing")])).toEqual([join(directory, "alpha")]);
      expect(roots(join(directory, "alpha").replaceAll("/", "\\"))).toEqual([join(directory, "alpha")]);

      mkdirSync(join(directory, "alpha", "pages"));
      writeFileSync(join(directory, "alpha", "pages", "about.js"), "export default function About() {}");
      const eslint = new ESLint({ overrideConfig: { settings: { next: { rootDir: join(directory, "*") } } } });
      const [result] = await eslint.lintText(
        'export default function Fixture() { return <a href="/about">About</a>; }',
        { filePath: "components/DependencySecurityFixture.tsx" },
      );
      expect(result.messages.some((message) => message.ruleId === "@next/next/no-html-link-for-pages")).toBe(true);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps every formerly vulnerable package on a remediated version", () => {
    expect(lockedVersions("brace-expansion")).toEqual(["1.1.21", "2.1.7", "5.0.12"]);
    expect(lockedVersions("esbuild")).toEqual(["0.25.12", "0.28.1"]);
    expect(lockedVersions("fast-uri")).toEqual(["3.1.8"]);
    expect(lockedVersions("js-yaml")).toEqual(["4.3.2"]);
    expect(lockedVersions("nanoid")).toEqual(["3.3.18", "5.1.16"]);
    expect(lockedVersions("undici")).toEqual(["7.29.1"]);
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
