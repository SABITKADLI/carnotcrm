import test from "node:test";
import assert from "node:assert/strict";
import {
  currentFinancialYear,
  inPeriod,
  periodBounds,
} from "../src/lib/period";

test("period filters support rolling presets, custom ranges, and Indian financial years", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  assert.deepEqual(periodBounds("last-7", "", "", now), {
    start: "2026-09-24",
    end: "2026-09-30",
  });
  assert.deepEqual(periodBounds("last-90", "", "", now), {
    start: "2026-07-03",
    end: "2026-09-30",
  });
  assert.deepEqual(periodBounds("current-quarter", "", "", now), {
    start: "2026-07-01",
    end: "2026-09-30",
  });
  assert.deepEqual(periodBounds("custom", "", "", now, "2026-05-12", "2026-06-08"), {
    start: "2026-05-12",
    end: "2026-06-08",
  });
  assert.ok(inPeriod("2027-03-31", "fy", "", "2026-27", now));
  assert.ok(!inPeriod("2027-04-01", "fy", "", "2026-27", now));
  assert.equal(currentFinancialYear(now), "2026-27");
});
