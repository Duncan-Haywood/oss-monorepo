// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { Celebration } from "./Celebration";

describe("Celebration component", () => {
  it("renders default +1 burst for standard answers", () => {
    render(<Celebration burstKey={1} milestone={false} />);
    expect(screen.getByText("+1")).toBeDefined();
  });

  it("renders milestone text when milestone is true", () => {
    render(<Celebration burstKey={2} milestone={true} label="Great Progress!" />);
    expect(screen.getByText("🎉 Great Progress!")).toBeDefined();
  });
});
