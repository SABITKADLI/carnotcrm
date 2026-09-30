import test from "node:test";
import assert from "node:assert/strict";
import {
  currentFinancialYear,
  inPeriod,
  periodBounds,
} from "../src/lib/period";

test("period filters use calendar months and April to March financial years", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  assert.deepEqual(periodBounds("this-month", "", "", now), {
    start: "2026-09-01",
    end: "2026-09-30",
  });
  assert.deepEqual(periodBounds("previous-month", "", "", now), {
    start: "2026-08-01",
    end: "2026-08-31",
  });
  assert.ok(inPeriod("2027-03-31", "fy", "", "2026-27", now));
  assert.ok(!inPeriod("2027-04-01", "fy", "", "2026-27", now));
  assert.equal(currentFinancialYear(now), "2026-27");
});
