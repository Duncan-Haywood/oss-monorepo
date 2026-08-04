// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicPickerView } from "@/components/TopicPickerView";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
});

describe("TopicPickerView", () => {
  it("renders topic headers and topic cards", () => {
    render(<TopicPickerView />);
    expect(screen.getByText("What do you want to compare?")).toBeTruthy();
    expect(screen.getByText("Professions")).toBeTruthy();
    expect(screen.getByText("Free-time activities")).toBeTruthy();
  });

  it("filters topics when search input changes", () => {
    render(<TopicPickerView />);
    const searchInput = screen.getByPlaceholderText("Search topics or hobbies…");
    fireEvent.change(searchInput, { target: { value: "Professions" } });
    expect(screen.getByText("Professions")).toBeTruthy();
    expect(screen.queryByText("Closeness and intimacy")).toBeNull();
  });

  it("calls onSelectTopic when Pick Topic button is clicked", () => {
    const handleSelect = vi.fn();
    render(<TopicPickerView onSelectTopic={handleSelect} />);
    const pickButtons = screen.getAllByText("Pick Topic →");
    fireEvent.click(pickButtons[0]);
    expect(handleSelect).toHaveBeenCalled();
  });
});
