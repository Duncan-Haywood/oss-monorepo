/**
 * Wires Tailwind into the build. Without this file Next emits `globals.css`
 * with its `@tailwind` directives passed through raw and not one utility class
 * in it — a pass-through, not an error, so nothing else goes red.
 *
 * This venture is on Tailwind v3 (`tailwindcss ^3.4.3` in package.json, and
 * `@tailwind base/components/utilities` in `src/app/globals.css`), so the
 * plugins are `tailwindcss` + `autoprefixer`. The sibling ventures restored on
 * the same day are on v4 and use `@tailwindcss/postcss`; the two forms are not
 * interchangeable. `tests/stylesheet-delivery.test.ts` compiles the real
 * stylesheet through whatever this file declares and fails if the utilities the
 * markup uses do not come out the other side.
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
