# 0005. Read stored session with `useSyncExternalStore`, not an effect

**Status:** accepted

## Context

`localStorage` is not available during server rendering, so the standard
move is to read it in a `useEffect` and copy the result into state. Three
components did exactly that, and each had its own copy of the key, the
bundle shape and the rules for what counted as a usable session.

Three problems came out of it.

**A visible flash.** The first client render had no session, so a returning
visitor saw the welcome screen before the effect replaced it with their
question. The `loading` phase existed only to paper over this.

**A duplicated fetch.** `UnifiedRunner` also picked its opening survey
inside an effect. Setting that state re-ran the effect, which fired a second
`POST /api/trials/next` before the first had returned. `trials/next` creates
a row on every call, so every single resume created a wasted trial and
silently skipped a question — and quietly inflated the abandonment metric,
which counts shown-but-unanswered trials.

**Three definitions of valid.** A `session/start` that half-failed writes a
bundle with domains but no participant ids. It parses as JSON and looks like
a live session. One component hung on it forever, one rendered blank, one
fell back correctly.

`react-hooks/set-state-in-effect` had been flagging all of this. It was
being read as a style rule.

## Decision

All reads go through `useStoredSession` in `src/lib/sessionStore.ts`, built
on `useSyncExternalStore`. The server snapshot is `null`, which means "not
looked yet" — a genuinely different state from "nothing stored", and the
distinction the flash came from losing.

`parseSessionBundle` is the single definition of a usable bundle, and
`coerceSessionBundle` applies the same rules to a bundle just built from an
API response, so a survey the server returned without a participant id is
dropped in one place rather than two that can drift.

`UnifiedRunner` holds its session in one object and picks its opening domain
when the session opens, not from inside an effect. Writes go through
`writeSessionBundle`, which notifies same-tab subscribers, since the
browser's own `storage` event only fires in other tabs.

## Consequences

- No welcome flash, and exactly one question requested per resume — both
  covered by tests in `UnifiedRunner.test.tsx`.
- Callers must handle `hydrated === false` as its own state. Rendering
  "you have no answers yet" before hydration is a lie, and the type makes
  that hard to write by accident.
- `getSnapshot` must return a value that is `Object.is`-stable between
  renders. It returns the raw string from storage and parses in a `useMemo`;
  parsing inside the snapshot would return a fresh object each call and
  loop forever.
- The lint rule stays on and stays unsuppressed. It was describing a real
  bug once and would have caught this class of thing earlier.
