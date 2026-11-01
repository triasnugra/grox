/**
 * Static build for GitHub Pages. Run through `npm run build`
 * (scripts/build-pages.mjs), which supplies the `index.html` entry and writes
 * the Pages-only files afterwards. Output: dist/
 */
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { githubPagesPlugin } from "./scripts/github-pages-plugin.mjs";
import { normalizeBase } from "./scripts/github-pages-shared.mjs";

const base = normalizeBase(process.env.PAGES_BASE_PATH ?? process.env.NITRO_APP_BASE_URL);

export default defineConfig({
  base,
  publicDir: "public",
  resolve: { tsconfigPaths: true },
  // `vite preview` of dist/ is the loopback QA port (:8081), as in vite.config.ts.
  preview: { host: "127.0.0.1", port: 8081, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [tailwindcss(), viteReact(), githubPagesPlugin({ base })],
});
