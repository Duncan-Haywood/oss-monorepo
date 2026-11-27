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

declare module "node:fs" {
  export function existsSync(path: string | URL): boolean;
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
}
