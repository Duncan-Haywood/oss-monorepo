// Minimal types for the Node built-ins the tests use. The package has no @types/node dependency
// (no new dependencies), so only the surface the tests call is declared here.
declare module "node:test" {
  type Fn = () => void | Promise<void>;
  export function describe(name: string, fn: Fn): void;
  export function it(name: string, fn: Fn): void;
  export function test(name: string, fn: Fn): void;
  export function beforeEach(fn: Fn): void;
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
    rejects(
      fn: Promise<unknown> | (() => Promise<unknown>),
      expected?: RegExp | ((err: unknown) => boolean) | object,
      message?: string,
    ): Promise<void>;
    throws(fn: () => unknown, expected?: RegExp | ((err: unknown) => boolean) | object): void;
  }
  const assert: Assert;
  export default assert;
}

declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding: "utf8"): string;
}
