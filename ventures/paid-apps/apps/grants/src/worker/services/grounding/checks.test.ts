import { describe, expect, it } from "vitest";
import {
  checkClaimNumbers,
  checkFramingClaim,
  deriveOrgNames,
  type FactRow,
  factStartYears,
  findNumberMismatches,
} from "./checks";

const fact = (id: string, statement: string, extra: Partial<FactRow> = {}): FactRow => ({
  id,
  statement,
  status: "confirmed",
  sensitivity: "internal",
  sourceQuote: "",
  value: null,
  asOf: null,
  ...extra,
});

const trained = fact("fct_trained", "SWIF's Trades Academy trained 48 apprentices in 2024.", {
  sourceQuote: "In 2024 our Trades Academy trained 48 apprentices in carpentry and plumbing.",
});
const grant = fact("fct_grant", "SWIF received a $5,000 grant from the Gallup Community Fund.", {
  asOf: "2023",
});
const women = fact("fct_women", "40 percent of Trades Academy trainees are women.");
const navajo = fact("fct_navajo", "Three-quarters of apprentices live on the Navajo Nation.");
const ratio = fact("fct_ratio", "1 in 4 Gallup residents lives below the poverty line.");
const budget = fact("fct_budget", "The Trades Academy has an annual operating budget.", {
  value: { number: 1_200_000, unit: "USD", year: 2025, text: null },
});
const asOfDate = fact("fct_asof", "The Trades Academy had 31 enrolled trainees.", {
  asOf: "2024-06-30",
});

const unmatched = (text: string, facts: FactRow[]) => checkClaimNumbers({ text }, facts);

describe("checkClaimNumbers", () => {
  it("passes numbers that appear in the cited fact", () => {
    expect(unmatched("In 2024, the Trades Academy trained 48 apprentices.", [trained])).toEqual([]);
    expect(unmatched("Text with no numbers at all.", [])).toEqual([]);
  });

  it("flags a fabricated statistic added to a true claim", () => {
    expect(
      unmatched("The Trades Academy trained 48 apprentices and 92% found jobs.", [trained]),
    ).toEqual(["92%"]);
  });

  it("flags the wrong year", () => {
    expect(unmatched("In 2023, the Trades Academy trained 48 apprentices.", [trained])).toEqual([
      "2023",
    ]);
  });

  it("flags an inflated dollar amount ($50,000 vs $5,000)", () => {
    expect(unmatched("SWIF received a $50,000 grant from the fund.", [grant])).toEqual(["$50,000"]);
    expect(unmatched("SWIF received a $5,000 grant.", [grant])).toEqual([]);
    expect(unmatched("SWIF received a 5,000 dollar grant.", [grant])).toEqual([]);
  });

  it("flags spelled-out numbers that don't match and accepts ones that do", () => {
    expect(unmatched("The academy trained forty-two apprentices.", [trained])).toEqual([
      "forty-two",
    ]);
    expect(unmatched("The academy trained forty-eight apprentices.", [trained])).toEqual([]);
    expect(unmatched("The academy trained a dozen apprentices.", [trained])).toEqual(["a dozen"]);
  });

  it("treats percent and fraction strictly but allows trivial equivalence", () => {
    // 'half' is not 40 percent
    expect(unmatched("Half of trainees are women.", [women])).toEqual(["Half"]);
    expect(unmatched("40% of trainees are women.", [women])).toEqual([]);
    // three-quarters == 75%
    expect(unmatched("75% of apprentices live on the Navajo Nation.", [navajo])).toEqual([]);
    expect(unmatched("80% of apprentices live on the Navajo Nation.", [navajo])).toEqual(["80%"]);
    // 1 in 4 == 25%, but the drafter may not invent new counts from a percentage
    expect(unmatched("25% of Gallup residents live in poverty.", [ratio])).toEqual([]);
    expect(unmatched("4 in 10 trainees are women.", [women])).toEqual(["4", "10"]);
    // a bare number is not a percentage
    expect(unmatched("48% of apprentices finished.", [trained])).toEqual(["48%"]);
  });

  it("matches $1.2M against structured fact values", () => {
    expect(unmatched("The academy's budget is $1.2M.", [budget])).toEqual([]);
    expect(unmatched("The academy's budget is $1.2 million in 2025.", [budget])).toEqual([]);
    expect(unmatched("The academy's budget is $12 million.", [budget])).toEqual(["$12 million"]);
  });

  it("accepts 1,200 = 1200 and 25% = 25 percent", () => {
    const f = fact("f", "We served 1200 families; 25 percent were elders.");
    expect(unmatched("We served 1,200 families; 25% were elders.", [f])).toEqual([]);
  });

  it("uses asOf dates but rejects added date precision", () => {
    expect(unmatched("In 2024 the academy had 31 trainees.", [asOfDate])).toEqual([]);
    expect(unmatched("As of June 30, 2024 the academy had 31 trainees.", [asOfDate])).toEqual([]);
    expect(unmatched("In June 2024 SWIF received a $5,000 grant.", [grant])).toEqual(["June 2024"]);
  });

  it("does not let a dollar figure borrow an unrelated count", () => {
    expect(unmatched("Each apprentice receives $48.", [trained])).toEqual(["$48"]);
  });

  it("flags ordinals not in facts", () => {
    expect(unmatched("SWIF is the first trades academy in the region.", [trained])).toEqual([
      "first",
    ]);
  });

  it("finds nothing when no facts are cited", () => {
    expect(unmatched("We trained 48 apprentices in 2024.", [])).toEqual(["48", "2024"]);
  });
});

describe("checkFramingClaim", () => {
  const names = { allowedNames: ["Southwest Indian Foundation", "SWIF"] };

  it("accepts plain framing language", () => {
    expect(checkFramingClaim({ text: "We welcome the opportunity to share our work." }).ok).toBe(
      true,
    );
    expect(checkFramingClaim({ text: "Together, we can build a stronger future." }).ok).toBe(true);
  });

  it("allows the org's own name", () => {
    const r = checkFramingClaim(
      { text: "Southwest Indian Foundation is grateful for this opportunity. SWIF looks ahead." },
      names,
    );
    expect(r.ok).toBe(true);
    expect(
      checkFramingClaim({ text: "We at Southwest Indian Foundation are grateful." }).properNouns,
    ).toEqual(["Southwest Indian Foundation"]);
  });

  it("flags an invented partner name", () => {
    const r = checkFramingClaim(
      { text: "Together with our partners at Navajo Technical University, we look forward." },
      names,
    );
    expect(r.ok).toBe(false);
    expect(r.properNouns).toContain("Navajo Technical University");
  });

  it("flags multi-word proper nouns at sentence start and acronyms mid-sentence", () => {
    expect(checkFramingClaim({ text: "Navajo Nation leaders support this." }).ok).toBe(false);
    expect(checkFramingClaim({ text: "With HUD support we can do more." }).properNouns).toEqual([
      "HUD",
    ]);
  });

  it("flags numbers, outcomes and superlatives", () => {
    expect(checkFramingClaim({ text: "We look forward to the next 3 years." }).numbers).toEqual([
      "3",
    ]);
    expect(
      checkFramingClaim({ text: "Our program graduated many young people." }).outcomeWords,
    ).toEqual(["graduated"]);
    expect(
      checkFramingClaim({ text: "We are proud to have served the community." }).outcomeWords,
    ).toEqual(["served"]);
    expect(checkFramingClaim({ text: "We increased access to training." }).ok).toBe(false);
    expect(
      checkFramingClaim({ text: "As the region's leading trades program, we are ready." })
        .superlatives,
    ).toEqual(["leading"]);
  });
});

describe("deriveOrgNames", () => {
  it("pulls the subject and acronym from identity facts", () => {
    const names = deriveOrgNames([
      fact("f1", "Southwest Indian Foundation (SWIF) is a 501(c)(3) nonprofit in Gallup.", {
        category: "identity",
      }),
      fact("f2", "Navajo Technical University is a partner.", { category: "partner" }),
    ]);
    expect(names).toEqual(["Southwest Indian Foundation", "SWIF"]);
  });
});

describe("checkClaimNumbers — approximate qualifiers", () => {
  const enrolled = fact("fct_enrolled", "In 2025, 214 adults enrolled in the program.");
  const share = fact("fct_share", "48% of 2025 trainees were women.");
  const completed = fact(
    "fct_completed",
    "118 of the 142 adults who enrolled completed the program.",
  );
  const cost = fact("fct_cost", "Training one participant costs $6,200.");
  const placed = fact("fct_placed", "78% of graduates were employed within 90 days.");
  const at = (text: string, facts: FactRow[]) => checkClaimNumbers({ text }, facts);

  it("accepts honest approximations in the stated direction and tolerance", () => {
    expect(at("Nearly half of 2025 trainees were women.", [share])).toEqual([]);
    expect(at("Almost half of 2025 trainees were women.", [share])).toEqual([]);
    expect(at("More than 200 adults enrolled in 2025.", [enrolled])).toEqual([]);
    expect(at("Over 200 adults enrolled in 2025.", [enrolled])).toEqual([]);
    expect(at("At least 214 adults enrolled in 2025.", [enrolled])).toEqual([]);
    expect(at("About 210 adults enrolled in 2025.", [enrolled])).toEqual([]);
    expect(at("Roughly 220 adults enrolled in 2025.", [enrolled])).toEqual([]);
    expect(at("Approximately $6,000 trains one participant.", [cost])).toEqual([]);
    expect(at("Almost 120 adults completed the program.", [completed])).toEqual([]);
    expect(at("Fewer than 150 adults enrolled.", [completed])).toEqual([]);
    expect(at("More than a third of 2025 trainees were women.", [share])).toEqual([]);
    expect(at("Over three quarters of graduates were employed within 90 days.", [placed])).toEqual(
      [],
    );
    expect(at("Nearly 80% of graduates were employed within 90 days.", [placed])).toEqual([]);
  });

  it("never lets a qualifier inflate a figure (adversarial)", () => {
    expect(at("More than 500 adults enrolled in 2025.", [enrolled])).toEqual(["More than 500"]);
    expect(at("Nearly 1,000 adults enrolled in 2025.", [enrolled])).toEqual(["Nearly 1,000"]);
    expect(at("Nearly 1,000 adults enrolled.", [fact("f", "600 adults enrolled.")])).toEqual([
      "Nearly 1,000",
    ]);
    // "nearly" means just below: it can't describe a figure that is already above N
    expect(at("Nearly 200 adults enrolled in 2025.", [enrolled])).toEqual(["Nearly 200"]);
    expect(at("Almost half of graduates were employed within 90 days.", [placed])).toEqual([
      "Almost half",
    ]);
    // "more than N" is strict; "at least" is not
    expect(at("More than 214 adults enrolled in 2025.", [enrolled])).toEqual(["More than 214"]);
    expect(at("At least 215 adults enrolled in 2025.", [enrolled])).toEqual(["At least 215"]);
    // "about" allows 5%, no more
    expect(at("About 250 adults enrolled in 2025.", [enrolled])).toEqual(["About 250"]);
    expect(at("Approximately 225 adults enrolled in 2025.", [enrolled])).toEqual([
      "Approximately 225",
    ]);
    expect(at("Over $7,000 trains one participant.", [cost])).toEqual(["Over $7,000"]);
    expect(at("More than 90% of graduates were employed within 90 days.", [placed])).toEqual([
      "More than 90%",
    ]);
    expect(at("Nearly two-thirds of 2025 trainees were women.", [share])).toEqual([
      "Nearly two-thirds",
    ]);
    // upper bounds must hold too
    expect(at("Under 200 adults enrolled in 2025.", [enrolled])).toEqual(["Under 200"]);
    expect(at("Fewer than 214 adults enrolled in 2025.", [enrolled])).toEqual(["Fewer than 214"]);
  });

  it("keeps unqualified, negated and unlisted hedges exact", () => {
    expect(at("200 adults enrolled in 2025.", [enrolled])).toEqual(["200"]);
    expect(at("Half of 2025 trainees were women.", [share])).toEqual(["Half"]);
    expect(at("No more than 200 adults enrolled.", [fact("f", "150 adults enrolled.")])).toEqual([
      "200",
    ]);
    expect(at("Up to 250 adults enrolled in 2025.", [enrolled])).toEqual(["250"]);
    expect(at("Less than 250 adults enrolled in 2025.", [enrolled])).toEqual(["250"]);
    expect(at("We talked about the 200 adults who enrolled in 2025.", [enrolled])).toEqual(["200"]);
  });

  it("treats a hedged fact as a bound, not an exact value", () => {
    const gained = fact("f", "61% of learners gained at least one reading level.");
    expect(at("61% of learners gained at least one reading level.", [gained])).toEqual([]);
    const youth = fact("f", "The program serves youth under 18.");
    expect(at("The program serves youth under 18.", [youth])).toEqual([]);
    // "under 250" says nothing about exceeding 200; "more than 150" doesn't vouch for "more than 200"
    expect(at("More than 200 adults enrolled.", [fact("f", "Under 250 adults enrolled.")])).toEqual(
      ["More than 200"],
    );
    expect(
      at("More than 200 adults enrolled.", [fact("f", "More than 150 adults enrolled.")]),
    ).toEqual(["More than 200"]);
    expect(at("Nearly 75% are immigrants.", [fact("f", "About 70% are immigrants.")])).toEqual([
      "Nearly 75%",
    ]);
  });

  it("only compares like with like", () => {
    // a count can't borrow a year, a dollar amount, a percentage or a span of years
    const founded = fact("f1", "EVTC was founded in 2012.");
    expect(at("More than 200 adults enrolled.", [founded])).toEqual(["More than 200"]);
    expect(at("Over 200 adults enrolled.", [fact("f2", "Each adult received $214.")])).toEqual([
      "Over 200",
    ]);
    expect(at("More than 40 adults enrolled.", [share])).toEqual(["More than 40"]);
    expect(at("More than 40% of trainees were women.", [enrolled])).toEqual(["More than 40%"]);
    const electrician = fact("f3", "Dana Reyes worked 15 years as a union electrician.");
    expect(at("EVTC has more than 10 employer partners.", [electrician])).toEqual(["more than 10"]);
  });
});

describe("checkClaimNumbers — spans of years", () => {
  const founded2012 = fact("fct_founded", "EVTC was founded in 2012.");
  const founded2016 = fact("fct_founded", "EVTC was founded in 2016 by local contractors.");
  const mlc = fact(
    "fct_mlc",
    "Mesa Literacy Circle was founded in 1998 by a group of retired teachers.",
  );
  const led = fact("fct_led", "Dana Reyes has led EVTC since 2018.");
  const at = (text: string, facts: FactRow[], asOfYear = 2026) =>
    checkClaimNumbers({ text }, facts, { asOfYear });

  it("measures qualified spans from a founding year as of the check year", () => {
    expect(at("EVTC has served the region for over a decade.", [founded2012])).toEqual([]);
    expect(at("For more than a decade, EVTC has trained adults.", [founded2012])).toEqual([]);
    expect(at("MLC has taught adults for more than two decades.", [mlc])).toEqual([]);
    expect(at("EVTC has trained adults for nearly 15 years.", [founded2012])).toEqual([]);
    expect(at("EVTC has trained adults for about 14 years.", [founded2012])).toEqual([]);
    expect(at("Dana Reyes has led EVTC for over 7 years.", [led])).toEqual([]);
  });

  it("accepts an exact span only if the founding year allows it", () => {
    expect(at("EVTC has trained adults for 14 years.", [founded2012])).toEqual([]);
    expect(at("EVTC has trained adults for 13 years.", [founded2012])).toEqual([]);
    expect(at("EVTC has trained adults for 15 years.", [founded2012])).toEqual(["15"]);
  });

  it("rejects spans the founding year doesn't support (adversarial)", () => {
    // founded 2016 → at most 10 completed years in 2026: "over a decade" isn't guaranteed
    expect(at("EVTC has served the region for over a decade.", [founded2016])).toEqual([
      "over a decade",
    ]);
    expect(at("MLC has taught adults for more than three decades.", [mlc])).toEqual([
      "more than three decades",
    ]);
    expect(at("Dana Reyes has led EVTC for over 8 years.", [led])).toEqual(["over 8 years"]);
    // without a start year (or a documented span) the span is unsupported
    expect(at("EVTC has served the region for over a decade.", [trained])).toEqual([
      "over a decade",
    ]);
    // an age is not a span since founding
    expect(at("Participants are over 18 years old.", [mlc])).toEqual(["over 18"]);
    // a start year in the future supports nothing
    expect(at("EVTC has trained adults for over a decade.", [founded2012], 2011)).toEqual([
      "over a decade",
    ]);
  });

  it("also accepts a span documented as a span", () => {
    const electrician = fact("f", "Dana Reyes worked 15 years as a union electrician.");
    expect(at("Dana Reyes brings over a decade of trade experience.", [electrician])).toEqual([]);
    expect(at("Dana Reyes brings over two decades of trade experience.", [electrician])).toEqual([
      "over two decades",
    ]);
  });
});

describe("findNumberMismatches", () => {
  it("pairs each unsupported figure with the closest comparable figure in the facts", () => {
    const served = fact("f", "MLC served 386 adult learners in program year 2025.");
    expect(
      findNumberMismatches({ text: "MLC served 836 adult learners in 2025." }, [served]),
    ).toEqual([{ text: "836", factSays: "386" }]);
    expect(
      findNumberMismatches({ text: "In 2023, SWIF received a $50,000 grant." }, [grant]),
    ).toEqual([{ text: "$50,000", factSays: "$5,000" }]);
    expect(findNumberMismatches({ text: "92% found jobs." }, [trained])).toEqual([
      { text: "92%", factSays: null },
    ]);
    expect(findNumberMismatches({ text: "Half of trainees are women." }, [women])).toEqual([
      { text: "Half", factSays: "40 percent" },
    ]);
    expect(findNumberMismatches({ text: "The budget is $12 million." }, [budget])).toEqual([
      { text: "$12 million", factSays: "$1,200,000" },
    ]);
    expect(
      findNumberMismatches(
        { text: "EVTC has operated for over a decade." },
        [fact("f", "EVTC was founded in 2018.")],
        { asOfYear: 2026 },
      ),
    ).toEqual([{ text: "over a decade", factSays: "it started in 2018 (8 years ago)" }]);
  });
});

describe("factStartYears", () => {
  it("reads founding / start years, not other years", () => {
    expect(
      factStartYears([
        fact("a", "EVTC was founded in 2011."),
        fact("b", "Dana Reyes has led EVTC since 2018 after 15 years as an electrician."),
        fact("c", "MLC was founded by a group of retired teachers in 1998."),
        fact("d", "In 2024 our Trades Academy trained 48 apprentices."),
      ]).sort(),
    ).toEqual([1998, 2011, 2018]);
  });
});
