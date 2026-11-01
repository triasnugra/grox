import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { previewPathRewrite } from "@/lib/preview-path-prefix";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const base = import.meta.env.BASE_URL ?? "/";
  const basepath = base !== "/" && base !== "" ? base.replace(/\/$/, "") : undefined;
  return createRouter({
    routeTree,
    ...(basepath ? { basepath } : {}),
    rewrite: previewPathRewrite(),
    defaultErrorComponent: AppErrorComponent,
  });
}
