/**
 * Pure helpers for the static GitHub Pages build. Plain ESM with no
 * dependencies so `node --test` can exercise them without Vite.
 *
 * GitHub Pages is static hosting: there is no server to answer
 * `/__grok/manifest.webmanifest` or `?install=1&platform=ios`, and a project
 * site lives under `/<repo>/`, so every root-absolute URL has to be prefixed.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  DEFAULT_APP_NAME,
  escapeHtml,
  readOgSite,
  renderInstallPageHtml,
  renderWebManifest,
} from "./grok-pwa-shared.mjs";

/** "", "/", "repo", "/repo" or "/repo/" -> "/" or "/repo/". */
export function normalizeBase(input) {
  const trimmed = String(input ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!trimmed || trimmed === ".") return "/";
  if (trimmed.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Invalid base path: ${input}`);
  }
  return `/${trimmed}/`;
}

/** Prefix the platform's root-absolute `/__grok/...` URLs with the site base. */
export function rewriteGrokPaths(html, base) {
  const prefix = normalizeBase(base);
  if (prefix === "/") return String(html);
  return String(html).replace(/(\b(?:href|src)=")\/__grok\//g, `$1${prefix}__grok/`);
}

/** The app's display name: `src/lib/og/site.json` title, else the platform default. */
export function appNameFor(root) {
  const title = String(readOgSite(root).title ?? "").trim();
  return title || DEFAULT_APP_NAME;
}

/** Static replacement for the Nitro middleware's dynamic web manifest. */
export function renderStaticManifest({ base = "/", name = DEFAULT_APP_NAME } = {}) {
  const prefix = normalizeBase(base);
  const manifest = JSON.parse(renderWebManifest(""));
  manifest.name = name;
  manifest.short_name = name;
  manifest.id = prefix;
  manifest.start_url = prefix;
  manifest.scope = prefix;
  manifest.icons = manifest.icons.map((icon) => ({
    ...icon,
    src: icon.src.replace(/^\/__grok\//, `${prefix}__grok/`),
  }));
  return JSON.stringify(manifest, null, 2);
}

/** Static replacement for the `?install=1&platform=ios` Home Screen tutorial. */
export function renderStaticInstallPage(template, { base = "/", name = DEFAULT_APP_NAME } = {}) {
  const prefix = normalizeBase(base);
  const named = String(template).replaceAll("{{APP_NAME}}", escapeHtml(name));
  return rewriteGrokPaths(renderInstallPageHtml(named, { url: prefix }), prefix);
}

function write(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * Turn Vite's `dist/` into a complete GitHub Pages site: SPA 404 fallback,
 * `.nojekyll`, the static manifest and the static install tutorial.
 */
export function finalizePages({ root, outDir, base = "/", name }) {
  const prefix = normalizeBase(base);
  const appName = name ?? appNameFor(root);
  const indexHtml = join(outDir, "index.html");
  if (!existsSync(indexHtml)) {
    throw new Error(`Build produced no index.html in ${outDir}`);
  }
  if (readFileSync(indexHtml, "utf8").trim().length === 0) {
    throw new Error(`${indexHtml} is empty`);
  }

  // Deep links reload through 404.html; the SPA router then resolves the path.
  copyFileSync(indexHtml, join(outDir, "404.html"));
  // Without this Pages runs Jekyll, which drops folders starting with "_".
  write(join(outDir, ".nojekyll"), "");

  const manifest = renderStaticManifest({ base: prefix, name: appName });
  write(join(outDir, "__grok", "manifest.webmanifest"), manifest);
  write(join(outDir, "__grok", "manifest.json"), manifest);

  const template = readFileSync(join(root, "scripts", "install-page.html"), "utf8");
  write(
    join(outDir, "__grok", "install", "index.html"),
    renderStaticInstallPage(template, { base: prefix, name: appName }),
  );
}
