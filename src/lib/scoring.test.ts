import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreDay, exercisePoints } from "./scoring";
import { SCORING } from "./config";
import { canLogDay, isDay, addDays } from "./dates";
import { cleanName, parseCount } from "./validate";
import { parseGoogleRollup } from "./connectors";

test("steps are 1 point each", () => {
  assert.equal(scoreDay([4321], []).total, 4321);
});

test("multiple sources take the max, not the sum", () => {
  const s = scoreDay([8000, 9500, 7000], []);
  assert.equal(s.steps, 9500);
  assert.equal(s.stepPoints, 9500);
});

test("10k bonus kicks in at exactly the goal", () => {
  assert.equal(scoreDay([SCORING.dailyGoalSteps - 1], []).bonus, 0);
  assert.equal(scoreDay([SCORING.dailyGoalSteps], []).bonus, SCORING.dailyGoalBonus);
});

test("steps are capped per day", () => {
  assert.equal(scoreDay([999_999], []).steps, SCORING.maxStepsPerDay);
});

test("exercise points per intensity: 50 / 100 / 200 per minute", () => {
  assert.equal(exercisePoints({ intensity: "light", minutes: 10 }), 500);
  assert.equal(exercisePoints({ intensity: "moderate", minutes: 10 }), 1000);
  assert.equal(exercisePoints({ intensity: "heavy", minutes: 10 }), 2000);
});

test("a full day adds up", () => {
  const s = scoreDay([8000], [
    { intensity: "moderate", minutes: 30 },
    { intensity: "light", minutes: 20 },
  ]);
  assert.equal(s.total, 8000 + 3000 + 1000);
});

test("date rules", () => {
  assert.ok(isDay("2026-10-05"));
  assert.ok(!isDay("2026-02-30"));
  assert.ok(canLogDay("2026-10-05", "2026-10-05").ok);
  assert.ok(!canLogDay("2026-10-09", "2026-10-05").ok, "future");
  assert.ok(canLogDay("2026-10-06", "2026-10-05").ok, "one day of date-line slack");
  assert.ok(!canLogDay("2026-09-30", "2026-10-05").ok, "before challenge");
  assert.ok(!canLogDay("2026-10-20", addDays("2026-10-31", 10)).ok, "closed after grace");
});

test("names", () => {
  assert.deepEqual(cleanName("  Sir   Steps-a-Lot "), { ok: true, value: "Sir Steps-a-Lot" });
  assert.ok(cleanName("José 🏃‍♀️").ok);
  assert.ok(!cleanName("a").ok);
  assert.ok(!cleanName("<script>").ok);
  assert.ok(!cleanName("Walktober Official").ok);
});

test("lenient step parsing for Shortcuts", () => {
  assert.equal(parseCount("12,345"), 12345);
  assert.equal(parseCount("8421.0"), 8421);
  assert.equal(parseCount(7000), 7000);
  assert.equal(parseCount("-5"), null);
  assert.equal(parseCount("abc"), null);
});

test("Google Health rollup parser handles civil dates and string counts", () => {
  const out = parseGoogleRollup({
    rollupDataPoints: [
      { civilStartTime: { date: { year: 2026, month: 10, day: 2 } }, steps: { countSum: "9037" } },
      { civilStartTime: { date: { year: 2026, month: 10, day: 3 } }, steps: { countSum: 120 } },
    ],
  });
  assert.deepEqual(out, [
    { day: "2026-10-02", steps: 9037 },
    { day: "2026-10-03", steps: 120 },
  ]);
});
