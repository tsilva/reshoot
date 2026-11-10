/** Fixture-only alias resolution. Application files are unchanged. */
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
const root = process.env.FIXTURE_REPO;
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'server-only') return next(new URL('./server-only.mjs', import.meta.url).href, context);
  if (specifier === '@/lib/db') return next(new URL('./fixture-db.mjs', import.meta.url).href, context);
  if (specifier.startsWith('@/')) {
    const base = `${root}/${specifier.slice(2)}`;
    for (const suffix of ['.ts', '/index.ts']) if (existsSync(base + suffix)) return next(pathToFileURL(base + suffix).href, context);
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(root).href)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const suffix of ['.ts', '/index.ts']) if (existsSync(base + suffix)) return next(pathToFileURL(base + suffix).href, context);
  }
  return next(specifier, context);
} });
