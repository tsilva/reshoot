import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  // Private evidence may contain old checkout copies; those are not tests of
  // this source tree and their relative imports conflict with the root alias.
  test: { exclude: [...configDefaults.exclude, ".internal/**"] },
});
