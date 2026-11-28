// A job module with nothing in it yet (no RFIs, no schedule, no punch list, no close-out documents)
// shows its one-line explanation and a start button instead of its whole entry form. A new job's
// page was ~2,900 px tall on a laptop (~4,500 px on a phone) with five empty forms under the
// schedule of values, which buried the one thing a new subcontractor came to do: enter the lines
// and bill the month. The form opens on the button, on a link to the module's anchor (the jump
// links at the top of the job, the weekly email's `#rfis`), and stays open once anything is in it.
import { type RefObject, useEffect, useState } from "react";

const atAnchor = (anchor: string) =>
  typeof window !== "undefined" && window.location.hash === `#${anchor}`;

/**
 * Whether an empty module's entry form is open, and a function that opens it and puts the cursor in
 * its first field.
 */
export function useStartOpen(
  anchor: string,
  section: RefObject<HTMLElement | null>,
): [boolean, () => void] {
  const [open, setOpen] = useState(() => atAnchor(anchor));
  useEffect(() => {
    const onHash = () => {
      if (atAnchor(anchor)) setOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [anchor]);
  const start = () => {
    setOpen(true);
    requestAnimationFrame(() => {
      section.current
        ?.querySelector<HTMLElement>("form input:not([type=hidden]), form textarea, form select")
        ?.focus();
    });
  };
  return [open, start];
}

/** The button an empty module shows in place of its form. */
export function StartButton(props: { label: string; onClick: () => void }) {
  return (
    <button className="btn-secondary mt-2 text-sm" type="button" onClick={props.onClick}>
      {props.label}
    </button>
  );
}
