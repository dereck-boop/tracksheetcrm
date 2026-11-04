import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanIsrc, fmtDuration, isrcLooksRight, labelCopyGaps, labelCopyRows, labelCopyText, paidInYear, parseDuration, sessionReleaseText, splitTotal } from "../lib/forms";
import { toCsv } from "../lib/csv";

test("song lengths read as m:ss or seconds and print back the same", () => {
  assert.equal(parseDuration("3:45"), 225);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("200"), 200);
  assert.equal(parseDuration("3.45"), null);
  assert.equal(parseDuration(""), null);
  assert.equal(fmtDuration(225), "3:45");
  assert.equal(fmtDuration(3723), "1:02:03");
  assert.equal(fmtDuration(null), "");
});

test("ISRCs are tidied and checked", () => {
  assert.equal(cleanIsrc("us-abc-26-00001"), "USABC2600001");
  assert.ok(isrcLooksRight("USABC2600001"));
  assert.ok(!isrcLooksRight("USABC26001"));
});

test("split totals add decimals without float noise", () => {
  assert.equal(splitTotal([{ percent: 33.33 }, { percent: 33.33 }, { percent: 33.34 }]), 100);
});

const project = { name: "Night Drive", type: "EP", label: null, upc: "123456789012", releaseDate: new Date("2026-12-01T05:00:00Z"), pLine: "2026 The Lows", cLine: null, artist: { name: "The Lows" } };
const track = (over: object = {}) => ({
  title: "Headlights", isrc: "USABC2600001", duration: 201, explicit: false, featuring: null,
  credits: [{ name: "Sam", role: "Mixing engineer" }, { name: "Ana", role: "Bass" }],
  splits: [
    { name: "Jo Low", role: "Writer", percent: 50, pro: "BMI", ipi: "123", publisher: "Low Songs", signedAt: new Date() },
    { name: "Ana Bass", role: "Writer", percent: 50, pro: null, ipi: null, publisher: null, signedAt: new Date() },
  ],
  ...over,
});

test("label copy lists what's still missing", () => {
  assert.deepEqual(labelCopyGaps(project, [track()]), []);
  const gaps = labelCopyGaps({ ...project, releaseDate: null }, [track({ isrc: null, splits: [] })]);
  assert.ok(gaps.some((g) => g.includes("release date")));
  assert.ok(gaps.some((g) => g.includes("ISRC missing on “Headlights”")));
  assert.ok(gaps.some((g) => g.includes("No writers")));
});

test("label copy text has writers, publishers, credits and the P line", () => {
  const text = labelCopyText(project, [track()], "Quiet Room");
  assert.match(text, /The Lows – Night Drive \(EP\)/);
  assert.match(text, /1\. Headlights {2}3:21/);
  assert.match(text, /Written by: Jo Low \(50%, BMI, IPI 123\); Ana Bass \(50%\)/);
  assert.match(text, /Published by: Low Songs/);
  assert.match(text, /Mixing engineer: Sam/);
  assert.match(text, /℗ 2026 The Lows/);
});

test("label copy spreadsheet has one row per split and credit, and quotes commas", () => {
  const rows = labelCopyRows(project, [track(), track({ title: "Empty", credits: [], splits: [] })]);
  assert.equal(rows.length, 1 + 4 + 1);
  const csv = toCsv([["a,b", 'say "hi"', null]]);
  assert.equal(csv, '"a,b","say ""hi""",\r\n');
  assert.equal(toCsv([["=HYPERLINK(1)", -12.5, "@x"]]), "'=HYPERLINK(1),-12.5,'@x\r\n");
});

test("session release fills in the player, fee and artist", () => {
  const text = sessionReleaseText(null, { name: "Ana Bass", legalName: "Ana Maria Bass", role: "Bass", fee: 15000, workDate: null }, { name: "Night Drive", artist: { name: "The Lows" } }, "Quiet Room", (c) => `$${c / 100}`);
  assert.match(text, /I, Ana Maria Bass, performed bass on recordings for "Night Drive" by The Lows, made at Quiet Room on the session dates\./);
  assert.match(text, /paid \$150 as a one-time flat fee/);
  assert.match(text, /work made for hire for The Lows/);
  const custom = sessionReleaseText("{{player}} gets {{fee}}", { name: "Ana", role: "Bass", fee: 100, workDate: null }, { name: "X" }, "S", (c) => String(c));
  assert.equal(custom, "Ana gets 100");
});

test("money paid to a person is totalled per year for the 1099 check", () => {
  const hires = [{ paidAt: new Date("2026-03-01T12:00:00Z"), fee: 150000 }, { paidAt: new Date("2026-09-01T12:00:00Z"), fee: 60000 }, { paidAt: null, fee: 99999 }, { paidAt: new Date("2025-06-01T12:00:00Z"), fee: 1 }];
  assert.equal(paidInYear(hires, 2026), 210000);
});
