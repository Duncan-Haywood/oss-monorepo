// The printed total checked against the receipt's own arithmetic, and two OCR
// readings of one receipt settled the same way. Found on SROIE's 626 receipt
// scans through tesseract (eval/sroie-receipts.mjs --ocr); receipt text below is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, parseReceiptPasses, oneDigitApart, GUESS_VOTE, CASH_GUESS_VOTE, splitDecimal } from "./receipts.mjs";

test("one digit apart: same length, exactly one digit differs", () => {
  assert.equal(oneDigitApart(900, 960), true);
  assert.equal(oneDigitApart(3100, 3400), true);
  assert.equal(oneDigitApart(900, 900), false);
  assert.equal(oneDigitApart(900, 1900), false);
  assert.equal(oneDigitApart(1234, 4321), false);
});

test("a total misread by one digit is corrected when two kinds of check agree", () => {
  // "Total : 9.00" then a rounded total misread as 9.60; the items also add to 9.00
  const r = parseReceipt("KEDAI MAJU\nDate: 05/01/2019\nTEH AIS 4.50\nNASI LEMAK 4.50\nTotal : 9.00\nRound Total (RM): 9.60");
  assert.equal(r.cents, 900);
  assert.ok(r.notes.some((n) => /total read as 9\.60/.test(n) && /check the total/.test(n)));
});

test("one check alone does not overrule the printed total", () => {
  // cash less change says 31.00, nothing else agrees: 34.00 stays, as printed
  const r = parseReceipt("KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00");
  assert.equal(r.cents, 3400);
  assert.ok(!r.notes.some((n) => /one digit apart/.test(n)));
});

test("a few cents either way is rounding, not a misread digit", () => {
  // items 23.26 rounded to 23.25: both checks agree on 23.26 but it is the 5-sen rounding
  const r = parseReceipt("KEDAI MAJU\nKOPI 11.63\nROTI 11.63\nTotal 23.25\nCash 50.00\nChange 26.74");
  assert.equal(r.cents, 2325);
});

test("a total any check confirms is left alone", () => {
  const r = parseReceipt("KEDAI MAJU\nKOPI 4.00\nROTI 5.00\nTotal 9.00\nCash 10.00\nChange 1.00");
  assert.equal(r.cents, 900);
  assert.deepEqual(Object.keys(r).includes("checks"), false, "checks are not an enumerable field");
  assert.ok(r.checks.length >= 2);
});

test("two OCR readings that disagree take the total the arithmetic confirms", () => {
  const a = "KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00";
  const b = "KEDAI MAJU\nDate: 05/01/2019\nTotal Amount: 31.00\nCash Received 101.00\nChange : 70.00";
  const r = parseReceiptPasses([a, b]);
  assert.equal(r.cents, 3100);
  assert.ok(r.notes.some((n) => /readings disagree/.test(n)));
  // the order of the readings does not matter when one is confirmed
  assert.equal(parseReceiptPasses([b, a]).cents, 3100);
});

test("two readings with no arithmetic to decide keep the first", () => {
  const r = parseReceiptPasses(["KEDAI MAJU\nTotal 12.00", "KEDAI MAJU\nTotal 13.00"]);
  assert.equal(r.cents, 1200);
  assert.ok(!r.notes.some((n) => /readings disagree/.test(n)));
});

test("a merchant the first reading missed is taken from the second; a date is not", () => {
  const r = parseReceiptPasses(["Total 12.00", "KEDAI MAJU\nDate: 13/01/2019\nTotal 12.00"]);
  assert.equal(r.merchant, "KEDAI MAJU");
  assert.ok(!r.notes.includes("no merchant found"));
  assert.equal(r.date, null);
  assert.equal(r.ok, false);
});

test("one reading, or empty ones, behave as parseReceipt", () => {
  const t = "KEDAI MAJU\nDate: 05/01/2019\nTotal 12.00";
  assert.deepEqual(parseReceiptPasses([t]), parseReceipt(t));
  assert.deepEqual(parseReceiptPasses([t, ""]), parseReceipt(t));
  assert.equal(parseReceiptPasses([]).cents, null);
});

test("a photo is read with --psm 6, then --psm 4 the second time; text files once", async () => {
  const { receiptPassesFromFile } = await import("./ocr.mjs");
  const calls = [];
  const run = (cmd, args) => { calls.push([cmd, ...args].join(" ")); return { status: 0, stdout: args.includes("4") ? "KEDAI MAJU\nTotal 31.00" : "KEDAI MAJU\nTotal 34.00" }; };
  const t = receiptPassesFromFile("slip.jpg", { run, env: {} });
  assert.equal(t.length, 2);
  // (the thumbnail that measures the lighting is asked of ImageMagick; this stub has none)
  assert.deepEqual(calls.filter((c) => c.startsWith("tesseract")), ["tesseract slip.jpg stdout --psm 6", "tesseract slip.jpg stdout --psm 4"]);
  // a custom engine, or tesseract already on --psm 4, is read once
  assert.equal(receiptPassesFromFile("slip.jpg", { run, env: { RECEIPT_OCR_CMD: "myocr {file}" } }).length, 1);
  assert.equal(receiptPassesFromFile("slip.jpg", { run, env: { RECEIPT_OCR_CMD: "tesseract {file} stdout --psm 4" } }).length, 1);
  // a tesseract command with no mode gets --psm 4 added for the second reading
  calls.length = 0;
  assert.equal(receiptPassesFromFile("slip.jpg", { run, env: { RECEIPT_OCR_CMD: "tesseract {file} stdout" } }).length, 2);
  assert.deepEqual(calls.filter((c) => c.startsWith("tesseract")), ["tesseract slip.jpg stdout", "tesseract slip.jpg stdout --psm 4"]);
  // a second pass that fails leaves the first
  let n = 0;
  const flaky = () => (n++ ? { status: 1, stdout: "" } : { status: 0, stdout: "KEDAI MAJU\nTotal 34.00" });
  assert.equal(receiptPassesFromFile("slip.jpg", { run: flaky, env: {} }).length, 1);
});

test("addReceipts takes two readings of one photo as one receipt", async () => {
  const { addReceipts } = await import("./receipts.mjs");
  const a = "KEDAI MAJU\nDate: 13/01/2019\nTotal Amount: 34.00\nCash Received 101.00\nChange : 70.00";
  const b = a.replace("34.00", "31.00");
  const books = { receipts: [], transactions: [], accounts: [], rules: [] };
  const r = addReceipts(books, [a, b]);
  assert.equal(r.added.length, 1);
  assert.equal(r.added[0].cents, 3100);
  assert.equal(addReceipts(books, [a]).added[0].cents, 3400);
});

// Three or more readings vote (eval/srd, US phone photos). Receipt text written here.
test("with four readings the total printed on a total line by most readings wins", () => {
  const lost = "GREEN FIELD\nSUB TOTAL: 51.90\nTax 1: 4.60";          // big TOTAL line lost: largest amount 51.90
  const read = "GREEN FIELD\nSUB TOTAL: 51.90\nTax 1: 4.68\nTOTAL: 56.58";
  const misread = "GREEN FIELD\nSUB TOTAL: 51.90\nTax 1: 4.68\nTOTAL: 56.50";
  assert.equal(parseReceiptPasses([lost, misread]).cents, 5650);          // two readings: rule unchanged
  assert.equal(parseReceiptPasses([lost, misread, read, read]).cents, 5658); // two lines and subtotal plus tax
  // a tie goes to the earlier reading
  assert.equal(parseReceiptPasses(["Total 12.00", "Total 13.00", "Total 13.00", "Total 12.00"]).cents, 1200);
});

// A reading with no total line whose total is only the largest amount counts half
// (GUESS_VOTE; eval/srd 1123: 19.75 guessed three times against one "Total 21.76").
test("readings that only guessed the largest amount count half in the vote", () => {
  assert.equal(GUESS_VOTE, 0.5);
  const guess = "CAFE ROMA\nServer: Ann\nCash 19.75";   // TOTAL line lost
  const read = "CAFE ROMA\nServer: Ann\nTotal 21.76";
  assert.match(parseReceipt(guess).notes.join(";"), /took the largest amount/);
  // three guesses (1.5) against one total line (2): the total line wins
  assert.equal(parseReceiptPasses([guess, guess, read, guess]).cents, 2176);
  // two guesses (1) against one total line (2), the line read last: it still wins
  assert.equal(parseReceiptPasses([guess, guess, guess, read]).cents, 2176);
  // with no total line anywhere, guesses still vote among themselves
  assert.equal(parseReceiptPasses([guess, "CAFE ROMA\nCash 30.00", guess, guess]).cents, 1975);
  // a total line read by one reading against two others that printed theirs on total lines: most lines win
  assert.equal(parseReceiptPasses(["Total 13.00", read, "Total 13.00", guess]).cents, 1300);
});

test("a total's first digit read as a glued letter is repaired only when the receipt's sums give it", () => {
  const body = "JOES DINER\n01/02/2020\nBurger 30.15\nFries 15.00\nSubtotal 45.15\nTax 2.75\n";
  // "Balance Due A7.90": the money pattern takes 7.90; subtotal plus tax and the items give 47.90
  const r = parseReceipt(body + "Balance Due A7.90");
  assert.equal(r.cents, 4790);
  assert.match(r.notes.join(";"), /read "A7\.90" as 7\.90.*47\.90.*check the total/);
  assert.equal(r.itemsOk, true);
  for (const [c, d] of [["G", 6], ["T", 7], ["g", 9]]) {
    const t = `SHOP\nSubtotal ${d}5.15\nTax 2.75\nTotal ${c}7.90`;
    assert.equal(parseReceipt(t).cents, d * 1000 + 790, c);
  }
  // no sum gives the repaired amount: the total stays as read
  assert.equal(parseReceipt(body + "Balance Due A8.90").cents, 890);
  // a sum gives the amount as read: the letter is a real letter
  assert.equal(parseReceipt("SHOP\nSubtotal 7.10\nTax 0.80\nTotal A7.90").cents, 790);
  // a letter inside a word ("TA7.90"), a currency sign or a space before the amount: untouched
  assert.equal(parseReceipt("SHOP\nSubtotal 45.15\nTax 2.75\nTotal TA7.90").cents, 790);
  assert.equal(parseReceipt("SHOP\nSubtotal 45.15\nTax 2.75\nTotal A $7.90").cents, 790);
  assert.equal(parseReceipt("SHOP\nSubtotal 45.15\nTax 2.75\nTotal A 7.90").cents, 790);
  // another total line gives it ("Total 47.90" above "Balance Due A7 .90", SRD 1177, the tax misread)
  assert.equal(parseReceipt("SHOP\nSubtotal 45.15\nTax 2.18\nTotal 47.90\nBalance Due A7 .90").cents, 4790);
  // another total line gives the amount as read: left alone
  assert.equal(parseReceipt("SHOP\nTotal 7.90\nAmount Due A7.90").cents, 790);
  // the four readings: two that read the glued letter now agree with the clean one
  const clean = body + "Balance Due 47.90";
  assert.equal(parseReceiptPasses([body + "Balance Due A7.90", "JOES DINER\nBalance Due A7.90", clean, "JOES DINER\nBalance Due A7.90"]).cents, 4790);
});

test("no total line: the card line's amount, before the largest amount on the page", () => {
  // SRD 1082: "VISA 6.56" with a phone number and a 19.07 lower down
  const r = parseReceipt("TACO SPOT\n562-860-2310\nTaco 3.28\nTaco 3.28\nVISA 6.56\nPoints 19.07");
  assert.equal(r.cents, 656);
  assert.match(r.notes.join(";"), /took the amount on the card line/);
  assert.equal(parseReceipt("DINER\nMASTERCARD ##4617 $52.47\nTip ____\nCash 60.00").cents, 5247);
  assert.equal(parseReceipt("DINER\nCredit Card\n13.22").cents, 1322); // amount on the next line
  // tip, change and balance lines on a card are not the charge
  assert.equal(parseReceipt("DINER\nCard balance 80.00\nItem 5.00").cents, 8000); // falls back on the largest
  assert.match(parseReceipt("DINER\nCard balance 80.00\nItem 5.00").notes.join(";"), /largest amount/);
  // a printed total line still wins over the card line
  assert.equal(parseReceipt("DINER\nTotal 12.00\nVISA 14.40").cents, 1200);
  // whole-unit slips keep the old fallback: "[1] BCA DEBIT -259,000" reads as 1 there (CORD train-178)
  assert.equal(parseReceipt("GARISH PC 259.000\n259.000\nTotal Rp\n[1] BCA DEBIT -259,000\nTotal Qty 2").cents, 25900000);
});

// --four-pass (CLI): the photo twice and an ImageMagick grey copy at 2,000 px twice.
test("--four-pass reads a small photo four times (enlarged copy last), a big one four times (shrunk copy first), and skips the copy without ImageMagick", async () => {
  const { receiptPassesFromFile } = await import("./ocr.mjs");
  const mk = (w, h, { magick = true } = {}) => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (cmd === "magick") return { error: new Error("ENOENT") }; // ImageMagick 6: identify and convert only
      if (cmd === "identify") return magick ? { status: 0, stdout: `${w} ${h}` } : { error: new Error("ENOENT") };
      if (cmd === "convert") return magick ? { status: 0, stdout: "" } : { error: new Error("ENOENT") };
      return { status: 0, stdout: `KEDAI MAJU\nTotal 34.00\n${/grey\.png/.test(args[0] ?? "") ? "copy" : "photo"} ${args.at(-1)}` };
    };
    return { run, calls };
  };
  const small = mk(750, 1000);
  const t = receiptPassesFromFile("slip.jpg", { run: small.run, env: {}, grow: 2000 });
  assert.equal(t.length, 4);
  const ocr = small.calls.filter((c) => c.startsWith("tesseract"));
  assert.equal(ocr.length, 4);
  assert.match(ocr[2], /grey\.png stdout --psm 6$/);
  assert.match(ocr[3], /grey\.png stdout --psm 4$/);
  assert.ok(small.calls.some((c) => /^convert slip\.jpg\[0\] -colorspace Gray -resize 2000x2000 .*grey\.png$/.test(c)));
  // over 2,000 px on the long side (a full-size phone photo, a 300 dpi scan): the grey
  // copy is shrunk to 2,000 px and read first, then the photo
  const big = mk(3000, 4000);
  const bt = receiptPassesFromFile("slip.jpg", { run: big.run, env: {}, grow: 2000 });
  assert.deepEqual(bt.map((x) => x.split("\n").at(-1)), ["copy 6", "copy 4", "photo 6", "photo 4"]);
  // a small photo's readings: the photo first, the enlarged copy after
  assert.deepEqual(t.map((x) => x.split("\n").at(-1)), ["photo 6", "photo 4", "copy 6", "copy 4"]);
  assert.ok(big.calls.some((c) => /^convert slip\.jpg\[0\] -colorspace Gray -resize 2000x2000 .*grey\.png$/.test(c)));
  // exactly 2,000 px: two readings, no copy
  const exact = mk(1500, 2000);
  assert.equal(receiptPassesFromFile("slip.jpg", { run: exact.run, env: {}, grow: 2000 }).length, 2);
  assert.ok(!exact.calls.some((c) => c.startsWith("convert") && !/ gray:-$/.test(c))); // only the lighting thumbnail
  // no ImageMagick: two readings, no error
  assert.equal(receiptPassesFromFile("slip.jpg", { run: mk(750, 1000, { magick: false }).run, env: {}, grow: 2000 }).length, 2);
  // without grow, as before
  assert.equal(receiptPassesFromFile("slip.jpg", { run: mk(750, 1000).run, env: {} }).length, 2);
});

test("a photo tesseract cannot open is read again from an ImageMagick PNG copy; a missing tesseract still says how to get it", async () => {
  const { receiptTextFromFile } = await import("./ocr.mjs");
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (cmd === "magick") return { error: new Error("ENOENT") };
    if (cmd === "identify") return { status: 0, stdout: "4961 7016" };
    if (cmd === "convert") return { status: 0, stdout: "" };
    // the damaged JPEG fails, its PNG copy reads
    return args[0].endsWith(".png") ? { status: 0, stdout: "AEON CO.\nTotal 12.00" } : { status: 1, stdout: "", stderr: "Error in pixReadStream: jpeg: no pix returned\nError during processing." };
  };
  assert.equal(receiptTextFromFile("427.jpg", { run, env: {} }), "AEON CO.\nTotal 12.00");
  assert.ok(calls.some((c) => /^convert 427\.jpg\[0\] .*copy\.png$/.test(c)));
  // no ImageMagick either: the tesseract failure is reported, not "tesseract is needed"
  const bare = (cmd) => (cmd === "tesseract" ? { status: 1, stdout: "", stderr: "Error during processing." } : { error: new Error("ENOENT") });
  assert.throws(() => receiptTextFromFile("427.jpg", { run: bare, env: {} }), /tesseract failed: Error during processing/);
  assert.throws(() => receiptTextFromFile("427.jpg", { run: () => ({ error: new Error("ENOENT") }), env: {} }), /tesseract-ocr/);
});

// An unevenly lit photo (ImageMagick's 32 x 32 grey thumbnail varies by SHADED_CUT or
// more) gets the local (Sauvola) threshold for its second reading of each image; an
// evenly lit one keeps --psm 4 (README, "Shaded photos: a local threshold").
test("--two-pass and --four-pass read an unevenly lit photo the second time with the local threshold, an evenly lit one with --psm 4", async () => {
  const { receiptPassesFromFile, photoSpread } = await import("./ocr.mjs");
  const { lightSpread, SHADED_CUT } = await import("./photoocr.mjs");
  const even = Buffer.alloc(1024, 200);                                   // a flat white scan
  const shade = Buffer.from(Array.from({ length: 1024 }, (_, i) => (i % 32 < 16 ? 60 : 220))); // half in shadow
  assert.equal(lightSpread(even), 0);
  assert.ok(lightSpread(shade) >= SHADED_CUT);
  const mk = (thumb) => {
    const calls = [];
    const run = (cmd, args) => {
      calls.push([cmd, ...args].join(" "));
      if (cmd === "magick") return { error: new Error("ENOENT") };
      if (cmd === "identify") return { status: 0, stdout: "750 1000" };
      if (cmd === "convert") return { status: 0, stdout: args.at(-1) === "gray:-" ? thumb : "" };
      return { status: 0, stdout: "KEDAI MAJU\nTotal 34.00" };
    };
    return { run, calls, ocr: () => calls.filter((c) => c.startsWith("tesseract")).map((c) => c.replace(/^tesseract \S+ stdout /, "")) };
  };
  const s = mk(shade);
  assert.ok(photoSpread("slip.jpg", s.run) >= SHADED_CUT);
  s.calls.length = 0;
  receiptPassesFromFile("slip.jpg", { run: s.run, env: {} });
  assert.deepEqual(s.ocr(), ["--psm 6", "--psm 6 -c thresholding_method=2"]);
  s.calls.length = 0;
  receiptPassesFromFile("slip.jpg", { run: s.run, env: {}, grow: 2000 });
  assert.deepEqual(s.ocr(), ["--psm 6", "--psm 6 -c thresholding_method=2", "--psm 6", "--psm 6 -c thresholding_method=2"]);
  const e = mk(even);
  receiptPassesFromFile("slip.jpg", { run: e.run, env: {}, grow: 2000 });
  assert.deepEqual(e.ocr(), ["--psm 6", "--psm 4", "--psm 6", "--psm 4"]);
  // a thumbnail of the wrong size (a failed or odd ImageMagick) is no measurement
  assert.equal(photoSpread("slip.jpg", mk(Buffer.alloc(10, 9)).run), null);
});

// SRD photos 1018, 1080, 1112, 1157 (eval/split-decimal-2026-11-15.md): the total line's
// decimal point lost or read as a space, comma or colon. Text below is made up.
test("a total line with its decimal point lost reads dollars and cents, says so, and leaves everything else alone", () => {
  assert.deepEqual(splitDecimal("TOTAL 184 47)"), { cents: 18447, was: "184 47" });
  assert.equal(splitDecimal("esl TOTAL : 92:22").cents, 9222);
  assert.equal(splitDecimal("dount Due 9, 70").cents, 970);
  assert.equal(splitDecimal("Amount Due $2 17").cents, 217);
  assert.equal(splitDecimal("Total due 10:45 PM"), null);          // a time
  assert.equal(splitDecimal("Table 12 Guests 2 17"), null);        // no total word
  assert.equal(splitDecimal("Total 2 175"), null);                 // three digits after the gap
  const r = parseReceipt("CORNER DINER\n05/02/2026\nBurger 12.00\nFries 4.00\nTax 1.36\nTOTAL 17 36)\nThank you");
  assert.equal(r.cents, 1736);
  assert.match(r.notes.join("; "), /decimal point lost: took 17\.36, check the total/);
  // an amount that reads normally on the line is never re-read
  const plain = parseReceipt("CORNER DINER\n05/02/2026\nTOTAL 17.36 2 05");
  assert.equal(plain.cents, 1736);
  assert.doesNotMatch(plain.notes.join("; "), /decimal point lost/);
  // a decimal-comma receipt keeps its own reading: "Summe 9, 70" is 9,70 already
  assert.equal(parseReceipt("CAFE MITTE\n05.02.2026\nKaffee 4,50\nKuchen 5,20\nSumme 9,70").cents, 970);
});

// SRD photos 1133 and 1002 (README, "Reading the total first"). Text below is made up.
test("a subtotal plus tax printed on the page wins the vote when OCR damaged the word TOTAL", () => {
  const sub = "HARBOR GRILL\n05/02/2026\nSUBTOTAL: 134.46\nTax(9%) 12.11\n";
  const r = parseReceiptPasses([
    sub + "Server: Kim 173.46",                 // no total line: largest amount guessed
    sub + "=—STOTAL: = -:146.57\nCash 186.74",  // the total, its label damaged
    "HARBOR GRILL\nSUBTOTAL: erer\nA TOTAL: 12.11", // the tax read as a total
    sub + "SOSTOTAL: ~=—'146.57\nCash 170.77",
  ]);
  assert.equal(r.cents, 14657);
  assert.equal(r.taxCents, 1211);
  assert.match(r.notes.join("; "), /subtotal 134\.46 plus the tax 12\.11, printed on the page: check the total/);
  // not printed anywhere: the readings' own totals stand
  const q = parseReceiptPasses([sub + "Server: Kim 173.46", sub + "Server 160.00", "HARBOR GRILL\nA TOTAL: 12.11", sub + "Cash 200.00"]);
  assert.notEqual(q.cents, 14657);
  // a reading that read the total on a total line keeps it, even beside a printed sum
  assert.equal(parseReceiptPasses([sub + "TOTAL 150.57", sub + "TOTAL 150.57", sub + "146.57", sub + "TOTAL 150.57"]).cents, 15057);
});

test("a total line read with a leading zero (04.78) counts as a guess in the vote", () => {
  const r = parseReceiptPasses(["MESA CAFE\n| TOTAL: 04.78", "MESA CAFE\nTax 12\nTOTAL:", "MESA CAFE\n: TOTAL: $94.78 |", "MESA CAFE\nTOTAL: per"]);
  assert.equal(r.cents, 9478);
  // alone, it is still read
  assert.equal(parseReceipt("MESA CAFE\nTOTAL: 04.78").cents, 478);
  // "TOTAL 0.78" is not a lost digit
  assert.equal(parseReceiptPasses(["MESA CAFE\nTOTAL 0.78", "MESA CAFE\nTOTAL 9.78", "MESA CAFE\nTOTAL 0.78", "MESA CAFE"]).cents, 78);
  // a stray 0 before an intact total, with no reading offering a lost first digit, keeps its
  // full vote (SROIE 169, held out: "Grand Total 029,30" against guesses of 3.00)
  const y = (t) => `YAM FRESH\nsHerb.J RH3.00\n${t}\nCash RM30,30`;
  assert.equal(parseReceiptPasses([y("Grand Total VAS, x 30"), y("Grand Total 029,30"), y("Grand Total VAS) x 30"), y("Grand Total VAS) x 30")]).cents, 2930);
});

// A reading that found no total line and fell back on the largest amount, which is the
// amount on the cash line, gets no vote (CASH_GUESS_VOTE): two such guesses of the cash
// handed over used to outvote a reading that guessed the real total (CORD validation-30,
// eval/receipt-cash-guess-2026-11-16.md). Receipt text made up, same shape.
test("a largest-amount guess on the cash line gets no vote", () => {
  assert.equal(CASH_GUESS_VOTE, 0);
  const cash = "BREAD SHOP\n1 RED BEAN BREAD 9,0O0\n1 SAUSAGE ROLL l2,0O0\nT0TAI. 2l,0O0\nCASH 50,000\nCHANGF 29.0O";
  const lost = "BREAD SHOP\n1 RED BEAN BREAD 9,0O0\n1 SAUSAGE l2,0O0\nT0TAI. 21,000";
  const p = parseReceipt(cash);
  assert.equal(p.cents, 5000000);
  assert.ok(p.notes.some((n) => /printed on the cash line/.test(n)));
  assert.equal(parseReceipt(lost).cents, 2100000);
  assert.ok(!parseReceipt(lost).notes.some((n) => /cash line/.test(n)));
  assert.equal(parseReceiptPasses([lost, cash, cash, "BREAD SHOP\n....."]).cents, 2100000);
  // alone, the cash guess is still the only candidate and stands
  assert.equal(parseReceiptPasses([cash, cash, cash]).cents, 5000000);
});

// Exact cash is the total: when the receipt's arithmetic gives the cash-line amount
// (subtotal plus tax, the items plus tax), that guess keeps its half vote and beats a
// misread "Total $5.06" (SRD 1108, page readings).
test("a cash-line guess the arithmetic confirms keeps its vote", () => {
  const exact = "CAFE\nPASTA 30.00\nSALAD 18.54\nSubtotal: $48.54\nCA Tax 7.25%: $3.52\nTota1 2. 0t\nCash |\nTendered: $52.06 |";
  const wrong = "CAFE\nTotal $5.06\nTendered: $52.06";
  assert.ok(parseReceipt(exact).notes.some((n) => /printed on the cash line/.test(n)));
  assert.equal(parseReceiptPasses([wrong, "CAFE\nTotal", "CAFE\nCash", exact]).cents, 5206);
});

// Exact cash with one item: a cash-line guess keeps its half vote when a reading prints the
// same amount on a line that is not the cash line ("AIR MINERAL 7000" with "CASH 7000":
// CORD validation-66, eval/cord-cash-guess-2026-11-16.md). Receipt text made up, same shape.
test("a cash-line guess printed on an item line too keeps its vote", () => {
  const stray = "SHOP\nHehe 1088 ee\nWATER -7,000\nCASH -7,000";
  const item = "SHOP\nWATER 7000\nCASH -7,000";
  const cash = "SHOP\nWATER 27 5000\nCASH 7000";
  assert.ok(parseReceipt(cash).notes.some((n) => /printed on the cash line/.test(n)));
  assert.equal(parseReceiptPasses([stray, item, "SHOP", cash]).cents, 700000);
  // the 50,000 of the bread-shop slip is on cash lines only, so that guess still gets nothing
  const lost = "BREAD SHOP\n1 RED BEAN BREAD 9,0O0\n1 SAUSAGE l2,0O0\nT0TAI. 21,000";
  const onCash = "BREAD SHOP\n1 RED BEAN BREAD 9,0O0\n1 SAUSAGE ROLL l2,0O0\nT0TAI. 2l,0O0\nCASH 50,000\nCHANGF 29.0O";
  assert.equal(parseReceiptPasses([lost, onCash, onCash, "BREAD SHOP\n....."]).cents, 2100000);
});

// A 1-1 tie between two taxes goes to the one more readings print on a tax line, counting a
// reading that lost its total and so parsed no tax (CORD validation-65: "4,264" once,
// "4,964" twice). Receipt text made up, same shape.
test("a tax tie goes to the amount more readings print on a tax line", () => {
  const a = "WARUNG\nBASO 1 43,636\nTAX 16.00 4 4,264\nGRAND TOTAL 54,600";
  const b = "WARUNG\nBASO 1 43,636\nTAX 16.00 4 4,964\nGRAND TOTAL 54,600";
  const c = "WARUNG\nm TAX 10.00 2 4,964\nGRAND TOTAL AGO";
  assert.equal(parseReceiptPasses([a, b, "WARUNG", c]).taxCents, 496400);
  // with no third reading the tie keeps the reading the total came from, as before
  assert.equal(parseReceiptPasses([a, b, "WARUNG", "WARUNG"]).taxCents, 426400);
});

// The largest-amount fallback reads through the dash OCR prints before a whole-unit amount
// ("AIR MINERAL -7,000": CORD validation-66's psm6 and g6 readings lost 7,000 that way and
// kept a stray "1088"), as the cash and change lines already did. Receipt text made up, same shape.
test("the largest-amount fallback reads a dash-prefixed whole amount", () => {
  const stray = "SHOP\nHehe 1088 ee\nWATER -7,000\nCASH -7,000";
  const p = parseReceipt(stray);
  assert.equal(p.cents, 700000);
  // printed on the cash line too, so it says so; the item line keeps its vote across readings
  assert.ok(p.notes.some((n) => /printed on the cash line/.test(n)));
  assert.equal(parseReceiptPasses([stray, stray, "SHOP", "SHOP\nHehe 1088 ee"]).cents, 700000);
});

// tesseract reads a leading 5 as "§" on a whole-unit slip ("TOTAL SALES §2,000" for 52,000:
// CORD validation-84). Only glued to a grouped amount. Receipt text made up, same shape.
test("a section sign glued to a grouped whole amount reads as 5", () => {
  const p = parseReceipt("TEA SHOP\n1 x CHOCO MT 24,000\nPEARL 4,000\n1 x CHOCO MT 24,000\nSUB TOTAL §2,000\nTOTAL SALES §2,000");
  assert.equal(p.cents, 5200000);
  // a loose section sign is left alone
  assert.equal(parseReceipt("TEA SHOP\nTOTAL § 2,000").cents, 200000);
});

// No reading could read the tax line's amount ("TAX 15.45" on a 172,000 slip; CORD
// validation-93), the total is settled and a subtotal line shows 156,364's last digits
// ("SUBTOTAL 56,364"): 172,000 split at Indonesia's 10% is 156,364 plus 15,636. Receipt text
// made up, same shape (eval/cord-tax-split-2026-11-16.md).
test("a whole-unit slip's unreadable tax is the total split at 10% when a subtotal line agrees", () => {
  const a = "CAFE\n1 PASTA 80,000\nSUBTOTAL 56,364\nTAX 15.45\nTOTAL 172,000";
  const b = "CAFE\nGuRTOTAL [56,3464\nTAX 5.45";
  const p = parseReceiptPasses([a, b, a, "CAFE"]);
  assert.equal(p.cents, 17200000);
  assert.equal(p.taxCents, 1563600);
  assert.ok(p.notes.some((n) => /split at 10%/.test(n)));
  // no subtotal line agrees with the split: no tax is guessed
  const c = a.replace("56,364", "44,100");
  assert.equal(parseReceiptPasses([c, "CAFE", c, "CAFE"]).taxCents, null);
  // no tax line in any reading: no tax is guessed either
  const d = a.replace("TAX 15.45\n", "");
  assert.equal(parseReceiptPasses([d, "CAFE", d, "CAFE"]).taxCents, null);
  // a decimal receipt is never split
  const e = "CAFE\nSUBTOTAL 56.36\nTAX 1.5\nTOTAL 172.00";
  assert.equal(parseReceiptPasses([e, "CAFE", e, "CAFE"]).taxCents, null);
});


test("a printed tip or service charge counts in the tax vote's arithmetic", () => {
  // ExpressExpense 1182 in shape: the first reading lost the resort tax (2.80), the second
  // added both tax lines (3.60), which close to the final total only with the tip the third
  // reading read; on a tie the first reading's 2.80 won
  const a = "GRILL\nSub-total: 40.00\nSales Tax 7%: 2.80\nesort tax 2% '0,\nVoluntary 18% Tip: 720\nTotal 50.80";
  const b = "GRILL\nSub-total: 40.00\nSales Tax 7%: 2.80\nResort Tax 2%: 0.80\nTotal 43.60\nVoluntary 18% Tip a\nTotal 50.80";
  const c = "GRILL\nsub-total : 40.00\nResort tax 2%: xe\nVoluntary 18% Tip: 7.20\nTotal 50.80";
  const p = parseReceiptPasses([a, b, c, "GRILL\nTotal! 50.80"]);
  assert.equal(p.cents, 5080);
  assert.equal(p.taxCents, 360);
});

test("an unreadable tax line is the total less the subtotal and the service charge", () => {
  // CORD train-429 in shape: the TAX line's amount lost, a service charge printed
  const a = "CAFE\nSUBTTL 216,000\nService Charge 17,280\nTAX\nTOTAL 256,608";
  const p = parseReceiptPasses([a, "CAFE", a, "CAFE"]);
  assert.equal(p.taxCents, 2332800);
  assert.ok(p.notes.some((n) => /less the subtotal and the service charge/.test(n)));
  // no tax word in any reading ("Others" may be anything): no tax is guessed
  const d = "CAFE\nSub Total 243.000\nService 13.365\nOthers 25.637\nGRAND TOTAL 282.000";
  assert.equal(parseReceiptPasses([d, "CAFE", d, "CAFE"]).taxCents, null);
  // a suggested-tip table is not a service charge
  const e = "CAFE\nSUBTOTAL 30.00\nTAX\nTOTAL 32.40\nSuggested tip 18% 5.40";
  assert.equal(parseReceiptPasses([e, "CAFE", e, "CAFE"]).taxCents, 240);
});

test("change and quantity lines are not the total, misread or not", () => {
  // CORD validation-70 and -61 in shape: "Total Qty" read "Total aty", "Total Kembalian" (change)
  const a = "RESTO\nSUBTOTAL 103,000\nService 7,725\nPB1 11,073\nTOTAL 121,798\nTotal item 3 Total aty 3";
  assert.equal(parseReceipt(a).cents, 12179800);
  const b = "WARUNG\nSub Total 7,500\nPajak Resto (10%) 750\nTotal Bayar 8,250\nUang Bayar 10,000\nTotal Kembalian 1,750";
  assert.equal(parseReceipt(b).cents, 825000);
});

test("a total in doubt is the receipt's own sum one digit from a total line", () => {
  // CORD validation-87 in shape: the readings' total lines disagree (73,000 and 23,000);
  // cash 30,000 less change 1,000 in two readings makes 29,000, one digit from 23,000
  const a = "KEDAI\nTotal: 73,000\nCash: 30,000\nCHANGE: 1,000";
  const b = "KEDAI\nTotal: 23,000\nCash: 30,000\nCHANGE : 1,000";
  const p = parseReceiptPasses([a, "KEDAI", b, "KEDAI"]);
  assert.equal(p.cents, 2900000);
  assert.ok(p.notes.some((n) => /receipt's own sums give/.test(n)));
  // validation-85 in shape: one total line (13,000) below a subtotal read twice (13,636);
  // one reading's cash less change makes 15,000, and the tax follows from the total
  const c = "KOPI\nSubTotal: 13,636\nTotal: 13,000\ncash: 20,000";
  const d = "KOPI\nSubTotal: 13,636\ncash: 20,000\nChange: 5,000";
  const q = parseReceiptPasses([c, c, "KOPI", d]);
  assert.equal(q.cents, 1500000);
  assert.equal(q.taxCents, 136400);
});

test("a total every reading agrees on stands against a short cash line", () => {
  // CORD train-81 and test-14 in shape: cash less change below the total (another tender,
  // a misprint) is no reason to doubt a total every reading prints
  const a = "TOKO\nTOTAL 36,000\nCASH 35,000\nCHANGE 0";
  assert.equal(parseReceiptPasses([a, a, a]).cents, 3600000);
  // a total line that starts with 0 lost a digit, so it is no reference (validation-33)
  const b = "TOKO\nTOTAL 57,500";
  const c = "TOKO\nTOTAL 07,900\nCASH 7,500\nCHANGE 0", d = "TOKO\nTOTAL 97,900\nCASH 7,500\nCHANGE 0";
  assert.equal(parseReceiptPasses([b, d, "TOKO", c]).cents, 5750000);
});

test("a change line OCR read without its C still closes cash less change", () => {
  // SRD 1022 in shape: "HANGE 62.63"
  const a = parseReceipt("CAFE\n10/29/2018\nTOTAL: 37.37\nCASH: 100.00\nHANGE 62.63");
  assert.ok(a.checks.some(([v, w]) => v === 3737 && w === "cash less change"));
  // a bare "ange" is not the change line: "Orange Crush" read as "'ange Crsh" (SRD 1002)
  const c = parseReceipt("CAFE\n10/29/2018\nTotal 17.00\nCash 20.00\nange Crsh 1.99");
  assert.ok(!c.checks.some(([, w]) => w === "cash less change"));
});

test("a bare TL after a tax word is OCR noise, not a total line", () => {
  // SRD 1022's grey reading: "Tax (8.75%): 44 Of tl Bit." took 8.75 as the total
  const r = parseReceipt("CAFE\n10/29/2018\nSUBTOTAL: 29.88\nTax (8.75%): 3.01 tl\nTOTAL: 32.89");
  assert.equal(r.cents, 3289);
  assert.equal(r.taxCents, 301);
  // "TL 12.50" alone is still a total line
  assert.equal(parseReceipt("CAFE\n10/29/2018\nCOFFEE 12.50\nTL 12.50").cents, 1250);
});

test("a total line under its own reading's subtotal loses its total-line vote when cash less change is above it", () => {
  // SRD 1022 in shape: one reading's "TOTAL: 7.07" sits under its "SUBTOTAL: 29.88"; another
  // reading prints 37.37 with no total word, a third's cash less change makes 37.37
  const a = "CAFE\n10/29/2018\nWEEKDAY DINNER 29.88\nTax 3.01\nPep yh 37.37";
  const b = "CAFE\n10/29/2018\nSUBTOTAL: 29.88\nTOTAL: 7.07";
  const d = "CAFE\nCASH: 100.00\nHANGE 62.63";
  assert.equal(parseReceiptPasses([a, b, "CAFE\n29.88", d]).cents, 3737);
  // with no cash less change above the subtotal the total line keeps its point (CORD
  // validation-61 and -78: the rule alone traded one wrong total for another)
  assert.equal(parseReceiptPasses([a, b, "CAFE\n29.88", "CAFE"]).cents, 707);
});
