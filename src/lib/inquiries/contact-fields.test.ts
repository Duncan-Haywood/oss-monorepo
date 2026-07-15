import { describe, expect, it } from "vitest";
import {
  MAX_CONTACT_EMAIL_LENGTH,
  MAX_CONTACT_MESSAGE_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  MAX_CONTACT_PHONE_LENGTH,
  MAX_CONTACT_SOURCE_LENGTH,
  normalizeContactFormFields,
} from "./contact-fields";

describe("normalizeContactFormFields", () => {
  it("passes through short fields unchanged", () => {
    expect(
      normalizeContactFormFields({
        name: "Pat",
        email: "pat@example.com",
        phone: "555-0100",
        message: "Book a table",
        source: "https://preview.example/demo-cafe",
      }),
    ).toEqual({
      name: "Pat",
      email: "pat@example.com",
      phone: "555-0100",
      message: "Book a table",
      source: "https://preview.example/demo-cafe",
    });
  });

  it("soft-caps message to MAX_CONTACT_MESSAGE_LENGTH", () => {
    const message = "m".repeat(MAX_CONTACT_MESSAGE_LENGTH + 250);
    const normalized = normalizeContactFormFields({ message });
    expect(normalized.message).toHaveLength(MAX_CONTACT_MESSAGE_LENGTH);
    expect(normalized.message).toBe("m".repeat(MAX_CONTACT_MESSAGE_LENGTH));
  });

  it("soft-caps name, email, phone, and source", () => {
    const normalized = normalizeContactFormFields({
      name: "n".repeat(MAX_CONTACT_NAME_LENGTH + 10),
      email: "e".repeat(MAX_CONTACT_EMAIL_LENGTH + 10),
      phone: "1".repeat(MAX_CONTACT_PHONE_LENGTH + 10),
      source: "s".repeat(MAX_CONTACT_SOURCE_LENGTH + 10),
      message: "ok",
    });
    expect(normalized.name).toHaveLength(MAX_CONTACT_NAME_LENGTH);
    expect(normalized.email).toHaveLength(MAX_CONTACT_EMAIL_LENGTH);
    expect(normalized.phone).toHaveLength(MAX_CONTACT_PHONE_LENGTH);
    expect(normalized.source).toHaveLength(MAX_CONTACT_SOURCE_LENGTH);
    expect(normalized.message).toBe("ok");
  });

  it("treats missing fields as empty strings", () => {
    expect(normalizeContactFormFields({})).toEqual({
      name: "",
      email: "",
      phone: "",
      message: "",
      source: "",
    });
  });
});
