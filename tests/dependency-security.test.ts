import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdir, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function assertPatchedVersions(
  packageName: string,
  versions: string[],
  floors: Record<string, string>,
): void {
  if (!versions.length) throw new Error(`missing dependency ${packageName}`);
  for (const version of versions) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`unexpected version ${version}`);
    const actual = version.split(".").map(Number);
    const floor = floors[String(actual[0])];
    if (!floor) throw new Error(`unreviewed release branch ${packageName}@${version}`);
    const minimum = floor.split(".").map(Number);
    const difference = actual.findIndex((part, index) => part !== minimum[index]);
    if (difference !== -1 && actual[difference] < minimum[difference]) {
      throw new Error(`${packageName}@${version} is below ${floor}`);
    }
  }
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
    const patchedBranches: Record<string, Record<string, string>> = {
      "brace-expansion": { "1": "1.1.21", "2": "2.1.7", "5": "5.0.12" },
      "esbuild": { "0": "0.25.12" },
      "fast-uri": { "3": "3.1.8" },
      "js-yaml": { "4": "4.3.2" },
      "glob": { "14": "14.0.2" },
      "minimatch": { "11": "11.0.1" },
      "nanoid": { "3": "3.3.18", "5": "5.1.16" },
      "next": { "16": "16.4.1" },
      "undici": { "7": "7.29.1" },
      "vite": { "8": "8.2.4" },
      "vitest": { "4": "4.1.12" },
      "@vitest/mocker": { "4": "4.1.12" },
      "zod": { "4": "4.6.6" },
    };
    for (const [name, floors] of Object.entries(patchedBranches)) {
      assertPatchedVersions(name, lockedVersions(name), floors);
    }
  });

  it("preserves legacy callable and modern named minimatch APIs without unbounded pattern amplification", () => {
    const require = createRequire(import.meta.url);
    const eslintRequire = createRequire(require.resolve("eslint/package.json"));
    type Options = { dot?: boolean; matchBase?: boolean; nocase?: boolean; optimizationLevel?: number; braceExpandMax?: number };
    type Matcher = ((file: string, pattern: string, options?: Options) => boolean) & {
      minimatch: Matcher;
      defaults(options: Options): Matcher;
      Minimatch: new (pattern: string, options?: Options) => { match(file: string): boolean; globParts: string[][] };
    };
    const matcher = eslintRequire("minimatch") as Matcher;
    expect(typeof matcher).toBe("function");
    expect(matcher.minimatch).toBe(matcher);
    const cases: [string, string, Options, boolean][] = [
      ["components/Card.tsx", "**/*.tsx", {}, true],
      [".hidden/file.ts", "**/*.ts", { dot: true }, true],
      ["a/b.ts", "*.ts", { matchBase: true }, true],
      ["a.test.ts", "!*.test.ts", {}, false],
      ["a.ts", "!*.test.ts", {}, true],
      ["src/a.ts", "{src,lib}/**/*.ts", {}, true],
      ["src/Card.TSX", "**/*.tsx", { nocase: true }, true],
      ["a.ts", "#comment", {}, false],
      ["a.ts", "+(a|b).ts", {}, true],
    ];
    for (const [file, pattern, options, expected] of cases) {
      expect(matcher(file, pattern, options)).toBe(expected);
      expect(new matcher.Minimatch(pattern, options).match(file)).toBe(expected);
    }
    expect(matcher.defaults({ dot: true })(".hidden/a.ts", "**/*.ts")).toBe(true);
    const expanded = new matcher.Minimatch(`a/${"**/../b/c/".repeat(18)}end`, {
      optimizationLevel: 2,
      braceExpandMax: 16,
    });
    expect(expanded.globParts.length).toBeLessThanOrEqual(16);
  });

  it("stops glob traversal when aborted before or during its first directory read", async () => {
    const require = createRequire(import.meta.url);
    const sentryRequire = createRequire(require.resolve("@sentry/nextjs"));
    const bundlerRequire = createRequire(sentryRequire.resolve("@sentry/bundler-plugins/package.json"));
    const { glob } = bundlerRequire("glob") as {
      glob(pattern: string, options: Record<string, unknown>): Promise<string[]>;
    };
    const directory = mkdtempSync(join(tmpdir(), "reshoot-glob-abort-"));
    try {
      mkdirSync(join(directory, "sub"));
      writeFileSync(join(directory, "a.txt"), "a");
      writeFileSync(join(directory, "sub", "b.txt"), "b");
      expect((await glob("**/*.txt", { cwd: directory })).sort()).toEqual(["a.txt", "sub/b.txt"]);

      for (const alreadyAborted of [false, true]) {
        const controller = new AbortController();
        const reason = new Error("fixture traversal canceled");
        let reads = 0;
        if (alreadyAborted) controller.abort(reason);
        const fs = {
          readdir(path: string, _options: unknown, callback: (error: NodeJS.ErrnoException | null, entries: unknown[]) => void) {
            reads++;
            readdir(path, { withFileTypes: true }, (error, entries) => {
              controller.abort(reason);
              callback(error, entries);
            });
          },
        };
        await expect(glob("**/*.txt", { cwd: directory, signal: controller.signal, fs })).rejects.toBe(reason);
        await new Promise<void>((resolve) => setImmediate(resolve));
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(reads).toBe(alreadyAborted ? 0 : 1);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("accepts patched upgrades while rejecting downgrades and unreviewed branches", () => {
    const floors = { "3": "3.3.18", "5": "5.1.16" };
    expect(() => assertPatchedVersions("nanoid", ["3.3.19", "5.1.17"], floors)).not.toThrow();
    expect(() => assertPatchedVersions("nanoid", ["3.3.17", "5.1.16"], floors)).toThrow();
    expect(() => assertPatchedVersions("nanoid", ["3.3.18", "5.1.15"], floors)).toThrow();
    expect(() => assertPatchedVersions("nanoid", ["4.0.0"], floors)).toThrow();
    expect(() => assertPatchedVersions("nanoid", ["5.1.16-rc.1"], floors)).toThrow();
    expect(() => assertPatchedVersions("nanoid", [], floors)).toThrow();
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
