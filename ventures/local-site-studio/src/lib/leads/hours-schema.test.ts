import { describe, expect, it } from "vitest";
import { leadOpeningHoursSpecification, parseOpeningHoursSegment } from "./hours-schema";

describe("parseOpeningHoursSegment", () => {
  it("parses a day-range + time-range segment", () => {
    expect(parseOpeningHoursSegment("Mon–Fri 7am–3pm")).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "https://schema.org/Monday",
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
      ],
      opens: "07:00",
      closes: "15:00",
    });
  });

  it("parses a single-day segment", () => {
    expect(parseOpeningHoursSegment("Sat 9am–4pm")).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["https://schema.org/Saturday"],
      opens: "09:00",
      closes: "16:00",
    });
  });

  it("parses :mm minute precision and a hyphen day/time separator", () => {
    expect(parseOpeningHoursSegment("Tue-Fri 9:30am-5:45pm")).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
      ],
      opens: "09:30",
      closes: "17:45",
    });
  });

  it("converts 12am/12pm boundary times correctly", () => {
    expect(parseOpeningHoursSegment("Sat 12am–12pm")).toEqual(
      expect.objectContaining({ opens: "00:00", closes: "12:00" }),
    );
  });

  it("handles a wrap-around day range without infinite-looping", () => {
    const result = parseOpeningHoursSegment("Fri–Mon 9am–5pm");
    expect(result).not.toBeNull();
    expect(result?.dayOfWeek).toEqual([
      "https://schema.org/Friday",
      "https://schema.org/Saturday",
      "https://schema.org/Sunday",
      "https://schema.org/Monday",
    ]);
  });

  it("returns null for a segment with no day token", () => {
    expect(parseOpeningHoursSegment("7am–3pm")).toBeNull();
  });

  it("returns null for prose that isn't a day+time-range shape", () => {
    expect(parseOpeningHoursSegment("Sat emergency on-call")).toBeNull();
    expect(parseOpeningHoursSegment("Mon–Fri by appointment")).toBeNull();
    expect(parseOpeningHoursSegment("Weekend by request")).toBeNull();
    expect(parseOpeningHoursSegment("Closed Sun–Mon")).toBeNull();
  });

  it("returns null for an out-of-range time token", () => {
    expect(parseOpeningHoursSegment("Mon 13am–5pm")).toBeNull();
  });

  it("normalizes lowercase day tokens to a real dayOfWeek (regression: case-insensitive regex previously produced [null])", () => {
    expect(parseOpeningHoursSegment("mon-fri 7am-3pm")).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "https://schema.org/Monday",
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
      ],
      opens: "07:00",
      closes: "15:00",
    });
  });

  it("normalizes uppercase day tokens to a real dayOfWeek (regression: case-insensitive regex previously produced [null])", () => {
    expect(parseOpeningHoursSegment("SAT 9AM-4PM")).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["https://schema.org/Saturday"],
      opens: "09:00",
      closes: "16:00",
    });
  });

  it("normalizes mixed-case day tokens on both ends of a range", () => {
    expect(parseOpeningHoursSegment("tUE-fRI 9:30am-5:45pm")).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: [
        "https://schema.org/Tuesday",
        "https://schema.org/Wednesday",
        "https://schema.org/Thursday",
        "https://schema.org/Friday",
      ],
      opens: "09:30",
      closes: "17:45",
    });
  });
});

describe("leadOpeningHoursSpecification", () => {
  it("combines parseable segments from both weekday and weekend", () => {
    const specs = leadOpeningHoursSpecification({
      weekday: "Mon–Fri 7am–3pm",
      weekend: "Sat–Sun 8am–2pm",
    });
    expect(specs).toHaveLength(2);
    expect(specs?.[0].opens).toBe("07:00");
    expect(specs?.[1].opens).toBe("08:00");
  });

  it("drops unparseable clauses from a middot-joined field but keeps parseable ones", () => {
    const specs = leadOpeningHoursSpecification({
      weekday: "Mon–Fri 9am–6pm",
      weekend: "Sat 9am–4pm · Closed Sun–Mon",
    });
    expect(specs).toHaveLength(2);
    expect(specs?.map((s) => s.dayOfWeek)).toEqual([
      ["https://schema.org/Monday", "https://schema.org/Tuesday", "https://schema.org/Wednesday", "https://schema.org/Thursday", "https://schema.org/Friday"],
      ["https://schema.org/Saturday"],
    ]);
  });

  it("returns undefined when nothing in either field parses", () => {
    expect(
      leadOpeningHoursSpecification({
        weekday: "Mon–Fri by appointment",
        weekend: "Weekend by request",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when neither field has a day token (base fixture shape)", () => {
    expect(
      leadOpeningHoursSpecification({ weekday: "7am–3pm", weekend: "8am–2pm" }),
    ).toBeUndefined();
  });
});
