// Client side of the base path (src/shared/base-path.ts): Vite's `base` (BASE_PATH at build time)
// comes back as import.meta.env.BASE_URL ("/seller-books/app/" in a prefixed build, "/" in dev and tests).
import { normalizeBasePath, stripBase, withBase } from "@shared/base-path";

export const BASE_PATH: string = normalizeBasePath(import.meta.env.BASE_URL);

/** A root-relative app path as the browser must request it: appPath("/login") -> "/seller-books/app/login". */
export const appPath = (path: string): string => withBase(BASE_PATH, path);

/**
 * The URL for an API call: apiUrl("/api/me") -> "/seller-books/app/api/me"; a bare "me" means "/api/me".
 * Every client request to the Worker goes through this (api(), downloads, the auth client).
 */
export const apiUrl = (path: string): string =>
  appPath(path.startsWith("/") ? path : `/api/${path}`);

/** The router-relative part of a browser pathname ("/seller-books/app/orgs/x" -> "/orgs/x"). */
export const routerPath = (pathname: string): string => stripBase(BASE_PATH, pathname) ?? pathname;
