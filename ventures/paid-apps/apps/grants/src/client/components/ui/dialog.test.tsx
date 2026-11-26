// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./base";
import { ConfirmDialog, Dialog } from "./dialog";

afterEach(cleanup);

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      <Dialog
        open={open}
        onClose={() => {
          onClose?.();
          setOpen(false);
        }}
        title="Edit fact"
        description="Change the statement"
        footer={<Button>Save</Button>}
      >
        <input aria-label="Statement" />
      </Dialog>
    </>
  );
}

describe("<Dialog>", () => {
  it("is labelled, moves focus inside and traps Tab", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Open" }));

    const dialog = screen.getByRole("dialog", { name: "Edit fact" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Change the statement");

    // first focusable = close button
    const close = screen.getByRole("button", { name: "Close dialog" });
    expect(close).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("textbox", { name: "Statement" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
    await user.tab(); // wraps
    expect(close).toHaveFocus();
    await user.tab({ shift: true }); // wraps backwards
    expect(screen.getByRole("button", { name: "Save" })).toHaveFocus();
  });

  it("closes on Escape and restores focus to the trigger", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("ignores Escape when not dismissible", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Saving" dismissible={false}>
        <button type="button">Inside</button>
      </Dialog>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("<ConfirmDialog>", () => {
  it("requires typing the confirmation phrase", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={() => {}}
        onConfirm={onConfirm}
        title="Delete organization"
        tone="danger"
        confirmLabel="Delete"
        confirmText="Acme"
      />,
    );
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Acme");
    expect(del).toBeEnabled();
    await user.click(del);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
