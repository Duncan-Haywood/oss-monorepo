import { describe, expect, it } from "vitest";
import { detectFormat, parseTranscript } from "./transcript";

describe("parseTranscript", () => {
  it("splits 'Name:' speaker labels and picks the questioner as interviewer", () => {
    const text = `Interview with Southwest Indian Foundation — 2026-10-02

Sarah: Thanks for joining. How many trainees finished the carpentry program last year?
Joe Begay: We had 42 trainees finish in 2025.
Most of them were from McKinley County.
Sarah: Where did they find work?
Joe Begay: About 30 were hired by local contractors.`;
    const parsed = parseTranscript(text);
    expect(parsed.format).toBe("labeled");
    expect(parsed.turns.map((t) => [t.role, t.speaker])).toEqual([
      ["interviewer", "Sarah"],
      ["respondent", "Joe Begay"],
      ["interviewer", "Sarah"],
      ["respondent", "Joe Begay"],
    ]);
    expect(parsed.turns[1]?.content).toBe(
      "We had 42 trainees finish in 2025.\nMost of them were from McKinley County.",
    );
    // Preamble is not a turn, but the stored document keeps the full text.
    expect(parsed.normalizedText).toContain("Interview with Southwest Indian Foundation");
  });

  it("handles Q:/A: transcripts", () => {
    const parsed = parseTranscript(
      "Q: What is your mission?\nA: We help Navajo families.\nQ: Since when?\nA: Since 1968.",
    );
    expect(parsed.turns).toEqual([
      { role: "interviewer", speaker: "Q", content: "What is your mission?" },
      { role: "respondent", speaker: "A", content: "We help Navajo families." },
      { role: "interviewer", speaker: "Q", content: "Since when?" },
      { role: "respondent", speaker: "A", content: "Since 1968." },
    ]);
  });

  it("treats an explicit Interviewer label as the interviewer and all others as respondents", () => {
    const parsed = parseTranscript(
      "Interviewer: Tell me about the program.\nMaria: It runs 16 weeks.\nTom: And we place graduates.\nInterviewer: Thanks!",
    );
    expect(parsed.turns.map((t) => t.role)).toEqual([
      "interviewer",
      "respondent",
      "respondent",
      "interviewer",
    ]);
  });

  it("honours configured interviewer names", () => {
    const parsed = parseTranscript("Ann: We started in 1968.\nBen: We serve Gallup.", {
      interviewerNames: ["ben"],
    });
    expect(parsed.turns.map((t) => t.role)).toEqual(["respondent", "interviewer"]);
  });

  it("parses WebVTT cues with <v> voice tags and merges consecutive cues", () => {
    const vtt = `WEBVTT

NOTE recorded on Zoom

1
00:00:01.000 --> 00:00:04.000
<v Interviewer>How many homes did you repair?</v>

2
00:00:04.500 --> 00:00:07.000
<v Lena Yazzie>We repaired 18 homes

3
00:00:07.000 --> 00:00:09.000
<v Lena Yazzie>in Chinle last summer.</v>
`;
    expect(detectFormat(vtt)).toBe("vtt");
    const parsed = parseTranscript(vtt);
    expect(parsed.format).toBe("vtt");
    expect(parsed.turns).toEqual([
      { role: "interviewer", speaker: "Interviewer", content: "How many homes did you repair?" },
      {
        role: "respondent",
        speaker: "Lena Yazzie",
        content: "We repaired 18 homes in Chinle last summer.",
      },
    ]);
    expect(parsed.normalizedText).not.toContain("-->");
  });

  it("parses SRT cues with 'Name:' prefixes", () => {
    const srt = `1
00:00:01,000 --> 00:00:03,000
Host: What does the budget look like?

2
00:00:03,500 --> 00:00:06,000
Dana: Our operating budget is $1.2 million.
`;
    const parsed = parseTranscript(srt, { filename: "call.srt" });
    expect(parsed.format).toBe("srt");
    expect(parsed.turns).toEqual([
      { role: "interviewer", speaker: "Host", content: "What does the budget look like?" },
      { role: "respondent", speaker: "Dana", content: "Our operating budget is $1.2 million." },
    ]);
  });

  it("falls back to one respondent turn for unlabelled text", () => {
    const text =
      "We run a trades program in Gallup.\nNote: it started in 2019.\n\nIt has 3 instructors.";
    const parsed = parseTranscript(text);
    expect(parsed.format).toBe("plain");
    expect(parsed.turns).toEqual([{ role: "respondent", speaker: null, content: text }]);
  });

  it("does not treat prose with colons as speakers", () => {
    const parsed = parseTranscript(
      "We served 40 people: 20 adults and 20 youth.\nOur goal for next year: 60 people.",
    );
    expect(parsed.format).toBe("plain");
    expect(parsed.turns).toHaveLength(1);
  });

  it("falls back for unlabelled VTT cues", () => {
    const parsed = parseTranscript(
      "WEBVTT\n\n00:01.000 --> 00:02.000\nHello there.\n\n00:02.000 --> 00:03.000\nWe build homes.",
    );
    expect(parsed.turns).toEqual([
      { role: "respondent", speaker: null, content: "Hello there. We build homes." },
    ]);
  });

  it("returns no turns for empty input", () => {
    expect(parseTranscript("   \n ").turns).toEqual([]);
  });
});
