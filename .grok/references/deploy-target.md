# Build & deploy target

The app is published to **GitHub Pages by GitHub Actions**
(`.github/workflows/deploy.yml`). It is **not** deployed to Vercel. Pages is
static hosting, so there is no server runtime: anything that only works under
`npm run dev` (server functions, `/api/*` routes, a database, runtime
filesystem writes) will not exist on the published site.

## How the build works

- `npm run build` → `scripts/build-pages.mjs` → Vite with
  `vite.config.pages.mjs` → `dist/`.
- The entry is `github-pages.html` + `src/pages/main.tsx`, a client-rendered
  mount of the same app (`Desk`, `AuthProvider`, `PreviewHostBridge`). Its route
  table must mirror `src/routes/`; add new routes in both places.
- `scripts/finalize-pages.mjs` logic lives in `scripts/github-pages-shared.mjs`:
  it writes `404.html` (SPA fallback), `.nojekyll`, the static
  `__grok/manifest.webmanifest` and the static `?install=1&platform=ios`
  tutorial (`__grok/install/index.html`).
- `PAGES_BASE_PATH` is `/` for a user site / custom domain and `/<repo>/` for a
  project site. The workflow takes it from `actions/configure-pages`. All
  root-absolute URLs in app code must respect `import.meta.env.BASE_URL`.
- `vite.config.ts` + `server/` still drive `npm run dev` (TanStack Start) and the
  optional `npm run build:server` (Nitro `node-server`). Keep both port
  contracts (`0.0.0.0:8080` dev, `127.0.0.1:8081` preview), `serverDir:
  "./server"` and `grokPwaPlugin()`.

## Checks before finishing

`npm run build` must succeed; then `npm run preview:restart` serves `dist/` on
`127.0.0.1:8081` — smoke-test it. A blank page with
`Failed to load module script … MIME type "text/html"` means the asset base path
is wrong.

Production dependencies must stay in `dependencies`; lint/format/test tooling in
`devDependencies` (CI runs a full `npm ci`, so either works there).
