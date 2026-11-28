// Minimal types for the node:test / node:assert APIs this package's tests use. The package has no
// dependencies (not even @types/node), so tests run on Node's built-in runner with type stripping.
declare module "node:test" {
  type Fn = () => void | Promise<void>;
  export function describe(name: string, fn: Fn): void;
  export function it(name: string, fn: Fn): void;
}

declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    match(value: string, re: RegExp, message?: string): void;
    doesNotMatch(value: string, re: RegExp, message?: string): void;
    throws(fn: () => unknown, expected?: RegExp | (new (...args: never[]) => Error)): void;
    rejects(
      p: Promise<unknown> | (() => Promise<unknown>),
      expected?: RegExp | (new (...args: never[]) => Error),
    ): Promise<void>;
  }
  const assert: Assert;
  export default assert;
}

// For src/paddle-scripts-cli.test.ts, which spawns the deploy scripts in scripts/.
declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { encoding: "utf8"; env?: Record<string, string>; timeout?: number },
  ): { status: number | null; stdout: string; stderr: string };
}
declare module "node:path" {
  export function dirname(p: string): string;
  export function join(...parts: string[]): string;
}
declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}
declare const process: { execPath: string; env: Record<string, string | undefined> };
