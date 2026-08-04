import { AnyApi } from "convex/server";

function createProxy(path: string[] = []): any {
  return new Proxy(
    Object.assign(
      () => {},
      {
        path,
        toString() {
          return path.join(":");
        },
      }
    ),
    {
      get(target, prop) {
        if (typeof prop === "symbol" || prop === "then" || prop === "constructor") {
          return (target as any)[prop];
        }
        return createProxy([...path, String(prop)]);
      },
    }
  );
}

export const api = createProxy() as AnyApi;
export const internal = createProxy() as AnyApi;
