/**
 * A stand-in for `next/headers`.
 *
 * Route handlers read the session cookie through `cookies()`, which only
 * resolves inside a real Next request context — calling a handler directly
 * from a test throws. This is the seam that lets an integration test say "now
 * this call is signed in as that account" without standing up a server.
 *
 * Use it as:  vi.mock("next/headers", () => import("@/test/integration/cookieMock"))
 */

const jar = new Map<string, string>();

type Cookie = { name: string; value: string };

export async function cookies() {
  return {
    get(name: string): Cookie | undefined {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(nameOrCookie: string | (Cookie & Record<string, unknown>), value?: string) {
      if (typeof nameOrCookie === "string") {
        jar.set(nameOrCookie, value ?? "");
      } else {
        jar.set(nameOrCookie.name, nameOrCookie.value);
      }
    },
    delete(name: string) {
      jar.delete(name);
    },
    getAll(): Cookie[] {
      return [...jar.entries()].map(([name, value]) => ({ name, value }));
    },
  };
}

export function setCookie(name: string, value: string): void {
  jar.set(name, value);
}

export function clearCookies(): void {
  jar.clear();
}
