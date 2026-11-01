#!/usr/bin/env node
/**
 * `npm run build` — static build for GitHub Pages (output: dist/).
 *
 *   PAGES_BASE_PATH      "/" (user site / custom domain) or "/<repo>/"
 *   VITE_PUBLIC_HOSTNAME e.g. "<owner>.github.io" (for share-card metadata)
 *
 * The HTML entry is committed as `github-pages.html` so it can never shadow the
 * TanStack Start dev server; Vite needs it named `index.html`, so it is copied
 * for the duration of the build and removed afterwards.
 */
import { copyFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { finalizePages, normalizeBase } from "./github-pages-shared.mjs";
import { projectRoot, readAppEnv } from "./with-app-env.mjs";

const root = projectRoot();
const args = process.argv.slice(2);
const modeAt = args.indexOf("--mode");
const mode = modeAt !== -1 ? args[modeAt + 1] : undefined;

// `.grok/app-env.json` fills in VITE_* keys; a real environment value wins.
for (const [key, value] of Object.entries(readAppEnv(root))) {
  if (process.env[key] === undefined) process.env[key] = value;
}
// A static site has no auth backend.
process.env.VITE_AUTH_ENABLED ??= "false";

const base = normalizeBase(process.env.PAGES_BASE_PATH ?? process.env.NITRO_APP_BASE_URL);
const outDir = join(root, "dist");
const template = join(root, "github-pages.html");
const entry = join(root, "index.html");

if (existsSync(entry) && readFileSync(entry, "utf8") !== readFileSync(template, "utf8")) {
  console.error("[build-pages] refusing to overwrite an unrelated index.html in the project root.");
  process.exit(1);
}

console.log(`[build-pages] base=${base} host=${process.env.VITE_PUBLIC_HOSTNAME || "(unset)"}`);
copyFileSync(template, entry);
try {
  const { build } = await import("vite");
  await build({
    root,
    configFile: join(root, "vite.config.pages.mjs"),
    ...(mode ? { mode } : {}),
  });
  finalizePages({ root, outDir, base });
  console.log(`[build-pages] done -> ${outDir}`);
} catch (err) {
  console.error("[build-pages] failed:", err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
} finally {
  rmSync(entry, { force: true });
}
