export const DEFAULT_PRODUCTION_STAGES = [
  "WO Pending",
  "Sampling",
  "Cutting Not Started",
  "Cutting Completed",
  "Embroidery/Printing",
  "Loading Pending",
  "Under Stitching",
  "Output Started",
  "Kajja Button Running",
  "Stitching Cleared",
  "Washing",
  "Finishing Not Started",
  "Trimming & Checking",
  "Iron/Packing",
  "Goods Ready",
  "Dispatched",
  "Fabric Returned to Supplier",
  "Others",
] as const;

const normalized = (value: string) => value.trim().toLowerCase();

const preCut = new Set([
  "pending",
  "wo pending",
  "sampling",
  "cutting not started",
]);
const ready = new Set(["ready", "finished", "goods ready", "dispatched"]);
const returned = new Set(["fabric returned to supplier"]);
const laterFinishing = new Set([
  "output started",
  "kajja button running",
  "stitching cleared",
  "washing",
  "finishing not started",
  "trimming & checking",
  "iron/packing",
  "ready",
  "goods ready",
  "dispatched",
]);

export function productionStageRules(stage: string) {
  const value = normalized(stage);
  const isOther = value === "others";
  const isReturned = returned.has(value);
  const isPreCut = preCut.has(value) || isOther || isReturned;
  const isCutting = value === "cutting";
  const postCut = !isPreCut && !isCutting;
  const allowInward = ready.has(value);
  return {
    requireConsumption: isCutting || postCut,
    requireRatio: isCutting || postCut,
    requireCuttingDate: postCut,
    showCuttingQuantities: postCut,
    requireCuttingQuantities: postCut,
    showFiDone: laterFinishing.has(value),
    requireGoodsReadyDate: allowInward,
    allowInward,
    requireRemarks: isOther || isReturned,
    description: isReturned
      ? "Record why the fabric is being returned and any quantity or condition issue."
      : allowInward
        ? "Confirm completion details. Garment inward can be recorded now."
        : postCut
          ? "Consumption, size ratio, cutting date, and cut quantities are required for this stage."
          : isCutting
            ? "Approve consumption and enter the planned size ratio before cutting proceeds."
            : "Record the current stage and any useful production note.",
  };
}
