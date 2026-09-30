import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseWorkbook } from "../src/lib/workbook";

test("workbook parser maps source columns, dates, calculated values and inward discrepancies", async () => {
  const workbook = new ExcelJS.Workbook();
  const master = workbook.addWorksheet("MASTER DATA");
  master.addRow(["MASTER DATA"]);
  master.addRow([]);
  master.addRow([
    "Oxford",
    "Premium",
    58,
    100,
    "Dobby",
    "40s",
    "120x80",
    "100% Cotton",
    "Mill A",
    "Agent A",
    "",
    "",
    "Maker A",
    "",
    "Party A",
    "",
    "Carnot",
    "Pending",
    "Ordered",
    "Garment",
  ]);
  const orders = workbook.addWorksheet("FABRIC ORDERS");
  orders.addRow(["FABRIC ORDERS"]);
  orders.addRow([]);
  orders.addRow([
    "Admin",
    new Date("2026-04-03"),
    "PO2627/001",
    "Oxford",
    "Oxford",
    "Mill A",
    58,
    100,
    "Dobby",
    "100% Cotton",
    "120x80",
    "40s",
    "Agent A",
    "Shirting",
    125,
    new Date("2026-04-20"),
    "2",
    "4",
    1000,
    "Party A",
    "Garment",
    0,
    "Ordered",
    "",
    125000,
    "fpo_preserved",
  ]);
  const transport = workbook.addWorksheet("TRANSPORT");
  transport.addRow(["TRANSPORT"]);
  transport.addRow([]);
  transport.addRow([
    "PO2627/001",
    "Oxford",
    "Mill A",
    "Party A",
    new Date("2026-04-10"),
    "LR-1",
    3,
    "Roadways",
    500,
    "Maker A",
    "Driver A",
    "SF1386",
    new Date("2026-04-10"),
    "",
    "",
    "Issued",
    "High",
    "",
    125,
    62500,
    "tm_preserved",
  ]);
  const production = workbook.addWorksheet("PRODUCTION");
  production.addRow(["PRODUCTION"]);
  production.addRow([]);
  production.addRow([]);
  const active = Array(61).fill("");
  active[0] = "SF1386";
  active[1] = "Maker A";
  active[2] = new Date("2026-04-10");
  active[3] = "3200";
  active[4] = "Carnot";
  active[5] = "Oxford Shirt";
  active[6] = 500;
  active[8] = new Date("2026-04-11");
  active[11] = 1;
  active[12] = 2;
  active[29] = 1.6;
  active[32] = "Cutting";
  active[61] = "wo_active_preserved";
  production.addRow(active);
  const cleared = workbook.addWorksheet("CLEARED LOTS");
  cleared.addRow(["CLEARED"]);
  cleared.addRow([]);
  cleared.addRow([]);
  const done = Array(68).fill("");
  done[0] = "SF1386";
  done[1] = "Maker A";
  done[2] = new Date("2026-04-10");
  done[3] = "3199";
  done[4] = "Carnot";
  done[5] = "Oxford Shirt";
  done[6] = 160;
  done[8] = new Date("2026-04-11");
  done[11] = 1;
  done[29] = 1.6;
  done[32] = "Cleared";
  done[36] = new Date("2026-04-30");
  done[37] = 90;
  done[55] = 90;
  done[60] = new Date("2026-05-01");
  done[61] = 88;
  done[62] = 1;
  done[63] = 1;
  done[68] = "wo_cleared_preserved";
  done[69] = "inward_preserved";
  cleared.addRow(done);
  workbook.addWorksheet("DASHBOARD");
  const sync = workbook.addWorksheet("_CARNOT_SYNC");
  sync.addRow([
    "Kind",
    "Record UUID",
    "Version",
    "Source Sheet",
    "Source Row",
    "Legacy ID",
    "Baseline Hash",
    "Workbook Row Hash",
  ]);
  sync.addRow([
    "fabricOrders",
    "fpo_preserved",
    4,
    "FABRIC ORDERS",
    99,
    "PO2627/001",
    "portal-hash",
    "row-hash",
  ]);
  sync.addRow([
    "transports",
    "tm_preserved",
    2,
    "TRANSPORT",
    99,
    "SF1386:3",
    "portal-hash",
    "row-hash",
  ]);
  sync.addRow([
    "workOrders",
    "wo_active_preserved",
    3,
    "PRODUCTION",
    99,
    "3200",
    "portal-hash",
    "row-hash",
  ]);
  sync.addRow([
    "workOrders",
    "wo_cleared_preserved",
    3,
    "CLEARED LOTS",
    99,
    "3199",
    "portal-hash",
    "row-hash",
  ]);
  sync.addRow([
    "inwards",
    "inward_preserved",
    2,
    "CLEARED LOTS",
    99,
    "3199",
    "portal-hash",
    "row-hash",
  ]);
  const parsed = await parseWorkbook(
    Buffer.from(await workbook.xlsx.writeBuffer()),
    "sync_test",
  );
  assert.equal(parsed.counts.fabricSpecs, 1);
  assert.equal(parsed.counts.fabricOrders, 1);
  assert.equal(parsed.counts.transports, 1);
  assert.equal(parsed.counts.sourceActiveWorkOrders, 1);
  assert.equal(parsed.counts.sourceClearedLots, 1);
  assert.equal(parsed.records.fabricOrders?.[0].fabricValue, 125000);
  assert.equal(parsed.records.fabricOrders?.[0].id, "fpo_preserved");
  assert.equal(parsed.records.transports?.[0].id, "tm_preserved");
  assert.equal(parsed.records.challans?.[0].lines[0].bundles, 3);
  assert.equal(parsed.records.inwards?.[0].totalInward, 90);
  assert.equal(parsed.records.inwards?.[0].id, "inward_preserved");
  assert.equal(
    parsed.records.workOrders?.find((item) => item.woNumber === "3200")?.id,
    "wo_active_preserved",
  );
  assert.equal(
    parsed.records.workOrders?.find((item) => item.woNumber === "3199")?.id,
    "wo_cleared_preserved",
  );
  assert.equal(
    parsed.records.workOrders?.find((item) => item.woNumber === "3199")
      ?.archived,
    true,
  );
  assert.ok(!parsed.issues.some((issue) => issue.message.includes("#DIV/0!")));
});
