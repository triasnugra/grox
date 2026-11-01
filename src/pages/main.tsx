/**
 * Entry for the static GitHub Pages build (`github-pages.html`).
 *
 * The dev server and `server/` keep using TanStack Start (`src/router.tsx`,
 * `src/routes/`). GitHub Pages only hosts files, so this entry mounts the same
 * app — same Desk, same providers, same preview bridge — as a client-rendered
 * single page app. Keep the route table below in sync with `src/routes/`.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  Outlet,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Desk } from "@/components/desk/Desk";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { AuthProvider } from "@/lib/auth/provider";
import { AppErrorComponent } from "@/lib/error-component";
import { previewPathRewrite } from "@/lib/preview-path-prefix";
import "../styles.css";

const rootRoute = createRootRoute({
  component: () => (
    <>
      <PreviewHostBridge />
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Desk,
});

const base = import.meta.env.BASE_URL ?? "/";
const basepath = base !== "/" && base !== "" ? base.replace(/\/$/, "") : undefined;

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
  ...(basepath ? { basepath } : {}),
  rewrite: previewPathRewrite(),
  defaultErrorComponent: AppErrorComponent,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
