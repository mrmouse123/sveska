import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Vite izvodi BASE_URL iz `base` u vite.config.ts i uvek ga daje sa kosom crtom
 *  na kraju ("/sveska/"). Ruter očekuje bez nje, a za root ostaje prazno. */
const basepath = import.meta.env.BASE_URL.replace(/\/$/, "");

// TanStack Start convention: this module must export `getRouter`.
export const getRouter = () => {
  const queryClient = new QueryClient();
  return createRouter({
    routeTree,
    basepath,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};
