// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { ModeTransitionModal } from "./ModeTransitionModal";

describe("ModeTransitionModal", () => {
  it("renders null when isOpen is false", () => {
    const { container } = render(
      <ModeTransitionModal
        isOpen={false}
        targetPerspective="PARTNER"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders dialog content when isOpen is true", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ModeTransitionModal
        isOpen={true}
        targetPerspective="PARTNER"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeDefined();

    const confirmButton = screen.getByRole("button", { name: /Start Partner Preferences/i });
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const cancelButton = screen.getByRole("button", { name: /Stay in current focus/i });
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
