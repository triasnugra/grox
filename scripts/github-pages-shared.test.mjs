import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  finalizePages,
  normalizeBase,
  renderStaticInstallPage,
  renderStaticManifest,
  rewriteGrokPaths,
} from "./github-pages-shared.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("normalizeBase", () => {
  assert.equal(normalizeBase(undefined), "/");
  assert.equal(normalizeBase(""), "/");
  assert.equal(normalizeBase("/"), "/");
  assert.equal(normalizeBase("repo"), "/repo/");
  assert.equal(normalizeBase("/repo"), "/repo/");
  assert.equal(normalizeBase("/repo/"), "/repo/");
  assert.throws(() => normalizeBase("/a/../b"));
});

test("rewriteGrokPaths prefixes only /__grok/ URLs", () => {
  const html = '<link href="/__grok/icon-180.png"><img src="/x.png"><script src="/__grok/a.js">';
  assert.equal(
    rewriteGrokPaths(html, "/repo/"),
    '<link href="/repo/__grok/icon-180.png"><img src="/x.png"><script src="/repo/__grok/a.js">',
  );
  assert.equal(rewriteGrokPaths(html, "/"), html);
});

test("static manifest is scoped to the base path", () => {
  const m = JSON.parse(renderStaticManifest({ base: "/repo", name: "ASGRA Mesin 2" }));
  assert.equal(m.name, "ASGRA Mesin 2");
  assert.equal(m.start_url, "/repo/");
  assert.equal(m.scope, "/repo/");
  assert.equal(m.icons[0].src, "/repo/__grok/icon-180.png");
});

test("static install page has the name, base-prefixed assets and an app link", () => {
  const template = readFileSync(join(ROOT, "scripts/install-page.html"), "utf8");
  const html = renderStaticInstallPage(template, { base: "/repo/", name: "ASGRA Mesin 2" });
  assert.match(html, /Add ASGRA Mesin 2 to your Home Screen/);
  assert.match(html, /href="\/repo\/__grok\/install\/styles\.css"/);
  assert.match(html, /href="\/repo\/"/);
  assert.doesNotMatch(html, /\{\{/);
  assert.doesNotMatch(html, /(?:href|src)="\/__grok\//);
});

test("finalizePages writes the fallback, .nojekyll, manifest and install page", () => {
  const out = mkdtempSync(join(tmpdir(), "pages-"));
  writeFileSync(join(out, "index.html"), "<!doctype html><html><head></head><body>x</body></html>");
  finalizePages({ root: ROOT, outDir: out, base: "/repo/" });
  for (const f of ["404.html", ".nojekyll", "__grok/manifest.webmanifest", "__grok/manifest.json", "__grok/install/index.html"]) {
    assert.ok(existsSync(join(out, f)), f);
  }
});

test("finalizePages fails loudly on a missing or empty index.html", () => {
  const out = mkdtempSync(join(tmpdir(), "pages-"));
  assert.throws(() => finalizePages({ root: ROOT, outDir: out }), /no index\.html/);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "index.html"), "");
  assert.throws(() => finalizePages({ root: ROOT, outDir: out }), /empty/);
});
