/**
 * Vite plugin for the static GitHub Pages build. Keeps the platform head chrome
 * (PWA tags, OG tags, the "Created with Grok" extensions script) that
 * `grokPwaPlugin` / the Nitro middleware provide elsewhere, with every
 * `/__grok/...` URL prefixed by the site base.
 */
import { injectGrokPwaHead } from "./grok-pwa-shared.mjs";
import { normalizeBase, rewriteGrokPaths } from "./github-pages-shared.mjs";

export function githubPagesPlugin({ base = "/" } = {}) {
  const prefix = normalizeBase(base);
  let root = process.cwd();
  return {
    name: "app-builder:github-pages",
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: {
      // After Vite has rewritten asset URLs, so the injected tags are ours alone.
      order: "post",
      handler(html) {
        const injected = injectGrokPwaHead(html, {
          host: process.env.VITE_PUBLIC_HOSTNAME ?? "",
          cwd: root,
        });
        return rewriteGrokPaths(injected, prefix);
      },
    },
  };
}
